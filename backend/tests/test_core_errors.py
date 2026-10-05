"""Database failures propagate as typed errors, not as anonymous 500s.

``app.core.db.get_client()`` hands controllers a client whose requests raise a
``DatabaseError`` (``app.core.errors``) when PostgREST rejects a request or the
database cannot be reached. Anything else (a bug in our code) is left alone.
``DatabaseError`` derives from ``HTTPException``, so the controllers' existing
``except HTTPException: raise`` clauses let it through, and the handler from
``install_exception_handlers`` answers with a stable ``code``.
"""

from __future__ import annotations

import httpx
import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.core import db as core_db
from app.core.db import DatabaseClient, to_database_error
from app.core.errors import (
    DatabaseConflictError,
    DatabaseError,
    DatabaseUnavailableError,
    install_exception_handlers,
)
from app.database.client import retry_on_disconnect
from tests.fake_supabase import FakeSupabase


def _api_error(code, message="request failed"):
    return APIError({"code": code, "message": message, "details": None, "hint": None})


# ------------------------------------------------------------- translation


def test_a_unique_violation_is_a_conflict():
    err = to_database_error(
        _api_error("23505", 'duplicate key value violates unique constraint "meetings_uniq"'),
        operation="write",
        target="meetings",
    )
    assert isinstance(err, DatabaseConflictError)
    assert (err.status_code, err.code) == (409, "database_conflict")
    assert (err.operation, err.target, err.pg_code) == ("write", "meetings", "23505")


@pytest.mark.parametrize(
    "code", ["57014", "PGRST000", "PGRST003", "08006", "53300", "57P01", 502, 503, "504"]
)
def test_timeouts_and_connection_failures_mean_unavailable(code):
    err = to_database_error(_api_error(code), operation="read", target="classes")
    assert isinstance(err, DatabaseUnavailableError)
    assert (err.status_code, err.code) == (503, "database_unavailable")
    assert err.pg_code == str(code)
    assert err.retryable is False


@pytest.mark.parametrize(
    ("operation", "code"),
    [("read", "database_read_failed"), ("write", "database_write_failed")],
)
def test_other_rejections_are_labelled_with_the_operation(operation, code):
    err = to_database_error(
        _api_error("42703", "column profiles.secret_column does not exist"),
        operation=operation,
        target="profiles",
    )
    assert type(err) is DatabaseError
    assert (err.status_code, err.code) == (500, code)
    assert "secret_column" not in err.detail  # clients never see PostgREST text
    assert "42703" in str(err) and "secret_column" in str(err)  # the logs do


@pytest.mark.parametrize(
    ("exc", "retryable"),
    [
        (httpx.ConnectError("connect failed"), True),
        (httpx.RemoteProtocolError("server disconnected"), True),
        (httpx.ReadError("read failed"), True),
        (httpx.ReadTimeout("timed out"), True),
        (httpx.WriteTimeout("timed out"), False),
        (httpx.PoolTimeout("pool exhausted"), False),
    ],
)
def test_transport_failures_mean_unavailable(exc, retryable):
    err = to_database_error(exc, operation="read", target="classes")
    assert isinstance(err, DatabaseUnavailableError)
    assert err.retryable is retryable


def test_errors_that_did_not_come_from_the_database_are_left_alone():
    assert to_database_error(KeyError("role"), operation="read", target="profiles") is None
    assert to_database_error(HTTPException(status_code=403), operation="read", target="x") is None


# ------------------------------------------------------------------ client


class _Response:
    def __init__(self, data):
        self.data = data


class _Builder:
    """The slice of a postgrest request builder the client adapter relies on."""

    def __init__(self, error=None):
        self.error = error
        self.result = _Response([])

    def select(self, *_columns, **_kw):
        return self

    def insert(self, _row, **_kw):
        return self

    def eq(self, _column, _value):
        return self

    @property
    def not_(self):
        return self

    def execute(self):
        if self.error is not None:
            raise self.error
        return self.result


class _Client:
    def __init__(self, builder):
        self.builder = builder
        self.auth = "auth api"
        self.last_table = None
        self.last_rpc = None

    def table(self, name):
        self.last_table = name
        return self.builder

    def rpc(self, fn, params=None):
        self.last_rpc = (fn, params)
        return self.builder


def test_successful_requests_return_the_library_response():
    raw = _Client(_Builder())
    result = DatabaseClient(raw).table("profiles").select("id").eq("id", "u1").execute()
    assert result is raw.builder.result


def test_a_failed_read_names_the_table_and_keeps_the_cause():
    client = DatabaseClient(_Client(_Builder(error=_api_error("42P01"))))
    with pytest.raises(DatabaseError) as exc:
        client.table("profiles").select("id").not_.eq("role", "student").execute()
    assert (exc.value.operation, exc.value.target) == ("read", "profiles")
    assert isinstance(exc.value.__cause__, APIError)


def test_a_failed_write_is_a_write():
    client = DatabaseClient(_Client(_Builder(error=_api_error("23505"))))
    with pytest.raises(DatabaseConflictError) as exc:
        client.table("meetings").insert({"sequence": 1}).execute()
    assert (exc.value.operation, exc.value.target) == ("write", "meetings")


def test_rpc_calls_are_reads_unless_told_otherwise():
    raw = _Client(_Builder(error=httpx.ConnectError("down")))
    with pytest.raises(DatabaseUnavailableError) as exc:
        DatabaseClient(raw).rpc("messages_inbox", {"p_user": "u1"}).execute()
    assert (exc.value.operation, exc.value.target) == ("read", "messages_inbox")
    assert raw.last_rpc == ("messages_inbox", {"p_user": "u1"})

    with pytest.raises(DatabaseUnavailableError) as exc:
        DatabaseClient(raw).rpc("archive_class", {}, operation="write").execute()
    assert exc.value.operation == "write"


def test_a_failure_while_building_the_request_is_translated_too():
    class _Disconnected(_Client):
        def table(self, name):
            raise httpx.RemoteProtocolError("server disconnected")

    with pytest.raises(DatabaseUnavailableError) as exc:
        DatabaseClient(_Disconnected(_Builder())).table("classes")
    assert exc.value.retryable is True


def test_other_client_attributes_pass_through():
    assert DatabaseClient(_Client(_Builder())).auth == "auth api"


def test_get_client_wraps_the_configured_client(monkeypatch):
    raw = _Client(_Builder())
    monkeypatch.setattr("app.core.db.service_client", raw, raising=False)
    client = core_db.get_client()
    assert isinstance(client, DatabaseClient)
    assert client.table("profiles").select("id").execute() is raw.builder.result
    assert raw.last_table == "profiles"


# ------------------------------------------------------------------ retries


def test_a_retryable_outage_is_retried_once():
    attempts = []

    @retry_on_disconnect()
    def flaky():
        attempts.append(1)
        if len(attempts) == 1:
            raise DatabaseUnavailableError(operation="read", target="classes", retryable=True)
        return "ok"

    assert flaky() == "ok"
    assert len(attempts) == 2


@pytest.mark.parametrize(
    "error",
    [
        DatabaseUnavailableError(operation="read", target="classes"),
        DatabaseError(operation="write", target="classes"),
    ],
    ids=["unavailable-not-retryable", "rejected"],
)
def test_other_database_errors_are_not_retried(error):
    attempts = []

    @retry_on_disconnect()
    def failing():
        attempts.append(1)
        raise error

    with pytest.raises(type(error)):
        failing()
    assert len(attempts) == 1


# ------------------------------------------------------------ role lookup


def test_a_failed_role_lookup_raises_instead_of_reporting_no_role(monkeypatch):
    from app.auth import controller as auth

    raw = _Client(_Builder(error=httpx.ConnectError("down")))
    monkeypatch.setattr("app.core.db.service_client", raw, raising=False)
    auth.invalidate_user_role("user-role-lookup")

    with pytest.raises(DatabaseUnavailableError):
        auth.get_user_role("user-role-lookup")

    # The failure was not cached: the next lookup reads the database again.
    raw.builder.error = None
    raw.builder.result = _Response([{"role": "instructor"}])
    assert auth.get_user_role("user-role-lookup") == "instructor"
    auth.invalidate_user_role("user-role-lookup")


# --------------------------------------------------------------- responses


def _app() -> FastAPI:
    app = FastAPI()
    install_exception_handlers(app)

    @app.get("/unavailable")
    def unavailable():
        raise DatabaseUnavailableError(operation="read", target="classes")

    @app.get("/write-failed")
    def write_failed():
        raise DatabaseError(
            operation="write",
            target="profiles",
            pg_code="23502",
            pg_message='null value in column "email" violates not-null constraint',
        )

    @app.get("/controller")
    def controller_shaped():
        # The shape most controllers use: re-raise HTTPException, turn the rest into a 500.
        try:
            raise DatabaseConflictError(operation="write", target="project_review_tas")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to assign the reviewer")

    @app.get("/bug")
    def bug():
        raise RuntimeError(
            "PostgREST said: duplicate key value violates constraint profiles_email_key"
        )

    @app.get("/http")
    def http():
        raise HTTPException(status_code=409, detail="Profile already exists")

    return app


def test_an_outage_answers_503_with_a_code_and_retry_after():
    res = TestClient(_app(), raise_server_exceptions=False).get("/unavailable")
    assert res.status_code == 503
    assert res.json()["code"] == "database_unavailable"
    assert res.headers["retry-after"] == "5"


def test_a_rejected_write_keeps_postgrest_text_out_of_the_response():
    res = TestClient(_app(), raise_server_exceptions=False).get("/write-failed")
    assert res.status_code == 500
    assert res.json()["code"] == "database_write_failed"
    assert "email" not in res.text


def test_controller_handlers_let_database_errors_through():
    res = TestClient(_app(), raise_server_exceptions=False).get("/controller")
    assert res.status_code == 409
    assert res.json()["code"] == "database_conflict"


def test_bugs_answer_a_fixed_500_that_never_carries_the_exception_text():
    res = TestClient(_app(), raise_server_exceptions=False).get("/bug")
    assert res.status_code == 500
    assert res.json() == {"detail": "Internal server error", "code": "internal_error"}
    assert "duplicate key" not in res.text and "profiles_email_key" not in res.text


def test_ordinary_http_exceptions_are_left_as_they_are():
    res = TestClient(_app(), raise_server_exceptions=False).get("/http")
    assert res.status_code == 409
    assert res.json() == {"detail": "Profile already exists"}


def test_the_real_app_installs_the_handler():
    """Guards against the wiring being dropped from app.main."""
    from app.main import app as main_app

    assert any(
        getattr(handler, "__name__", "") == "_unhandled_exception"
        for exc_type, handler in main_app.exception_handlers.items()
        if exc_type is Exception
    )


# ------------------------------------------------------- lost insert races


def _meeting(meeting_id):
    return {
        "id": meeting_id,
        "class_id": "class-1",
        "project_id": "proj-1",
        "sequence": 1,
        "day_of_week": None,
        "start_time": None,
        "zoom_url": None,
        "duration_minutes": 30,
        "cadence": "weekly",
        "scheduled_at": None,
        "title": None,
    }


def _losing_meeting_insert(fake, winner):
    """The next ``meetings`` insert loses a race: another request's row lands first."""
    real_table = fake.table

    def table(name):
        query = real_table(name)
        if name == "meetings":

            class _Lost:
                def execute(self):
                    if winner is not None:
                        fake.rows("meetings").append(winner)
                    raise _api_error(
                        "23505",
                        'duplicate key value violates unique constraint "meetings_project_seq_uniq"',
                    )

            def insert(*_args, **_kwargs):
                return _Lost()

            query.insert = insert
        return query

    return table


def test_a_lost_meeting_slot_race_returns_the_winning_row(monkeypatch):
    from app.attendance.controller import _get_or_create_meeting

    fake = FakeSupabase(meetings=[])
    monkeypatch.setattr(fake, "table", _losing_meeting_insert(fake, _meeting("m-winner")))
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)

    row = _get_or_create_meeting(core_db.get_client(), "class-1", "proj-1", 1)
    assert row["id"] == "m-winner"


def test_a_conflict_with_no_winning_row_still_raises(monkeypatch):
    from app.attendance.controller import _get_or_create_meeting

    fake = FakeSupabase(meetings=[])
    monkeypatch.setattr(fake, "table", _losing_meeting_insert(fake, None))
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)

    with pytest.raises(DatabaseConflictError):
        _get_or_create_meeting(core_db.get_client(), "class-1", "proj-1", 1)
