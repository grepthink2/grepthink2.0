"""Client selection for the auth views.

``/api/check-email``, ``/api/check-user-exists`` and ``/api/create-user`` read the
service-role client through ``app.core.db`` (the one place tests patch), but unlike
``get_client()`` they never fall back to the anon client: without a service key the
two lookups answer 503 and ``create-user`` provisions through the caller's
JWT-scoped client.

``create-user`` also decides who an account is: it writes the role exactly once (a profile
made by the signup trigger for a Google signup has none until its owner picks), and it takes
the email from the verified token, never from the body.

Every test pins ``app.core.db.service_client`` explicitly so none of them can reach
a real project when a developer's ``.env`` carries a service key.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest
from postgrest.exceptions import APIError

from tests.conftest import header_for, make_token
from tests.fake_supabase import FakeSupabase

USER = "user-abc"  # the `sub` of conftest's auth_header token
OLD = "2020-01-01T00:00:00+00:00"
TAKEN = "taken@ucsc.edu"
SIGNUP = {
    "email": "new@gmail.com",
    "userId": "user-abc",  # the `sub` of conftest's auth_header token
    "userType": "student",
    "firstName": " Ann ",
    "lastName": "Lee",
}


@pytest.fixture
def valid_token() -> str:
    # create-user takes the address from the verified token, so this module's token
    # carries the one it signs up with. (Overrides conftest's; ``auth_header`` follows.)
    return make_token(sub="user-abc", email=SIGNUP["email"])


@pytest.fixture
def fake(monkeypatch):
    """A configured service-role client. The JWT-client fallback must not be used."""
    db = FakeSupabase(
        profiles=[{"id": "u-taken", "email": TAKEN, "edu_email": TAKEN, "role": "student"}]
    )
    db.auth = MagicMock()  # service_client.auth.admin.delete_user(...)
    monkeypatch.setattr("app.core.db.service_client", db, raising=False)
    monkeypatch.setattr(
        "app.auth.views.get_authenticated_client",
        MagicMock(side_effect=AssertionError("JWT client used with a service client configured")),
    )
    return db


@pytest.fixture
def db(fake):
    """``fake`` plus the caller's own profile as the signup trigger leaves it after a Google
    signup: the row exists, the role is for its owner to choose."""
    fake.rows("profiles").append(
        {"id": USER, "email": "ann@gmail.com", "edu_email": None, "role": None, "created_at": OLD}
    )
    return fake


def _profile(db: FakeSupabase, user_id: str = "user-abc") -> dict:
    return next(p for p in db.rows("profiles") if p["id"] == user_id)


@pytest.fixture(autouse=True)
def _fresh_role_cache():
    from app.auth import controller

    controller._role_cache.clear()
    yield
    controller._role_cache.clear()


@pytest.fixture
def no_service_client(monkeypatch):
    monkeypatch.setattr("app.core.db.service_client", None, raising=False)


@pytest.fixture(autouse=True)
def _no_profile_notification():
    # create-user ends by seeding the complete-profile reminder through the
    # notifications module's own client; that is not what these tests cover.
    with patch("app.notifications.controller.ensure_profile_completion_notification") as seeded:
        yield seeded


@pytest.mark.parametrize("path", ["/api/check-email", "/api/check-user-exists"])
def test_lookups_answer_503_without_a_service_client(client, no_service_client, path):
    res = client.post(path, json={"email": TAKEN})
    assert res.status_code == 503
    assert res.json()["detail"] == "Service unavailable"


def test_check_email_reads_the_service_client(client, fake):
    taken = client.post("/api/check-email", json={"email": "Taken@UCSC.edu"})
    assert (taken.status_code, taken.json()) == (200, {"available": False})
    free = client.post("/api/check-email", json={"email": "free@ucsc.edu"})
    assert (free.status_code, free.json()) == (200, {"available": True})


def test_check_user_exists_reads_the_service_client(client, fake):
    known = client.post("/api/check-user-exists", json={"email": "TAKEN@ucsc.edu"})
    assert (known.status_code, known.json()) == (200, {"exists": True})
    unknown = client.post("/api/check-user-exists", json={"email": "nobody@ucsc.edu"})
    assert (unknown.status_code, unknown.json()) == (200, {"exists": False})


def test_create_user_provisions_through_the_service_client(client, auth_header, fake):
    res = client.post("/api/create-user", headers=auth_header, json=SIGNUP)
    assert res.status_code == 200
    assert res.json() == {
        "message": "User record created successfully.",
        "email": "new@gmail.com",
        "role": "student",
    }
    [row] = [p for p in fake.rows("profiles") if p["id"] == "user-abc"]
    assert row == {
        "id": "user-abc",
        "email": "new@gmail.com",
        "role": "student",
        "first_name": "Ann",
        "last_name": "Lee",
    }


def test_create_user_checks_edu_conflicts_on_the_service_client(client, fake):
    res = client.post(
        "/api/create-user", headers=header_for(TAKEN), json={**SIGNUP, "email": TAKEN}
    )
    assert res.status_code == 409
    assert res.json()["detail"] == "This .edu email is already linked to another account."
    fake.auth.admin.delete_user.assert_called_once_with("user-abc")
    assert not [p for p in fake.rows("profiles") if p["id"] == "user-abc"]


def test_create_user_without_a_service_client_uses_the_callers_jwt_client(
    client, auth_header, valid_token, no_service_client
):
    jwt_db = FakeSupabase(profiles=[])
    with patch("app.auth.views.get_authenticated_client", return_value=jwt_db) as make_client:
        res = client.post("/api/create-user", headers=auth_header, json=SIGNUP)
    assert res.status_code == 200
    make_client.assert_called_once_with(valid_token)
    assert [p["id"] for p in jwt_db.rows("profiles")] == ["user-abc"]


def _failing_profile_insert(fake, error):
    """The profile insert fails with ``error`` when it executes."""
    real_table = fake.table

    def table(name):
        query = real_table(name)
        if name == "profiles":

            class _Failing:
                def execute(self):
                    raise error

            def insert(*_args, **_kwargs):
                return _Failing()

            query.insert = insert
        return query

    return table


def test_create_user_answers_401_for_a_deleted_auth_account(client, auth_header, fake, monkeypatch):
    stale = APIError(
        {
            "code": "23503",
            "message": 'insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"',
            "details": None,
            "hint": None,
        }
    )
    monkeypatch.setattr(fake, "table", _failing_profile_insert(fake, stale))
    res = client.post("/api/create-user", headers=auth_header, json=SIGNUP)
    assert res.status_code == 401
    assert res.json()["detail"] == "Auth account not found. Please sign out and sign back in."


def test_create_user_passes_other_database_failures_through(client, auth_header, fake, monkeypatch):
    denied = APIError(
        {
            "code": "42501",
            "message": "permission denied for table profiles",
            "details": None,
            "hint": None,
        }
    )
    monkeypatch.setattr(fake, "table", _failing_profile_insert(fake, denied))
    res = client.post("/api/create-user", headers=auth_header, json=SIGNUP)
    assert res.status_code == 500
    assert res.json()["code"] == "database_write_failed"
    assert "permission denied" not in res.text


@pytest.mark.parametrize("path", ["/api/check-email", "/api/check-user-exists"])
def test_lookups_answer_503_when_the_database_is_unreachable(client, fake, monkeypatch, path):
    def unreachable(_name):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(fake, "table", unreachable)
    res = client.post(path, json={"email": TAKEN})
    assert res.status_code == 503
    assert res.json()["code"] == "database_unavailable"


# ── the role is picked once, by its owner; the email is the token's ─────────────────


def _signup(role: str, email: str = "ann@gmail.com") -> dict:
    return {"email": email, "userId": USER, "userType": role}


ANN = header_for("ann@gmail.com")


def test_create_user_sets_the_role_the_first_time_and_only_then(client, db):
    _profile(db)["role"] = None

    first = client.post("/api/create-user", headers=ANN, json=_signup("instructor"))

    assert first.status_code == 200
    assert first.json()["role"] == "instructor"
    assert _profile(db)["role"] == "instructor"
    pick = next(q for q in db.queries if q["table"] == "profiles" and q["op"] == "update")
    # Conditional on the role still being empty: two racing picks cannot both land.
    assert ("role", "is", None) in pick["filters"]

    second = client.post("/api/create-user", headers=ANN, json=_signup("student"))

    assert second.status_code == 409
    assert second.json()["detail"] == "Profile already exists for this user"
    assert _profile(db)["role"] == "instructor"


def test_create_user_answers_409_when_another_request_picked_first(client, db):
    _profile(db)["role"] = None
    real_table = db.table

    def table(name):
        query = real_table(name)
        if name == "profiles":
            real_update = query.update

            def update(payload):
                if "role" in payload:  # the other request lands between our read and write
                    _profile(db)["role"] = "student"
                return real_update(payload)

            query.update = update
        return query

    with patch.object(db, "table", side_effect=table):
        res = client.post("/api/create-user", headers=ANN, json=_signup("instructor"))

    assert res.status_code == 409
    assert _profile(db)["role"] == "student"


def test_the_first_pick_fills_in_the_edu_email_for_an_edu_login(client, db):
    _profile(db).update({"role": None, "email": "ann@ucsc.edu"})

    res = client.post(
        "/api/create-user",
        headers=header_for("ann@ucsc.edu"),
        json=_signup("student", email=" Ann@UCSC.edu "),
    )

    assert res.status_code == 200
    assert _profile(db)["edu_email"] == "ann@ucsc.edu"


def test_the_first_pick_survives_an_edu_address_someone_else_holds(client, db):
    _profile(db).update({"role": None, "email": "bo@ucsc.edu"})
    from app.core.errors import DatabaseConflictError

    real_table = db.table

    def table(name):
        query = real_table(name)
        if name == "profiles":
            real_update = query.update

            def update(payload):
                if "edu_email" in payload:  # profiles_edu_email_key
                    raise DatabaseConflictError(operation="write", target="profiles")
                return real_update(payload)

            query.update = update
        return query

    with patch.object(db, "table", side_effect=table):
        res = client.post(
            "/api/create-user",
            headers=header_for("bo@ucsc.edu"),
            json=_signup("student", email="bo@ucsc.edu"),
        )

    assert res.status_code == 200
    assert _profile(db)["role"] == "student"
    assert _profile(db)["edu_email"] is None


@pytest.mark.parametrize(
    ("token_email", "body_email"),
    [
        ("ann@gmail.com", "bo@ucsc.edu"),  # a classmate's roster address
        ("ann@gmail.com", ""),
        (None, "ann@gmail.com"),  # a token with no verified address proves nothing
    ],
)
def test_create_user_takes_the_email_from_the_token_not_the_body(
    client, auth_header, db, token_email, body_email
):
    _profile(db)["role"] = None
    headers = header_for(token_email) if token_email else auth_header

    res = client.post(
        "/api/create-user", headers=headers, json=_signup("student", email=body_email)
    )

    assert res.status_code == 403
    assert res.json()["detail"] == "Email mismatch between Token and Body"
    assert _profile(db)["role"] is None
    assert _profile(db)["edu_email"] is None


def test_a_missing_role_is_never_cached(db):
    from app.auth.controller import get_user_role

    _profile(db)["role"] = None
    assert get_user_role(USER) is None

    _profile(db)["role"] = "student"

    # Picking a role must take effect on the very next request, on every instance.
    assert get_user_role(USER) == "student"


def test_a_chosen_role_is_still_cached(db):
    from app.auth.controller import get_user_role

    _profile(db)["role"] = "student"
    assert get_user_role(USER) == "student"
    db.reset_counter()

    assert get_user_role(USER) == "student"
    assert db.executes == 0
