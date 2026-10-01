"""The email outbox engine (app.outbox.controller) and the kinds of email it sends (app.outbox.kinds).

Everything runs against FakeSupabase, with a claim function that does in Python what
``claim_email_outbox`` does in SQL (backend/database/migrations/2026-09-30_email_outbox.sql) and
a stand-in for ``email_transport.send`` that records each message. Time belongs to the tests:
``_now`` and ``_monotonic`` are patched, so leases, backoff and budgets are exact.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from app.classes import invite_email
from app.classes.invite_email import render_class_invite
from app.config import settings
from app.core.db import get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.notifications import controller as notifications
from app.outbox import controller as outbox
from app.outbox import kinds
from app.outbox import preferences as prefs
from app.outbox.kinds import KINDS, Kind, RenderContext, Rendered, get_kind
from app.utils.email import wrap_editor_html_for_email
from app.utils.email_transport import (
    EmailMessage,
    EmailMisconfiguredError,
    EmailNotConfiguredError,
    PermanentEmailError,
    TransientEmailError,
    reference_id_for,
)
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
START = 1_000.0  # the monotonic clock when a test begins

INSTRUCTOR = "11111111-2222-4333-8444-555555555555"
STUDENT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
CLASS = "c1a55000-0000-4000-8000-000000000001"
BATCH = "ba7c0000-0000-4000-8000-000000000001"

INVITE_PAYLOAD = {
    "class_name": "CSE 115C",
    "course_code": "ABCD1234",
    "instructor_name": "Ina Structor",
    "registered": False,
}

TABLES = ("email_outbox", "email_suppressions", "email_preferences", "notifications", "profiles")

#: The columns every inserted outbox row carries, whatever the caller set.
EVERY_COLUMN = {
    "id",
    "kind",
    "to_email",
    "payload",
    "user_id",
    "class_id",
    "batch_id",
    "created_by",
    "dedupe_key",
    "status",
    "attempts",
    "next_attempt_at",
    "locked_until",
    "last_error",
    "provider_reference_id",
    "sent_at",
    "delivered_at",
    "created_at",
    "updated_at",
}

NO_COUNTS = {
    "expanded": 0,
    "claimed": 0,
    "sent": 0,
    "retried": 0,
    "failed": 0,
    "skipped": 0,
    "unavailable": False,
    "paused": False,
}

#: The transport refusing us rather than the email: every other row would fail the same way.
MISCONFIGURED = [
    pytest.param(
        EmailMisconfiguredError("Maileroo refused the request (HTTP 401: invalid key)"),
        id="misconfigured",
    ),
    pytest.param(EmailNotConfiguredError("Email delivery is not configured."), id="not-configured"),
]


# -- time, mail and the database ---------------------------------------------------------------


class Clock:
    """What the outbox reads as the time: a wall clock for timestamps, a monotonic one for budgets."""

    def __init__(self):
        self.wall = NOW
        self.mono = START

    def now(self) -> datetime:
        return self.wall

    def monotonic(self) -> float:
        return self.mono

    def advance(self, seconds: float) -> None:
        self.wall += timedelta(seconds=seconds)
        self.mono += seconds


class Mailbox:
    """Stands in for ``email_transport.send``: records every message and fails on request.

    Each send takes ``seconds_per_send`` on the clock; ``started`` holds when each began, in
    seconds from the start of the test. A send to an address in ``failures`` raises that error;
    any other returns ``ref-<n>``, n counting the messages sent so far.
    """

    def __init__(self, clock: Clock):
        self.clock = clock
        self.attempts: list[EmailMessage] = []
        self.sent: list[EmailMessage] = []
        self.started: list[float] = []
        self.failures: dict[str, Exception] = {}
        self.seconds_per_send = 0.0

    def fail(self, address: str, error: Exception) -> None:
        self.failures[address] = error

    def send(self, message: EmailMessage) -> str:
        self.attempts.append(message)
        self.started.append(self.clock.monotonic() - START)
        self.clock.advance(self.seconds_per_send)
        error = self.failures.get(message.to)
        if error is not None:
            raise error
        self.sent.append(message)
        return f"ref-{len(self.sent)}"


def _ts(value) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def claim_function(db: FakeSupabase, clock: Clock):
    """``claim_email_outbox(p_limit, p_lease_seconds)`` in Python, against ``db``'s rows."""

    def claim(params: dict) -> list[dict]:
        now = clock.now()
        due = [
            row
            for row in db.rows("email_outbox")
            if (row["status"] == "pending" and _ts(row["next_attempt_at"]) <= now)
            or (
                row["status"] == "sending"
                and row["locked_until"] is not None
                and _ts(row["locked_until"]) < now
            )
        ]
        due.sort(key=lambda row: _ts(row["next_attempt_at"]))
        locked_until = (now + timedelta(seconds=params["p_lease_seconds"])).isoformat()
        claimed = []
        for row in due[: max(params["p_limit"], 0)]:
            row.update(
                status="sending",
                attempts=row["attempts"] + 1,
                locked_until=locked_until,
                updated_at=now.isoformat(),
            )
            claimed.append(dict(row))
        return claimed

    return claim


class FailingDb(FakeSupabase):
    """FakeSupabase whose table requests for which ``fails(table, op)`` holds raise ``error(...)``.

    ``error(operation, table)`` builds the ``DatabaseError`` the real client would raise.
    """

    def __init__(self, fails, error, **tables):
        super().__init__(**tables)
        self._fails = fails
        self._error = error

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(name, query._op):
                raise self._error("read" if query._op == "select" else "write", name)
            return execute()

        query.execute = maybe_fail
        return query


class TextBodyDb(FakeSupabase):
    """FakeSupabase whose reads of one table answer text, as postgrest-py hands back a 2xx body
    that is not JSON (a proxy's error page, say)."""

    def __init__(self, text_table: str, **tables):
        super().__init__(**tables)
        self._text_table = text_table

    def table(self, name):
        query = super().table(name)
        if name == self._text_table:
            execute = query.execute

            def text_body():
                result = execute()
                if query._op != "select":
                    return result
                return SimpleNamespace(data="<html>502 Bad Gateway</html>", count=None)

            query.execute = text_body
        return query


def outage(operation, target):
    return DatabaseUnavailableError(
        operation=operation,
        target=target,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


def denied(operation, target):
    return DatabaseError(
        operation=operation,
        target=target,
        pg_code="42501",
        pg_message=f"permission denied for {target}",
    )


def missing(pg_code):
    def make(operation, target):
        return DatabaseError(
            operation=operation,
            target=target,
            pg_code=pg_code,
            pg_message=f"Could not find '{target}' in the schema cache",
        )

    return make


def raising(error: Exception):
    def fail(*args, **kwargs):
        raise error

    return fail


def empty_tables() -> dict[str, list]:
    return {name: [] for name in TABLES}


def install(monkeypatch, clock: Clock, db: FakeSupabase) -> FakeSupabase:
    """Make ``db`` the service client, with ``claim_email_outbox`` running against its rows."""
    db.rpcs.setdefault("claim_email_outbox", claim_function(db, clock))
    monkeypatch.setattr("app.core.db.service_client", db, raising=False)
    return db


@pytest.fixture(autouse=True)
def _settings(monkeypatch):
    """No mail provider whatever the developer's .env holds, and fixed bases for links."""
    for name, value in {
        "MAILEROO_API_KEY": "",
        "SMTP_HOST": "",
        "SMTP_USER": "",
        "SMTP_PASSWORD": "",
        "FRONTEND_URL": "https://app.example.com",
        "PUBLIC_API_URL": "https://api.example.com",
        "EMAIL_UNSUBSCRIBE_SECRET": "unsubscribe-secret-for-tests",
    }.items():
        monkeypatch.setattr(settings, name, value)


@pytest.fixture
def clock(monkeypatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(outbox, "_now", clock.now)
    monkeypatch.setattr(outbox, "_monotonic", clock.monotonic)
    return clock


@pytest.fixture
def mail(monkeypatch, clock) -> Mailbox:
    box = Mailbox(clock)
    monkeypatch.setattr("app.utils.email_transport.send", box.send)
    return box


@pytest.fixture
def db(monkeypatch, clock, mail) -> FakeSupabase:
    return install(monkeypatch, clock, FakeSupabase(**empty_tables()))


# -- rows ------------------------------------------------------------------------------------


def queued(
    to: str = "student@ucsc.edu",
    *,
    kind: str = "class_invite",
    payload: dict | None = None,
    key: str | None = None,
    user_id: str | None = None,
    class_id: str | None = CLASS,
    created_by: str | None = INSTRUCTOR,
) -> outbox.OutboxRow:
    return outbox.OutboxRow(
        kind=kind,
        to_email=to,
        payload=dict(INVITE_PAYLOAD) if payload is None else payload,
        user_id=user_id,
        class_id=class_id,
        batch_id=BATCH,
        created_by=created_by,
        dedupe_key=key,
    )


def stored(db: FakeSupabase, row: outbox.OutboxRow, **columns) -> dict:
    """Put ``row`` straight into the table (pending and due now, unless ``columns`` say otherwise)."""
    record = {**row.as_insert(owned=False, now=NOW), **columns}
    db.rows("email_outbox").append(record)
    return record


def row_of(db: FakeSupabase, row_id: str) -> dict:
    return next(record for record in db.rows("email_outbox") if record["id"] == row_id)


def send_owned(*rows: outbox.OutboxRow, budget: float = 30.0) -> dict[str, str]:
    """Queue ``rows`` leased to the caller, then deliver them: what a request does."""
    client = get_client()
    owned = outbox.enqueue(client, list(rows), owned=True)
    return outbox.deliver_owned_rows(client, owned, budget_seconds=budget)


def deliver(*records: dict, budget: float = 30.0) -> dict[str, str]:
    """Deliver rows already in the table and leased to the caller."""
    return outbox.deliver_owned_rows(
        get_client(), [dict(record) for record in records], budget_seconds=budget
    )


def leased(db: FakeSupabase, row: outbox.OutboxRow, *, attempts: int) -> dict:
    return stored(
        db,
        row,
        status="sending",
        attempts=attempts,
        locked_until=(NOW + timedelta(seconds=outbox.LEASE_SECONDS)).isoformat(),
    )


def note_of(db: FakeSupabase) -> dict:
    """The one notification written, without the id the fake gives it."""
    [note] = db.rows("notifications")
    return {key: value for key, value in note.items() if key != "id"}


def reads_of(db: FakeSupabase, table: str) -> list[dict]:
    return [query for query in db.queries if query["table"] == table]


def outbox_logs(caplog) -> list[tuple[str, str]]:
    """The outbox's log records, as (level, message)."""
    return [
        (record.levelname, record.getMessage())
        for record in caplog.records
        if record.name == "app.outbox.controller"
    ]


def tick(budget: float = 30.0) -> dict:
    return outbox.dispatch_tick(budget_seconds=budget)


def error_logs(caplog) -> list[str]:
    """The outbox's ERROR (and worse) log messages."""
    return [
        record.getMessage()
        for record in caplog.records
        if record.name == "app.outbox.controller" and record.levelno >= logging.ERROR
    ]


# -- OutboxRow.as_insert ---------------------------------------------------------------------


def test_as_insert_writes_every_column_whether_owned_or_not():
    # PostgREST needs the same keys in every object of a bulk write, so nothing is left out.
    row = queued(key="k")
    bare = outbox.OutboxRow(kind="custom_invite", to_email="a@ucsc.edu", payload={})
    for candidate in (row, bare):
        assert set(candidate.as_insert(owned=False, now=NOW)) == EVERY_COLUMN
        assert set(candidate.as_insert(owned=True, now=NOW)) == EVERY_COLUMN


def test_as_insert_trims_and_lower_cases_the_address():
    inserted = queued("  Ann@Example.COM \n").as_insert(owned=False, now=NOW)
    assert inserted["to_email"] == "ann@example.com"


def test_a_row_that_is_not_owned_is_pending_and_due_now():
    row = queued(key="invite:1", user_id=STUDENT)
    assert row.as_insert(owned=False, now=NOW) == {
        "id": row.id,
        "kind": "class_invite",
        "to_email": "student@ucsc.edu",
        "payload": INVITE_PAYLOAD,
        "user_id": STUDENT,
        "class_id": CLASS,
        "batch_id": BATCH,
        "created_by": INSTRUCTOR,
        "dedupe_key": "invite:1",
        "status": "pending",
        "attempts": 0,
        "next_attempt_at": NOW.isoformat(),
        "locked_until": None,
        "last_error": None,
        "provider_reference_id": None,
        "sent_at": None,
        "delivered_at": None,
        "created_at": NOW.isoformat(),
        "updated_at": NOW.isoformat(),
    }


def test_an_owned_row_is_already_leased_to_the_caller():
    row = queued()
    owned = row.as_insert(owned=True, now=NOW)
    assert (owned["status"], owned["attempts"]) == ("sending", 1)
    assert owned["locked_until"] == (NOW + timedelta(seconds=outbox.LEASE_SECONDS)).isoformat()
    # Apart from the lease, it is the same row.
    lease = {"status", "attempts", "locked_until"}
    not_owned = row.as_insert(owned=False, now=NOW)
    assert {k: v for k, v in owned.items() if k not in lease} == {
        k: v for k, v in not_owned.items() if k not in lease
    }


def test_every_row_gets_its_own_uuid():
    first, second = queued(), queued()
    assert first.id != second.id
    assert str(uuid.UUID(first.id)) == first.id


def test_typed_ids_are_written_as_text():
    row = outbox.OutboxRow(
        kind="class_invite",
        to_email="a@ucsc.edu",
        payload={},
        user_id=uuid.UUID(STUDENT),
        class_id=uuid.UUID(CLASS),
        batch_id=uuid.UUID(BATCH),
        created_by=uuid.UUID(INSTRUCTOR),
    )
    inserted = row.as_insert(owned=False, now=NOW)
    assert (inserted["user_id"], inserted["class_id"], inserted["batch_id"]) == (
        STUDENT,
        CLASS,
        BATCH,
    )
    assert inserted["created_by"] == INSTRUCTOR


# -- enqueue ---------------------------------------------------------------------------------


def test_enqueue_inserts_the_rows_and_returns_them(db):
    rows = [queued("a@ucsc.edu"), queued("b@ucsc.edu")]
    inserted = outbox.enqueue(get_client(), rows)
    assert inserted == [row.as_insert(owned=False, now=NOW) for row in rows]
    assert db.rows("email_outbox") == inserted
    assert db.executes == 1


def test_enqueue_owned_rows_are_leased_to_the_caller(db):
    [inserted] = outbox.enqueue(get_client(), [queued()], owned=True)
    assert (inserted["status"], inserted["attempts"]) == ("sending", 1)
    assert inserted["locked_until"] == (NOW + timedelta(seconds=outbox.LEASE_SECONDS)).isoformat()


def test_enqueue_skips_a_dedupe_key_that_is_already_queued(db):
    first = queued("a@ucsc.edu", key="invite:a")
    outbox.enqueue(get_client(), [first])
    again, fresh = queued("a@ucsc.edu", key="invite:a"), queued("b@ucsc.edu", key="invite:b")

    inserted = outbox.enqueue(get_client(), [again, fresh])

    assert [row["id"] for row in inserted] == [fresh.id]
    assert [row["id"] for row in db.rows("email_outbox")] == [first.id, fresh.id]


def test_enqueue_keeps_the_first_of_a_dedupe_key_repeated_in_one_call(db):
    first, repeat, other = (
        queued("a@ucsc.edu", key="k"),
        queued("b@ucsc.edu", key="k"),
        queued("c@ucsc.edu", key="j"),
    )
    inserted = outbox.enqueue(get_client(), [first, repeat, other])
    assert [row["id"] for row in inserted] == [first.id, other.id]
    assert db.executes == 1


def test_enqueue_does_not_send_a_repeated_dedupe_key(db, monkeypatch):
    # Postgres would skip the repeat as well; not sending it keeps the first either way.
    sent: list[list[dict]] = []
    table = db.table

    def recording_table(name):
        query = table(name)
        upsert = query.upsert

        def recording_upsert(payload, **options):
            sent.append(payload)
            return upsert(payload, **options)

        query.upsert = recording_upsert
        return query

    monkeypatch.setattr(db, "table", recording_table)

    outbox.enqueue(
        get_client(),
        [queued("a@ucsc.edu", key="k"), queued("b@ucsc.edu", key="k"), queued("c@ucsc.edu")],
    )

    [payload] = sent
    assert [item["to_email"] for item in payload] == ["a@ucsc.edu", "c@ucsc.edu"]


def test_enqueue_inserts_every_row_without_a_dedupe_key(db):
    # Postgres never matches a NULL key: rows without one are all inserted, next to rows already
    # queued without one too. A repeated key still counts once.
    outbox.enqueue(get_client(), [queued("a@ucsc.edu")])
    rows = [
        queued("b@ucsc.edu"),
        queued("c@ucsc.edu"),
        queued("d@ucsc.edu", key="k"),
        queued("e@ucsc.edu", key="k"),
    ]

    inserted = outbox.enqueue(get_client(), rows, owned=True)

    assert [row["to_email"] for row in inserted] == ["b@ucsc.edu", "c@ucsc.edu", "d@ucsc.edu"]
    assert [row["to_email"] for row in db.rows("email_outbox")] == [
        "a@ucsc.edu",
        "b@ucsc.edu",
        "c@ucsc.edu",
        "d@ucsc.edu",
    ]
    assert all(set(row) == EVERY_COLUMN for row in db.rows("email_outbox"))


def test_enqueue_with_nothing_to_queue_makes_no_request(db):
    assert outbox.enqueue(get_client(), []) == []
    assert db.executes == 0


def test_the_missing_outbox_codes_cover_the_table_and_the_claim_function():
    assert {"PGRST205", "42P01", "PGRST202", "42883"} == outbox.OUTBOX_MISSING_CODES


@pytest.mark.parametrize("pg_code", sorted(outbox.OUTBOX_MISSING_CODES))
def test_enqueue_says_the_outbox_is_unavailable_before_the_migration(
    monkeypatch, clock, caplog, pg_code
):
    install(monkeypatch, clock, FailingDb(lambda table, op: True, missing(pg_code)))
    with (
        caplog.at_level(logging.DEBUG, logger="app.outbox.controller"),
        pytest.raises(outbox.OutboxUnavailable) as caught,
    ):
        outbox.enqueue(get_client(), [queued()])
    assert isinstance(caught.value.__cause__, DatabaseError)
    # Every invite says so until the migration is applied: a warning, not a Sentry event each.
    assert outbox_logs(caplog) == [("WARNING", "email_outbox: table missing, sending directly")]


@pytest.mark.parametrize("make", [outage, denied], ids=["outage", "denied"])
def test_enqueue_lets_any_other_database_error_through(monkeypatch, clock, make):
    install(monkeypatch, clock, FailingDb(lambda table, op: True, make))
    with pytest.raises(DatabaseError) as caught:
        outbox.enqueue(get_client(), [queued()])
    assert caught.value.target == "email_outbox"


# -- deliver_owned_rows: sending -------------------------------------------------------------


def test_an_owned_row_is_sent_and_recorded(db, mail):
    row = queued("Student@UCSC.edu")

    assert send_owned(row) == {row.id: "sent"}

    expected = render_class_invite(**INVITE_PAYLOAD)
    assert mail.sent == [
        EmailMessage(
            to="student@ucsc.edu",
            subject=expected.subject,
            text=expected.text,
            html=expected.html,
            headers={},
            tags={"kind": "class_invite"},
            reference_id=reference_id_for(row.id, 1),
        )
    ]
    record = row_of(db, row.id)
    assert record["status"] == "sent"
    assert record["provider_reference_id"] == "ref-1"
    assert record["sent_at"] == NOW.isoformat()
    assert record["updated_at"] == NOW.isoformat()
    assert record["locked_until"] is None
    assert record["last_error"] is None
    assert record["attempts"] == 1
    assert db.rows("notifications") == []


def test_a_custom_invite_goes_out_with_its_copies(db, mail):
    payload = {
        "subject": "Welcome to CSE 115C",
        "body_text": "Hello everyone",
        "body_html": "<div>Hello everyone</div>",
        "cc": ["ta@ucsc.edu"],
        "bcc": ["prof@ucsc.edu"],
    }
    row = queued(kind="custom_invite", payload=payload)

    assert send_owned(row) == {row.id: "sent"}

    [message] = mail.sent
    assert (message.subject, message.text) == ("Welcome to CSE 115C", "Hello everyone")
    assert message.html == wrap_editor_html_for_email("<div>Hello everyone</div>")
    assert (message.cc, message.bcc) == (("ta@ucsc.edu",), ("prof@ucsc.edu",))
    assert message.tags == {"kind": "custom_invite"}


def test_a_rejected_address_fails_the_row_and_tells_whoever_queued_it(db, mail, caplog):
    row = queued()
    mail.fail("student@ucsc.edu", PermanentEmailError("Maileroo rejected the email (HTTP 400)"))

    with caplog.at_level(logging.DEBUG, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "failed"}

    record = row_of(db, row.id)
    assert record["status"] == "failed"
    assert record["last_error"] == "Maileroo rejected the email (HTTP 400)"
    assert record["locked_until"] is None
    assert record["updated_at"] == NOW.isoformat()
    assert note_of(db) == {
        "user_id": INSTRUCTOR,
        "type": "email_undeliverable",
        "title": "An email couldn't be delivered",
        "body": "Your invite to student@ucsc.edu couldn't be delivered (the mail server refused it).",
        "entity_type": "class",
        "entity_id": CLASS,
    }
    # A mistyped address needs the instructor, not a developer: a warning, no Sentry event.
    assert outbox_logs(caplog) == [
        (
            "WARNING",
            f"email_outbox: refused by the mail server | kind=class_invite row={row.id} "
            "attempts=1 error=Maileroo rejected the email (HTTP 400)",
        )
    ]


def test_a_long_error_is_cut_to_500_characters(db, mail):
    row = queued()
    mail.fail("student@ucsc.edu", PermanentEmailError("x" * 800))
    send_owned(row)
    assert row_of(db, row.id)["last_error"] == "x" * 500


def test_a_failure_with_nobody_to_tell_still_fails_the_row(db, mail):
    row = queued(created_by=None)
    mail.fail("student@ucsc.edu", PermanentEmailError("bad address"))
    assert send_owned(row) == {row.id: "failed"}
    assert db.rows("notifications") == []


def test_a_temporary_failure_on_the_first_attempt_waits_a_minute(db, mail):
    row = queued()
    error = TransientEmailError("Maileroo could not take the email (HTTP 503)")
    mail.fail("student@ucsc.edu", error)

    assert send_owned(row) == {row.id: "queued"}

    record = row_of(db, row.id)
    assert record["status"] == "pending"
    assert record["attempts"] == 1
    assert record["next_attempt_at"] == (NOW + timedelta(seconds=60)).isoformat()
    assert record["locked_until"] is None
    assert record["last_error"] == str(error)
    assert record["updated_at"] == NOW.isoformat()
    assert db.rows("notifications") == []


def test_the_retry_schedule():
    assert outbox.BACKOFF_SECONDS == (60, 300, 1800, 7200, 43200)
    # Every attempt before the last has a wait.
    assert len(outbox.BACKOFF_SECONDS) + 1 == outbox.MAX_ATTEMPTS


@pytest.mark.parametrize(
    ("attempts", "wait"), [(1, 60), (2, 300), (3, 1800), (4, 7200), (5, 43200)]
)
def test_each_retry_waits_longer_than_the_last(db, mail, attempts, wait):
    record = leased(db, queued(), attempts=attempts)
    mail.fail("student@ucsc.edu", TransientEmailError("provider down"))

    assert deliver(record) == {record["id"]: "queued"}

    after = row_of(db, record["id"])
    assert after["next_attempt_at"] == (NOW + timedelta(seconds=wait)).isoformat()
    assert after["attempts"] == attempts


@pytest.mark.parametrize("attempts", [0, None, "junk"])
def test_a_row_without_a_usable_attempt_count_waits_the_first_step(db, mail, attempts):
    record = leased(db, queued(), attempts=attempts)
    mail.fail("student@ucsc.edu", TransientEmailError("provider down"))
    assert deliver(record) == {record["id"]: "queued"}
    assert row_of(db, record["id"])["next_attempt_at"] == (NOW + timedelta(seconds=60)).isoformat()


@pytest.mark.parametrize("attempts", [outbox.MAX_ATTEMPTS, outbox.MAX_ATTEMPTS + 1])
def test_the_last_attempt_gives_up_and_tells_whoever_queued_it(db, mail, caplog, attempts):
    record = leased(db, queued(), attempts=attempts)
    mail.fail("student@ucsc.edu", TransientEmailError("Maileroo could not take the email"))

    with caplog.at_level(logging.ERROR, logger="app.outbox.controller"):
        assert deliver(record) == {record["id"]: "failed"}

    after = row_of(db, record["id"])
    assert (after["status"], after["last_error"]) == (
        "failed",
        "Maileroo could not take the email",
    )
    assert after["locked_until"] is None
    assert note_of(db)["body"] == (
        "Your invite to student@ucsc.edu couldn't be delivered (delivery kept failing)."
    )
    assert (
        f"email_outbox: gave up | kind=class_invite row={record['id']} attempts={attempts}"
        in caplog.text
    )


# -- pauses ----------------------------------------------------------------------------------


def pause_end(clock: Clock) -> str:
    """When a pause that starts now ends."""
    return (clock.now() + timedelta(seconds=outbox.PAUSE_SECONDS)).isoformat()


def test_a_pause_lasts_five_minutes():
    assert outbox.PAUSE_SECONDS == 300


@pytest.mark.parametrize("error", MISCONFIGURED)
def test_a_misconfigured_transport_pauses_the_whole_outbox(db, mail, clock, caplog, error):
    # Rows other requests queued: one due, one coming due during the pause (a retry a minute
    # out), one due after it, one being sent right now.
    due = stored(
        db, queued("due@ucsc.edu"), next_attempt_at=(NOW - timedelta(minutes=1)).isoformat()
    )
    soon = stored(
        db, queued("soon@ucsc.edu"), next_attempt_at=(NOW + timedelta(seconds=70)).isoformat()
    )
    later = stored(
        db, queued("later@ucsc.edu"), next_attempt_at=(NOW + timedelta(minutes=10)).isoformat()
    )
    busy = leased(db, queued("busy@ucsc.edu"), attempts=1)
    due_before, soon_before = dict(due), dict(soon)
    later_before, busy_before = dict(later), dict(busy)
    clock.advance(10)
    rows = [queued(f"{name}@ucsc.edu") for name in "abc"]
    mail.fail("b@ucsc.edu", error)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        outcomes = send_owned(*rows)

    assert outcomes == {rows[0].id: "sent", rows[1].id: "queued", rows[2].id: "queued"}
    assert [message.to for message in mail.attempts] == ["a@ucsc.edu", "b@ucsc.edu"]
    now, until = clock.now().isoformat(), pause_end(clock)
    met = row_of(db, rows[1].id)
    # Its attempt is not spent, and it waits for the pause to end.
    assert (met["status"], met["attempts"], met["locked_until"]) == ("pending", 0, None)
    assert (met["next_attempt_at"], met["updated_at"]) == (until, now)
    assert met["last_error"] == str(error)
    # The row the request had not tried goes back untried, due when the pause ends...
    rest = row_of(db, rows[2].id)
    assert (rest["status"], rest["attempts"], rest["locked_until"]) == ("pending", 0, None)
    assert rest["next_attempt_at"] == until
    # ...and no other pending row comes due before then. The others are left alone.
    assert row_of(db, due["id"]) == {**due_before, "next_attempt_at": until, "updated_at": now}
    assert row_of(db, soon["id"]) == {**soon_before, "next_attempt_at": until, "updated_at": now}
    assert row_of(db, later["id"]) == later_before
    assert row_of(db, busy["id"]) == busy_before
    assert db.rows("notifications") == []
    assert error_logs(caplog) == [f"email_outbox: transport misconfigured, pausing | error={error}"]


def test_a_misconfigured_transport_never_uses_up_the_last_attempt(db, mail):
    record = leased(db, queued(), attempts=outbox.MAX_ATTEMPTS)
    mail.fail("student@ucsc.edu", EmailMisconfiguredError("Maileroo refused the request"))

    assert deliver(record) == {record["id"]: "queued"}

    after = row_of(db, record["id"])
    assert (after["status"], after["attempts"]) == ("pending", outbox.MAX_ATTEMPTS - 1)
    assert db.rows("notifications") == []


@pytest.mark.parametrize("error", MISCONFIGURED)
def test_a_misconfigured_transport_pauses_the_tick(db, mail, clock, caplog, monkeypatch, error):
    monkeypatch.setattr(outbox, "CLAIM_BATCH", 3)
    records = [
        stored(
            db,
            queued(f"{name}@ucsc.edu"),
            attempts=attempts,
            next_attempt_at=(NOW - timedelta(seconds=4 - index)).isoformat(),
        )
        for index, (name, attempts) in enumerate([("a", 0), ("b", 2), ("c", 1), ("d", 0)])
    ]
    later = stored(
        db, queued("later@ucsc.edu"), next_attempt_at=(NOW + timedelta(minutes=10)).isoformat()
    )
    later_before = dict(later)
    mail.fail("b@ucsc.edu", error)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        counts = tick()

    assert counts == {**NO_COUNTS, "claimed": 3, "sent": 1, "retried": 1, "paused": True}
    assert [message.to for message in mail.attempts] == ["a@ucsc.edu", "b@ucsc.edu"]
    until = pause_end(clock)
    met = row_of(db, records[1]["id"])
    # Back to 2: the claim counted a third attempt that the transport never let happen.
    assert (met["status"], met["attempts"], met["locked_until"]) == ("pending", 2, None)
    assert met["next_attempt_at"] == until
    assert met["last_error"] == str(error)
    # Claimed, not tried: back with its attempt uncounted, due when the pause ends.
    rest = row_of(db, records[2]["id"])
    assert (rest["status"], rest["attempts"], rest["locked_until"]) == ("pending", 1, None)
    assert rest["next_attempt_at"] == until
    # Due, not claimed: it waits for the pause too.
    waiting = row_of(db, records[3]["id"])
    assert (waiting["status"], waiting["attempts"], waiting["next_attempt_at"]) == (
        "pending",
        0,
        until,
    )
    assert row_of(db, later["id"]) == later_before
    assert len(reads_of(db, "rpc:claim_email_outbox")) == 1  # nothing more is claimed this tick
    assert db.rows("notifications") == []
    assert error_logs(caplog) == [f"email_outbox: transport misconfigured, pausing | error={error}"]


def test_a_pause_ends_the_tick_even_with_rows_left_to_claim(db, mail, monkeypatch):
    # A row whose lease ran out can still be claimed (the pause holds pending rows only); only
    # ending the run keeps it from meeting the same error, and logging it, in the same run.
    monkeypatch.setattr(outbox, "CLAIM_BATCH", 1)
    stored(db, queued("a@ucsc.edu"), next_attempt_at=(NOW - timedelta(seconds=2)).isoformat())
    expired = stored(
        db,
        queued("b@ucsc.edu"),
        status="sending",
        attempts=1,
        next_attempt_at=(NOW - timedelta(seconds=1)).isoformat(),
        locked_until=(NOW - timedelta(seconds=1)).isoformat(),
    )
    expired_before = dict(expired)
    mail.fail("a@ucsc.edu", EmailMisconfiguredError("Maileroo refused the request"))

    assert tick() == {**NO_COUNTS, "claimed": 1, "retried": 1, "paused": True}

    assert [message.to for message in mail.attempts] == ["a@ucsc.edu"]
    assert row_of(db, expired["id"]) == expired_before


def test_during_a_pause_the_ticks_find_nothing_due(db, mail, clock, caplog):
    for name in "abc":
        stored(db, queued(f"{name}@ucsc.edu"))
        mail.fail(f"{name}@ucsc.edu", EmailMisconfiguredError("Maileroo refused the request"))

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert tick()["paused"] is True
        clock.advance(60)
        assert tick() == NO_COUNTS
        clock.advance(outbox.PAUSE_SECONDS - 60)
        assert tick()["paused"] is True  # the pause is over; the transport still refuses us

    # One attempt and one error per pause, not one per tick.
    assert [message.to for message in mail.attempts] == ["a@ucsc.edu", "a@ucsc.edu"]
    assert (
        error_logs(caplog)
        == ["email_outbox: transport misconfigured, pausing | error=Maileroo refused the request"]
        * 2
    )


CHECK_FAILURES = pytest.mark.parametrize("make", [outage, denied], ids=["outage", "denied"])


@CHECK_FAILURES
def test_a_suppression_list_that_cannot_be_read_pauses_the_outbox(
    monkeypatch, clock, mail, caplog, make
):
    # A grants mistake, or an outage, holds the emails; it never fails them.
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_suppressions", make, **empty_tables()),
    )
    rows = [queued("a@ucsc.edu"), queued("b@ucsc.edu")]

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(*rows) == {rows[0].id: "queued", rows[1].id: "queued"}

    assert mail.attempts == []
    until = pause_end(clock)
    for record in db.rows("email_outbox"):
        assert (record["status"], record["attempts"], record["locked_until"]) == (
            "pending",
            0,
            None,
        )
        assert record["next_attempt_at"] == until
    error = make("read", "email_suppressions")
    assert row_of(db, rows[0].id)["last_error"] == str(error)
    assert db.rows("notifications") == []
    assert error_logs(caplog) == [
        f"email_outbox: cannot check suppressions, pausing | code={error.pg_code} error={error}"
    ]


@CHECK_FAILURES
def test_a_preference_that_cannot_be_read_pauses_the_outbox(
    monkeypatch, clock, mail, caplog, reminder, make
):
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_preferences", make, **empty_tables()),
    )
    first, second = reminder_row(), queued("b@ucsc.edu")

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(first, second) == {first.id: "queued", second.id: "queued"}

    assert mail.attempts == []
    until = pause_end(clock)
    met = row_of(db, first.id)
    assert (met["status"], met["attempts"], met["next_attempt_at"]) == ("pending", 0, until)
    assert row_of(db, second.id)["next_attempt_at"] == until
    error = make("read", "email_preferences")
    assert error_logs(caplog) == [
        f"email_outbox: cannot check preferences, pausing | code={error.pg_code} error={error}"
    ]


def test_a_relevance_check_during_a_database_outage_pauses_the_outbox(
    db, mail, clock, caplog, monkeypatch
):
    error = outage("read", "attendance")
    kind = Kind(
        name="test_timely",
        render=lambda payload, ctx: Rendered(subject="Meeting at 3", text="See you there"),
        still_relevant=raising(error),
        notify_creator_on_failure=True,
    )
    monkeypatch.setitem(KINDS, kind.name, kind)
    row = queued(kind="test_timely", payload={})

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "queued"}

    met = row_of(db, row.id)
    assert (met["status"], met["attempts"], met["next_attempt_at"]) == (
        "pending",
        0,
        pause_end(clock),
    )
    assert mail.attempts == []
    assert db.rows("notifications") == []
    assert error_logs(caplog) == [
        f"email_outbox: cannot check relevance, pausing | code={error.pg_code} error={error}"
    ]


def test_a_pause_holds_a_row_of_an_unknown_kind_too(monkeypatch, clock, mail, caplog):
    # The pause comes first: the row keeps its attempt instead of spending it on a backoff.
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_suppressions", denied, **empty_tables()),
    )
    row = queued(kind="no_such_kind", payload={})

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "queued"}

    record = row_of(db, row.id)
    assert (record["status"], record["attempts"], record["next_attempt_at"]) == (
        "pending",
        0,
        pause_end(clock),
    )
    [logged] = error_logs(caplog)
    assert logged.startswith("email_outbox: cannot check suppressions, pausing")


def test_a_check_that_cannot_read_the_database_pauses_the_tick(monkeypatch, clock, mail, caplog):
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_suppressions", denied, **empty_tables()),
    )
    records = [stored(db, queued(f"{name}@ucsc.edu"), attempts=1) for name in "ab"]

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert tick() == {**NO_COUNTS, "claimed": 2, "retried": 1, "paused": True}

    until = pause_end(clock)
    for record in records:
        after = row_of(db, record["id"])
        # The attempt the claim counted is taken back from both.
        assert (after["status"], after["attempts"], after["next_attempt_at"]) == (
            "pending",
            1,
            until,
        )
    assert mail.attempts == []
    assert len(error_logs(caplog)) == 1


@pytest.mark.parametrize(
    "error",
    [denied("read", "attendance"), ValueError("a bug in the check")],
    ids=["denied", "bug"],
)
def test_a_relevance_check_that_fails_otherwise_holds_only_its_row(
    db, mail, caplog, monkeypatch, error
):
    # One kind's problem: its row waits like any temporary failure, and the others go on.
    kind = Kind(
        name="test_timely",
        render=lambda payload, ctx: Rendered(subject="s", text="t"),
        still_relevant=raising(error),
        notify_creator_on_failure=True,
    )
    monkeypatch.setitem(KINDS, kind.name, kind)
    broken, fine = queued("a@ucsc.edu", kind="test_timely", payload={}), queued("b@ucsc.edu")

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(broken, fine) == {broken.id: "queued", fine.id: "sent"}

    after = row_of(db, broken.id)
    assert (after["status"], after["attempts"]) == ("pending", 1)
    assert after["next_attempt_at"] == (NOW + timedelta(seconds=60)).isoformat()
    assert after["last_error"] == str(error)
    assert error_logs(caplog) == []  # no pause
    [warning] = [r for r in caplog.records if r.getMessage().startswith("email_outbox: will retry")]
    assert warning.exc_info[1] is error  # the traceback goes along
    assert db.rows("notifications") == []


def test_a_relevance_check_that_keeps_failing_is_given_up_on(db, mail, monkeypatch, caplog):
    kind = Kind(
        name="test_timely",
        render=lambda payload, ctx: Rendered(subject="s", text="t"),
        still_relevant=raising(ValueError("a bug in the check")),
        notify_creator_on_failure=True,
    )
    monkeypatch.setitem(KINDS, kind.name, kind)
    record = leased(db, queued(kind="test_timely", payload={}), attempts=outbox.MAX_ATTEMPTS)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert deliver(record) == {record["id"]: "failed"}

    assert row_of(db, record["id"])["status"] == "failed"
    assert note_of(db)["body"] == (
        "Your invite to student@ucsc.edu couldn't be delivered (delivery kept failing)."
    )
    assert error_logs(caplog) == [
        f"email_outbox: gave up | kind=test_timely row={record['id']} attempts=6 "
        "error=a bug in the check"
    ]


@pytest.mark.parametrize(
    ("table", "check"),
    [("email_suppressions", "suppressions"), ("email_preferences", "preferences")],
)
def test_a_shared_table_that_answers_something_unreadable_pauses_the_outbox(
    monkeypatch, clock, mail, caplog, reminder, table, check
):
    # Reading rows out of text raises AttributeError, and every row would meet it: pause, and
    # log the traceback so it reaches Sentry. Failing them all would lose the batch.
    db = install(monkeypatch, clock, TextBodyDb(table, **empty_tables()))
    first, second = reminder_row(), queued("b@ucsc.edu")

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(first, second) == {first.id: "queued", second.id: "queued"}

    assert mail.attempts == []
    until = pause_end(clock)
    for record in db.rows("email_outbox"):
        assert (record["status"], record["attempts"], record["next_attempt_at"]) == (
            "pending",
            0,
            until,
        )
    [logged] = [
        r
        for r in caplog.records
        if r.name == "app.outbox.controller" and r.levelno >= logging.ERROR
    ]
    assert logged.getMessage().startswith(
        f"email_outbox: cannot check {check}, pausing | code=None error="
    )
    assert isinstance(logged.exc_info[1], AttributeError)
    assert db.rows("notifications") == []


# -- deliver_owned_rows: the time budget -----------------------------------------------------


def test_without_time_left_the_rows_are_put_back_unsent(db, mail):
    rows = [queued("a@ucsc.edu"), queued("b@ucsc.edu")]
    client = get_client()
    owned = outbox.enqueue(client, rows, owned=True)
    db.reset_counter()

    assert outbox.deliver_owned_rows(client, owned, budget_seconds=0) == {
        rows[0].id: "queued",
        rows[1].id: "queued",
    }

    assert mail.attempts == []
    for record in db.rows("email_outbox"):
        assert (record["status"], record["attempts"], record["locked_until"]) == (
            "pending",
            0,
            None,
        )
        assert record["next_attempt_at"] == NOW.isoformat()
        assert record["updated_at"] == NOW.isoformat()
    # One update for all of them, and no suppression read for rows that are not sent.
    assert [(query["table"], query["op"]) for query in db.queries] == [("email_outbox", "update")]
    assert db.queries[0]["filters"] == [
        ("id", "in", [rows[0].id, rows[1].id]),
        ("status", "eq", "sending"),
        ("attempts", "eq", 1),
    ]


def test_rows_left_when_time_runs_out_are_put_back_in_one_update(db, mail, clock):
    rows = [queued(f"{name}@ucsc.edu") for name in "abc"]
    client = get_client()
    owned = outbox.enqueue(client, rows, owned=True)
    db.reset_counter()
    mail.seconds_per_send = 3

    outcomes = outbox.deliver_owned_rows(client, owned, budget_seconds=5)

    assert outcomes == {rows[0].id: "sent", rows[1].id: "sent", rows[2].id: "queued"}
    assert [message.to for message in mail.sent] == ["a@ucsc.edu", "b@ucsc.edu"]
    last = row_of(db, rows[2].id)
    assert (last["status"], last["attempts"], last["locked_until"]) == ("pending", 0, None)
    assert last["updated_at"] == clock.now().isoformat()
    assert [(query["table"], query["op"]) for query in db.queries] == [
        ("email_suppressions", "select"),
        ("email_outbox", "update"),  # a sent
        ("email_outbox", "update"),  # b sent
        ("email_outbox", "update"),  # c put back
    ]


def test_a_request_with_a_long_budget_starts_no_send_its_lease_cannot_cover(db, mail):
    rows = [queued(f"{name}@ucsc.edu") for name in "abcde"]
    mail.seconds_per_send = 50

    outcomes = send_owned(*rows, budget=1000)

    # The lease runs 300 s from the insert, and no send starts in its last 120 s.
    assert mail.started == [0, 50, 100, 150]
    assert outcomes == {**{row.id: "sent" for row in rows[:4]}, rows[4].id: "queued"}
    last = row_of(db, rows[4].id)
    assert (last["status"], last["attempts"], last["locked_until"]) == ("pending", 0, None)


def test_a_tick_with_a_long_budget_starts_no_send_a_lease_cannot_cover(db, mail):
    for name in "abcdef":
        stored(db, queued(f"{name}@ucsc.edu"))
    mail.seconds_per_send = 50

    counts = tick(budget=1000)

    # Claimed at 0, the first batch starts sends until 180 s; the two left go back and the next
    # claim (at 200 s, a new lease) sends them.
    assert mail.started == [0, 50, 100, 150, 200, 250]
    assert counts == {**NO_COUNTS, "claimed": 8, "sent": 6}
    assert len(reads_of(db, "rpc:claim_email_outbox")) == 3  # 6 rows, 2 rows, nothing
    assert outbox.LEASE_SECONDS - outbox.SEND_MARGIN_SECONDS == 180


def test_rows_a_tick_puts_back_take_one_update_per_attempt_count(db, mail):
    records = [
        stored(
            db,
            queued(f"{name}@ucsc.edu"),
            attempts=attempts,
            next_attempt_at=(NOW - timedelta(seconds=5 - index)).isoformat(),
        )
        for index, (name, attempts) in enumerate([("a", 0), ("b", 0), ("c", 2), ("d", 0), ("e", 0)])
    ]
    mail.seconds_per_send = 3

    assert tick(budget=5) == {**NO_COUNTS, "claimed": 5, "sent": 2}

    put_backs = [
        query["filters"]
        for query in db.queries
        if query["op"] == "update" and query["filters"][0][:2] == ("id", "in")
    ]
    # Each update also checks the attempts the rows were leased at (the claim counted one).
    assert put_backs == [
        [("id", "in", [records[2]["id"]]), ("status", "eq", "sending"), ("attempts", "eq", 3)],
        [
            ("id", "in", [records[3]["id"], records[4]["id"]]),
            ("status", "eq", "sending"),
            ("attempts", "eq", 1),
        ],
    ]
    assert [row_of(db, record["id"])["attempts"] for record in records[2:]] == [2, 0, 0]


def test_putting_owned_rows_back_uncounts_their_attempt_and_skips_rows_not_leased(db, mail, caplog):
    twice = leased(db, queued("a@ucsc.edu"), attempts=2)
    waiting = stored(db, queued("b@ucsc.edu"))  # pending: never leased to this caller
    waiting_before = dict(waiting)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        outcomes = deliver(twice, waiting, budget=0)

    assert outcomes == {twice["id"]: "queued", waiting["id"]: "queued"}
    after = row_of(db, twice["id"])
    assert (after["status"], after["attempts"]) == ("pending", 1)  # 2 - 1, not 0
    assert row_of(db, waiting["id"]) == waiting_before
    assert (
        f"email_outbox: not putting back a row that was not leased | row={waiting['id']} "
        "status=pending"
    ) in caplog.text


def test_putting_rows_back_leaves_a_row_someone_else_finished_alone(db, mail):
    row = queued()
    client = get_client()
    owned = outbox.enqueue(client, [row], owned=True)
    row_of(db, row.id)["status"] = "cancelled"

    assert outbox.deliver_owned_rows(client, owned, budget_seconds=0) == {row.id: "queued"}
    assert row_of(db, row.id)["status"] == "cancelled"


def test_a_failure_to_put_rows_back_is_logged_not_raised(monkeypatch, clock, mail, caplog):
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_outbox" and op == "update", outage),
    )
    row = queued()
    with caplog.at_level(logging.ERROR, logger="app.outbox.controller"):
        assert send_owned(row, budget=0) == {row.id: "queued"}
    # Still leased: the dispatcher takes it once the lease runs out.
    assert row_of(db, row.id)["status"] == "sending"
    assert "email_outbox: could not put rows back, their lease will run out | rows=1" in (
        caplog.text
    )


def test_nothing_to_deliver_touches_nothing(db, mail):
    assert outbox.deliver_owned_rows(get_client(), [], budget_seconds=30) == {}
    assert db.executes == 0


# -- deliver_owned_rows: suppressions, preferences, relevance ---------------------------------


@pytest.mark.parametrize(
    ("reason", "said"),
    [
        ("bounced", "the address bounced before"),
        ("rejected", "the address was rejected before"),
        ("complained", "the address reported our email as spam"),
    ],
)
def test_a_suppressed_address_is_skipped_and_whoever_queued_it_is_told_why(db, mail, reason, said):
    db.rows("email_suppressions").append({"email": "student@ucsc.edu", "reason": reason})
    row = queued("Student@UCSC.edu")

    assert send_owned(row) == {row.id: "skipped"}

    assert mail.attempts == []
    record = row_of(db, row.id)
    assert (record["status"], record["last_error"]) == ("skipped", f"suppressed: {reason}")
    assert record["locked_until"] is None
    assert record["updated_at"] == NOW.isoformat()
    assert note_of(db)["body"] == f"Your invite to student@ucsc.edu couldn't be delivered ({said})."


def test_suppressed_copies_are_left_out(db, mail, caplog):
    db.rows("email_suppressions").extend(
        [
            {"email": "gone@ucsc.edu", "reason": "bounced"},
            {"email": "prof@ucsc.edu", "reason": "complained"},
        ]
    )
    payload = {
        "subject": "Welcome",
        "body_text": "Hello",
        "body_html": None,
        "cc": ["TA@ucsc.edu", "Gone@ucsc.edu"],
        "bcc": ["Prof@UCSC.edu", "log@ucsc.edu"],
    }
    row = queued(kind="custom_invite", payload=payload)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "sent"}

    [message] = mail.sent
    assert (message.cc, message.bcc) == (("TA@ucsc.edu",), ("log@ucsc.edu",))
    # One read covers the copies too.
    [read] = reads_of(db, "email_suppressions")
    assert read["filters"] == [
        (
            "email",
            "in",
            ["gone@ucsc.edu", "log@ucsc.edu", "prof@ucsc.edu", "student@ucsc.edu", "ta@ucsc.edu"],
        )
    ]
    # The log says how many, never who.
    assert outbox_logs(caplog) == [
        (
            "WARNING",
            f"email_outbox: left suppressed copies out | kind=custom_invite row={row.id} count=2",
        )
    ]


def test_a_suppressed_recipient_skips_the_email_whatever_its_copies(db, mail):
    db.rows("email_suppressions").append({"email": "student@ucsc.edu", "reason": "complained"})
    payload = {"subject": "Welcome", "body_text": "Hello", "cc": ["ta@ucsc.edu"], "bcc": []}
    row = queued(kind="custom_invite", payload=payload)

    assert send_owned(row) == {row.id: "skipped"}
    assert mail.attempts == []


def test_suppressions_are_read_once_for_the_whole_batch(db, mail):
    db.rows("email_suppressions").append({"email": "b@ucsc.edu", "reason": "bounced"})
    rows = [queued(f"{name}@ucsc.edu") for name in "abc"]
    client = get_client()
    owned = outbox.enqueue(client, rows, owned=True)
    db.reset_counter()

    outcomes = outbox.deliver_owned_rows(client, owned, budget_seconds=30)

    assert outcomes == {rows[0].id: "sent", rows[1].id: "skipped", rows[2].id: "sent"}
    [read] = reads_of(db, "email_suppressions")
    assert read["filters"] == [("email", "in", ["a@ucsc.edu", "b@ucsc.edu", "c@ucsc.edu"])]


@pytest.fixture
def reminder(monkeypatch) -> list[RenderContext]:
    """A throwaway kind in the "reminders" category; the list collects each render's context."""
    contexts: list[RenderContext] = []

    def render(payload, ctx):
        contexts.append(ctx)
        return Rendered(subject="TSR 3 closes tonight", text="Submit it before midnight.")

    kind = Kind(name="test_reminder", render=render, category="reminders")
    monkeypatch.setitem(KINDS, kind.name, kind)
    return contexts


def reminder_row(user_id: str | None = STUDENT) -> outbox.OutboxRow:
    return queued(kind="test_reminder", payload={}, user_id=user_id, created_by=None)


def test_a_category_email_someone_switched_off_is_skipped(db, mail, reminder):
    db.rows("email_preferences").append(
        {"user_id": STUDENT, "category": "reminders", "enabled": False}
    )
    row = reminder_row()

    assert send_owned(row) == {row.id: "skipped"}

    assert mail.attempts == []
    assert reminder == []  # not even rendered
    record = row_of(db, row.id)
    assert (record["status"], record["last_error"]) == ("skipped", "preference")
    assert db.rows("notifications") == []


def test_a_category_email_offers_one_click_unsubscribe(db, mail, reminder):
    row = reminder_row()
    page, one_click = prefs.unsubscribe_links(STUDENT, "reminders")
    assert page.startswith("https://app.example.com/unsubscribe?token=")
    assert one_click.startswith("https://api.example.com/api/email/unsubscribe?token=")

    assert send_owned(row) == {row.id: "sent"}

    [message] = mail.sent
    assert message.headers == {
        "List-Unsubscribe": f"<{one_click}>, <{page}>",
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    }
    assert reminder == [RenderContext(unsubscribe_url=page)]
    assert message.tags == {"kind": "test_reminder"}


def test_without_a_public_api_url_only_the_page_link_is_offered(db, mail, reminder, monkeypatch):
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "")
    row = reminder_row()
    page, one_click = prefs.unsubscribe_links(STUDENT, "reminders")
    assert one_click is None

    assert send_owned(row) == {row.id: "sent"}

    assert mail.sent[0].headers == {"List-Unsubscribe": f"<{page}>"}
    assert reminder == [RenderContext(unsubscribe_url=page)]


def test_a_category_email_to_an_address_without_an_account_has_no_unsubscribe_link(
    db, mail, reminder
):
    row = reminder_row(user_id=None)
    assert send_owned(row) == {row.id: "sent"}
    assert mail.sent[0].headers == {}
    assert reminder == [RenderContext(unsubscribe_url=None)]


def test_transactional_email_ignores_preferences_and_has_no_unsubscribe_link(db, mail):
    db.rows("email_preferences").extend(
        {"user_id": STUDENT, "category": category, "enabled": False}
        for category in prefs.CATEGORIES
    )
    row = queued(user_id=STUDENT)

    assert send_owned(row) == {row.id: "sent"}

    assert mail.sent[0].headers == {}
    assert reads_of(db, "email_preferences") == []


@pytest.mark.parametrize(("relevant", "outcome"), [(True, "sent"), (False, "skipped")])
def test_an_email_that_is_no_longer_relevant_is_skipped(db, mail, monkeypatch, relevant, outcome):
    asked = []

    def still_relevant(client, row):
        asked.append(row["id"])
        return relevant

    kind = Kind(
        name="test_timely",
        render=lambda payload, ctx: Rendered(subject="Meeting at 3", text="See you there"),
        still_relevant=still_relevant,
        notify_creator_on_failure=True,
    )
    monkeypatch.setitem(KINDS, kind.name, kind)
    row = queued(kind="test_timely", payload={})

    assert send_owned(row) == {row.id: outcome}

    assert asked == [row.id]
    assert len(mail.sent) == (1 if relevant else 0)
    if not relevant:
        record = row_of(db, row.id)
        assert (record["status"], record["last_error"]) == ("skipped", "no longer relevant")
    assert db.rows("notifications") == []


# -- deliver_owned_rows: what goes wrong -----------------------------------------------------


def test_an_unknown_kind_waits_for_a_deploy_that_knows_it(db, mail, caplog):
    # A rollback past the kind's release must not throw its rows away.
    row = queued(kind="no_such_kind", payload={})

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "queued"}

    assert mail.attempts == []
    record = row_of(db, row.id)
    assert (record["status"], record["attempts"], record["last_error"]) == (
        "pending",
        1,
        "unknown kind",
    )
    assert record["next_attempt_at"] == (NOW + timedelta(seconds=60)).isoformat()
    assert error_logs(caplog) == [f"email_outbox: unknown kind | kind=no_such_kind row={row.id}"]


def test_an_unknown_kind_is_given_up_on_after_the_last_attempt(db, mail):
    record = leased(db, queued(kind="no_such_kind", payload={}), attempts=outbox.MAX_ATTEMPTS)

    assert deliver(record) == {record["id"]: "failed"}

    after = row_of(db, record["id"])
    assert (after["status"], after["last_error"]) == ("failed", "unknown kind")
    assert db.rows("notifications") == []  # without its kind, nobody knows whom to tell


def test_a_payload_that_cannot_be_rendered_fails_the_row(db, mail, caplog):
    row = queued(payload={"class_name": "CSE 115C"})  # the other fields are missing

    with caplog.at_level(logging.ERROR, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "failed"}

    assert mail.attempts == []
    record = row_of(db, row.id)
    assert (record["status"], record["last_error"]) == ("failed", "KeyError")
    assert db.rows("notifications") == []
    [logged] = [r for r in caplog.records if r.name == "app.outbox.controller" and r.exc_info]
    assert logged.levelno == logging.ERROR
    assert isinstance(logged.exc_info[1], KeyError)


def test_an_unexpected_transport_error_fails_the_row(db, mail):
    row = queued()
    mail.fail("student@ucsc.edu", ValueError("not an email error"))

    assert send_owned(row) == {row.id: "failed"}

    record = row_of(db, row.id)
    assert (record["status"], record["last_error"]) == ("failed", "ValueError")
    assert db.rows("notifications") == []


def test_one_bad_row_does_not_stop_the_others(db, mail):
    rows = [
        queued("a@ucsc.edu", kind="no_such_kind", payload={}),
        queued("b@ucsc.edu", payload={}),
        queued("c@ucsc.edu"),
    ]
    assert send_owned(*rows) == {rows[0].id: "queued", rows[1].id: "failed", rows[2].id: "sent"}
    assert [message.to for message in mail.sent] == ["c@ucsc.edu"]


def test_a_status_write_that_fails_after_sending_is_logged_not_raised(
    monkeypatch, clock, mail, caplog
):
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_outbox" and op == "update", outage),
    )
    row = queued()

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "sent"}

    assert len(mail.sent) == 1
    # Tried twice, then left leased: when the lease runs out the dispatcher takes it again.
    assert row_of(db, row.id)["status"] == "sending"
    status = f"kind=class_invite row={row.id} status=sent"
    assert [entry for entry in outbox_logs(caplog) if "could not record" in entry[1]] == [
        ("WARNING", f"email_outbox: could not record the outcome, trying again | {status}"),
        ("ERROR", f"email_outbox: could not record the outcome | {status}"),
    ]


def test_a_sent_write_that_fails_is_tried_once_more(monkeypatch, clock, mail, caplog):
    first_update = iter([True])
    db = install(
        monkeypatch,
        clock,
        FailingDb(
            lambda table, op: (
                table == "email_outbox" and op == "update" and next(first_update, False)
            ),
            outage,
        ),
    )
    row = queued()

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        assert send_owned(row) == {row.id: "sent"}

    record = row_of(db, row.id)
    assert (record["status"], record["provider_reference_id"]) == ("sent", "ref-1")
    assert "email_outbox: could not record the outcome, trying again" in caplog.text
    assert error_logs(caplog) == []


def test_nobody_is_told_of_a_failure_that_could_not_be_recorded(monkeypatch, clock, mail):
    # The row will be tried again, and whoever queued it hears of it once it is recorded.
    db = install(
        monkeypatch,
        clock,
        FailingDb(lambda table, op: table == "email_outbox" and op == "update", outage),
    )
    row = queued()
    mail.fail("student@ucsc.edu", PermanentEmailError("bad address"))

    assert send_owned(row) == {row.id: "failed"}
    assert db.rows("notifications") == []


def test_every_status_write_stamps_updated_at(db, mail, clock):
    db.rows("email_suppressions").append({"email": "skip@ucsc.edu", "reason": "bounced"})
    names = ["sent", "retry", "fail", "skip", "unknown", "paused", "untried"]
    rows = [
        queued(f"{name}@ucsc.edu")
        if name != "unknown"
        else queued(f"{name}@ucsc.edu", kind="no_such_kind", payload={})
        for name in names
    ]
    client = get_client()
    owned = outbox.enqueue(client, rows, owned=True)  # stamped NOW
    clock.advance(30)
    mail.fail("retry@ucsc.edu", TransientEmailError("provider down"))
    mail.fail("fail@ucsc.edu", PermanentEmailError("bad address"))
    mail.fail("paused@ucsc.edu", EmailMisconfiguredError("Maileroo refused the request"))

    outcomes = outbox.deliver_owned_rows(client, owned, budget_seconds=30)

    assert [outcomes[row.id] for row in rows] == [
        "sent",
        "queued",
        "failed",
        "skipped",
        "queued",
        "queued",
        "queued",
    ]
    later = (NOW + timedelta(seconds=30)).isoformat()
    assert {r["to_email"]: r["updated_at"] for r in db.rows("email_outbox")} == {
        f"{name}@ucsc.edu": later for name in names
    }


@pytest.mark.parametrize(
    "error",
    [
        TransientEmailError("provider down"),
        PermanentEmailError("bad address"),
        EmailMisconfiguredError("Maileroo refused the request"),
    ],
    ids=["transient", "permanent", "misconfigured"],
)
def test_a_failure_never_overwrites_a_row_finished_elsewhere_meanwhile(
    db, mail, monkeypatch, error
):
    # The lease ran out mid-send and another dispatcher sent the row, say. Writing "pending"
    # over that would send it again.
    row = queued()
    client = get_client()
    owned = outbox.enqueue(client, [row], owned=True)

    def send(message):
        row_of(db, row.id)["status"] = "sent"
        raise error

    monkeypatch.setattr("app.utils.email_transport.send", send)
    outbox.deliver_owned_rows(client, owned, budget_seconds=30)

    assert row_of(db, row.id)["status"] == "sent"
    assert db.rows("notifications") == []


@pytest.mark.parametrize(
    "error",
    [
        TransientEmailError("timed out"),
        PermanentEmailError("bad address"),
        EmailMisconfiguredError("Maileroo refused the request"),
    ],
    ids=["transient", "permanent", "misconfigured"],
)
def test_a_worker_whose_lease_ran_out_mid_send_changes_nothing(db, mail, clock, monkeypatch, error):
    # Worker A's send outlives its lease and worker B claims the row again: a new lease, so
    # attempts 2. Then A's send fails. Nothing A writes may undo B's lease.
    record = stored(db, queued())
    claim = db.rpcs["claim_email_outbox"]
    taken_over: list[dict] = []

    def slow_send(message):
        clock.advance(outbox.LEASE_SECONDS + 1)
        taken_over.extend(claim({"p_limit": 10, "p_lease_seconds": outbox.LEASE_SECONDS}))
        raise error

    monkeypatch.setattr("app.utils.email_transport.send", slow_send)

    tick()

    [lease_b] = taken_over
    after = row_of(db, record["id"])
    assert (after["status"], after["attempts"], after["locked_until"]) == (
        "sending",
        2,
        lease_b["locked_until"],
    )
    assert after["last_error"] is None
    assert db.rows("notifications") == []


def test_putting_back_with_a_stale_lease_leaves_the_new_lease_alone(db, mail):
    record = leased(db, queued(), attempts=2)  # as worker B leased it
    before = dict(record)
    stale = {**record, "attempts": 1}  # worker A's copy, from the lease that ran out

    assert deliver(stale, budget=0) == {record["id"]: "queued"}

    assert row_of(db, record["id"]) == before


def test_a_send_is_recorded_even_when_the_row_changed_meanwhile(db, monkeypatch):
    # The email did go out, whatever else happened to the row.
    row = queued()
    client = get_client()
    owned = outbox.enqueue(client, [row], owned=True)

    def send(message):
        row_of(db, row.id)["status"] = "cancelled"
        return "ref-mine"

    monkeypatch.setattr("app.utils.email_transport.send", send)

    assert outbox.deliver_owned_rows(client, owned, budget_seconds=30) == {row.id: "sent"}
    record = row_of(db, row.id)
    assert (record["status"], record["provider_reference_id"]) == ("sent", "ref-mine")


def test_the_outbox_never_logs_a_subject_or_a_body(db, mail, monkeypatch, caplog):
    kind = Kind(
        name="test_private",
        render=lambda payload, ctx: Rendered(
            subject="SUBJECT Ann Lee", text="BODY Ann Lee", html="<p>HTML Ann Lee</p>"
        ),
        notify_creator_on_failure=True,
    )
    monkeypatch.setitem(KINDS, kind.name, kind)
    rows = [queued(f"{name}@ucsc.edu", kind="test_private") for name in "abcde"]
    leased_rows = [leased(db, row, attempts=1) for row in rows]
    leased_rows[3]["attempts"] = outbox.MAX_ATTEMPTS
    mail.fail("b@ucsc.edu", TransientEmailError("provider down"))
    mail.fail("c@ucsc.edu", PermanentEmailError("bad address"))
    mail.fail("d@ucsc.edu", TransientEmailError("provider down"))
    mail.fail("e@ucsc.edu", EmailMisconfiguredError("Maileroo refused the request"))

    with caplog.at_level(logging.DEBUG):
        deliver(*leased_rows)

    assert caplog.records  # it did log
    assert "Ann Lee" not in caplog.text


# -- dispatch_tick ---------------------------------------------------------------------------


def test_a_tick_claims_only_what_is_due(db, mail):
    due = stored(
        db,
        queued("due@ucsc.edu"),
        next_attempt_at=(NOW - timedelta(minutes=1)).isoformat(),
    )
    later = stored(
        db,
        queued("later@ucsc.edu"),
        next_attempt_at=(NOW + timedelta(minutes=5)).isoformat(),
    )
    done = stored(
        db,
        queued("done@ucsc.edu"),
        status="sent",
        attempts=1,
        sent_at=(NOW - timedelta(hours=1)).isoformat(),
        next_attempt_at=(NOW - timedelta(hours=1)).isoformat(),
    )
    later_before, done_before = dict(later), dict(done)

    assert tick() == {**NO_COUNTS, "claimed": 1, "sent": 1}

    assert [message.to for message in mail.sent] == ["due@ucsc.edu"]
    assert row_of(db, due["id"])["status"] == "sent"
    assert row_of(db, later["id"]) == later_before
    assert row_of(db, done["id"]) == done_before


def test_a_tick_claims_with_the_batch_size_and_the_lease(db, mail):
    tick()
    [claim] = reads_of(db, "rpc:claim_email_outbox")
    assert claim["filters"] == [{"p_limit": outbox.CLAIM_BATCH, "p_lease_seconds": 300}]
    # The lease outlives the slowest send (an SMTP send can take ~90 s of timeouts).
    assert (outbox.CLAIM_BATCH, outbox.LEASE_SECONDS) == (10, 300)


def test_a_row_whose_lease_ran_out_is_claimed_again(db, mail):
    expired = stored(
        db,
        queued("expired@ucsc.edu"),
        status="sending",
        attempts=2,
        locked_until=(NOW - timedelta(seconds=1)).isoformat(),
    )
    held = stored(
        db,
        queued("held@ucsc.edu"),
        status="sending",
        attempts=1,
        locked_until=(NOW + timedelta(seconds=30)).isoformat(),
    )
    held_before = dict(held)
    mail.fail("expired@ucsc.edu", TransientEmailError("provider down"))

    assert tick() == {**NO_COUNTS, "claimed": 1, "retried": 1}

    after = row_of(db, expired["id"])
    # The claim counted this third attempt, so the wait is the third step.
    assert (after["status"], after["attempts"]) == ("pending", 3)
    assert after["next_attempt_at"] == (NOW + timedelta(seconds=1800)).isoformat()
    assert row_of(db, held["id"]) == held_before


def test_each_attempt_is_sent_with_its_own_reference_id(db, mail, clock):
    record = stored(db, queued())
    mail.fail("student@ucsc.edu", TransientEmailError("provider down"))
    assert tick() == {**NO_COUNTS, "claimed": 1, "retried": 1}
    clock.advance(60)
    del mail.failures["student@ucsc.edu"]
    assert tick() == {**NO_COUNTS, "claimed": 1, "sent": 1}

    first, second = (message.reference_id for message in mail.attempts)
    assert (first, second) == (
        reference_id_for(record["id"], 1),
        reference_id_for(record["id"], 2),
    )
    assert first != second
    assert all(re.fullmatch(r"[0-9a-f]{24}", reference) for reference in (first, second))
    assert row_of(db, record["id"])["provider_reference_id"] == "ref-1"


def test_a_tick_that_runs_out_of_time_puts_the_rest_back(db, mail, clock):
    records = [
        stored(
            db,
            queued(f"{name}@ucsc.edu"),
            attempts=attempts,
            next_attempt_at=(NOW - timedelta(seconds=3 - index)).isoformat(),
        )
        for index, (name, attempts) in enumerate([("a", 0), ("b", 0), ("c", 2)])
    ]
    mail.seconds_per_send = 3

    assert tick(budget=5) == {**NO_COUNTS, "claimed": 3, "sent": 2}

    assert [message.to for message in mail.sent] == ["a@ucsc.edu", "b@ucsc.edu"]
    last = row_of(db, records[2]["id"])
    # attempts back to what it was before the claim counted an attempt that never happened
    assert (last["status"], last["attempts"], last["locked_until"]) == ("pending", 2, None)
    assert last["updated_at"] == clock.now().isoformat()
    # Only a pause delays anything: it is due as it was.
    assert (
        last["next_attempt_at"]
        == records[2]["next_attempt_at"]
        == (NOW - timedelta(seconds=1)).isoformat()
    )


def test_a_tick_counts_what_happened(db, mail):
    db.rows("email_suppressions").append({"email": "skip@ucsc.edu", "reason": "complained"})
    for name in ("sent", "retry", "fail", "skip"):
        stored(db, queued(f"{name}@ucsc.edu"))
    mail.fail("retry@ucsc.edu", TransientEmailError("provider down"))
    mail.fail("fail@ucsc.edu", PermanentEmailError("bad address"))

    assert tick() == {
        **NO_COUNTS,
        "claimed": 4,
        "sent": 1,
        "retried": 1,
        "failed": 1,
        "skipped": 1,
    }


def test_a_tick_claims_batch_after_batch_until_nothing_is_due(db, mail, monkeypatch):
    monkeypatch.setattr(outbox, "CLAIM_BATCH", 2)
    for index in range(5):
        stored(db, queued(f"s{index}@ucsc.edu"))

    assert tick() == {**NO_COUNTS, "claimed": 5, "sent": 5}

    claims = reads_of(db, "rpc:claim_email_outbox")
    assert len(claims) == 4  # 2, 2, 1, then nothing
    assert len(reads_of(db, "email_suppressions")) == 3  # one per batch


def test_a_tick_with_nothing_due_claims_once(db, mail):
    assert tick() == NO_COUNTS
    assert [query["table"] for query in db.queries] == ["rpc:claim_email_outbox"]


def test_a_tick_without_time_claims_nothing(db, mail):
    stored(db, queued())
    assert tick(budget=0) == NO_COUNTS
    assert db.executes == 0


@pytest.mark.parametrize("pg_code", sorted(outbox.OUTBOX_MISSING_CODES))
def test_a_tick_before_the_migration_says_the_outbox_is_unavailable(db, mail, pg_code):
    db.rpcs["claim_email_outbox"] = raising(missing(pg_code)("write", "claim_email_outbox"))
    assert tick() == {**NO_COUNTS, "unavailable": True}


@pytest.mark.parametrize("make", [outage, denied], ids=["outage", "denied"])
def test_a_tick_lets_any_other_claim_error_through(db, mail, make):
    db.rpcs["claim_email_outbox"] = raising(make("write", "claim_email_outbox"))
    with pytest.raises(DatabaseError) as caught:
        tick()
    assert caught.value.pg_code == make("write", "x").pg_code


def test_rows_a_producer_queues_go_out_in_the_same_tick(db, mail, monkeypatch):
    row = queued("new@ucsc.edu", key="scheduled:1")
    deadlines = []

    def producer(client, deadline):
        deadlines.append(deadline)
        return len(outbox.enqueue(client, [row]))

    monkeypatch.setattr(outbox, "_producers", lambda: (producer,))

    assert tick(budget=30) == {**NO_COUNTS, "expanded": 1, "claimed": 1, "sent": 1}

    assert deadlines == [START + 30]
    assert [message.to for message in mail.sent] == ["new@ucsc.edu"]


def test_a_broken_producer_holds_up_neither_the_others_nor_delivery(db, mail, monkeypatch, caplog):
    stored(db, queued("waiting@ucsc.edu"))
    row = queued("new@ucsc.edu", key="scheduled:1")

    def broken(client, deadline):
        raise ValueError("a bug in a producer")

    def working(client, deadline):
        return len(outbox.enqueue(client, [row]))

    monkeypatch.setattr(outbox, "_producers", lambda: (broken, working))

    with caplog.at_level(logging.ERROR, logger="app.outbox.controller"):
        counts = tick()

    assert counts == {**NO_COUNTS, "expanded": 1, "claimed": 2, "sent": 2}
    assert [message.to for message in mail.sent] == ["waiting@ucsc.edu", "new@ucsc.edu"]
    [logged] = [
        record
        for record in caplog.records
        if record.name == "app.outbox.controller" and record.levelno >= logging.ERROR
    ]
    assert logged.getMessage() == "email_outbox: producer broken failed"
    assert isinstance(logged.exc_info[1], ValueError)


def test_a_producer_that_finds_no_outbox_ends_the_tick(db, mail, monkeypatch):
    monkeypatch.setattr(
        outbox, "_producers", lambda: (raising(outbox.OutboxUnavailable("no table")),)
    )
    assert tick() == {**NO_COUNTS, "unavailable": True}
    assert reads_of(db, "rpc:claim_email_outbox") == []


def test_there_are_no_producers_yet():
    assert tuple(outbox._producers()) == ()


# -- deliver_now -----------------------------------------------------------------------------


class _NoDatabase:
    """A service client that records any use: ``deliver_now`` must not have one."""

    def __init__(self):
        self.touched: list[str] = []

    def __getattr__(self, name):
        self.touched.append(name)
        raise AssertionError(f"the database was used: {name}")


def test_deliver_now_sends_each_row_without_the_database(monkeypatch, clock, mail):
    database = _NoDatabase()
    monkeypatch.setattr("app.core.db.service_client", database, raising=False)
    ok, rejected, down, unknown, unconfigured = (
        queued("ok@ucsc.edu"),
        queued("rejected@ucsc.edu"),
        queued("down@ucsc.edu"),
        queued("unknown@ucsc.edu", kind="no_such_kind", payload={}),
        queued("unconfigured@ucsc.edu"),
    )
    mail.fail("rejected@ucsc.edu", PermanentEmailError("bad address"))
    mail.fail("down@ucsc.edu", TransientEmailError("provider down"))
    mail.fail("unconfigured@ucsc.edu", EmailNotConfiguredError("nothing set"))

    outcomes = outbox.deliver_now([ok, rejected, down, unknown, unconfigured])

    assert outcomes == {
        ok.id: "sent",
        rejected.id: "failed",
        down.id: "failed",
        unconfigured.id: "failed",
        unknown.id: "failed",
    }
    assert [message.to for message in mail.attempts] == [
        "ok@ucsc.edu",
        "rejected@ucsc.edu",
        "down@ucsc.edu",
        "unconfigured@ucsc.edu",
    ]
    assert database.touched == []


@pytest.mark.parametrize("error", MISCONFIGURED)
def test_deliver_now_stops_trying_once_the_transport_is_misconfigured(
    monkeypatch, clock, mail, caplog, error
):
    monkeypatch.setattr("app.core.db.service_client", _NoDatabase(), raising=False)
    first, second, third = queued("a@ucsc.edu"), queued("b@ucsc.edu"), queued("c@ucsc.edu")
    mail.fail("b@ucsc.edu", error)

    with caplog.at_level(logging.WARNING, logger="app.outbox.controller"):
        outcomes = outbox.deliver_now([first, second, third])

    assert outcomes == {first.id: "sent", second.id: "failed", third.id: "failed"}
    assert [message.to for message in mail.attempts] == ["a@ucsc.edu", "b@ucsc.edu"]
    assert error_logs(caplog) == [f"email_outbox: transport misconfigured, pausing | error={error}"]


def test_deliver_now_sends_the_same_message_as_the_outbox(db, mail):
    row = queued("Student@UCSC.edu")
    assert outbox.deliver_now([row]) == {row.id: "sent"}
    assert db.executes == 0
    assert send_owned(row) == {row.id: "sent"}
    first, second = mail.sent
    assert first == second


def test_deliver_now_marks_a_row_that_cannot_be_rendered_failed(monkeypatch, clock, mail):
    monkeypatch.setattr("app.core.db.service_client", _NoDatabase(), raising=False)
    broken, fine = queued("a@ucsc.edu", payload={}), queued("b@ucsc.edu")
    assert outbox.deliver_now([broken, fine]) == {broken.id: "failed", fine.id: "sent"}


# -- kinds -----------------------------------------------------------------------------------


def test_custom_invite_renders_its_payload():
    payload = {
        "subject": "Welcome to CSE 115C",
        "body_text": "Hello everyone",
        "body_html": "<div>Hello everyone</div><ul><li>one</li></ul>",
        "cc": ["ta@ucsc.edu"],
        "bcc": ["prof@ucsc.edu", "log@ucsc.edu"],
    }
    assert get_kind("custom_invite").render(payload, RenderContext()) == Rendered(
        subject="Welcome to CSE 115C",
        text="Hello everyone",
        html=wrap_editor_html_for_email("<div>Hello everyone</div><ul><li>one</li></ul>"),
        cc=("ta@ucsc.edu",),
        bcc=("prof@ucsc.edu", "log@ucsc.edu"),
    )


@pytest.mark.parametrize(
    "rest",
    [{}, {"body_html": None, "cc": None, "bcc": None}, {"body_html": "", "cc": [], "bcc": []}],
    ids=["absent", "none", "empty"],
)
def test_custom_invite_without_html_or_copies(rest):
    payload = {"subject": "Welcome", "body_text": "Hello", **rest}
    assert get_kind("custom_invite").render(payload, RenderContext()) == Rendered(
        subject="Welcome", text="Hello"
    )


#: What send_class_invite_email sent before the outbox, with FRONTEND_URL=https://app.example.com.
#: Copied from its output at 396f241; a change here changes what students receive.
REGISTERED_INVITE = Rendered(
    subject="You've been added to CSE 115C <Fall> on GrepThink",
    text=(
        "Hi,\n\nIna O'Structor added you to CSE 115C <Fall> on GrepThink.\n\n"
        "Sign in to view your class: https://app.example.com\n\n"
        "Course access code: AB&12\n\n"
        "If you were not expecting this, you can ignore this email."
    ),
    html=(
        "\n<html>\n"
        '  <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;'
        'padding:24px">\n'
        '    <h2 style="margin-bottom:8px">You\'ve been added to CSE 115C &lt;Fall&gt;</h2>\n'
        "    <p>Ina O&#x27;Structor added you to <strong>CSE 115C &lt;Fall&gt;</strong> on "
        "GrepThink.</p>\n"
        '    <p><a href="https://app.example.com">Sign in to GrepThink</a> to view your class.</p>\n'
        "    <p>Course access code: <strong>AB&amp;12</strong></p>\n"
        '    <p style="color:#666;font-size:0.875rem">\n'
        "      If you were not expecting this, you can ignore this email.\n"
        "    </p>\n"
        "  </body>\n"
        "</html>\n"
    ),
)

UNREGISTERED_INVITE = Rendered(
    subject="Join CSE 115C <Fall> on GrepThink",
    text=(
        "Hi,\n\nYour instructor invited you to join CSE 115C <Fall> on GrepThink.\n\n"
        "1. Create your student account: https://app.example.com/studentsignup\n"
        "2. After signing up, join the class with this access code: AB&12\n\n"
        "If you were not expecting this, you can ignore this email."
    ),
    html=(
        "\n<html>\n"
        '  <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;'
        'padding:24px">\n'
        '    <h2 style="margin-bottom:8px">You\'re invited to CSE 115C &lt;Fall&gt;</h2>\n'
        "    <p>your instructor invited you to join <strong>CSE 115C &lt;Fall&gt;</strong> on "
        "GrepThink.</p>\n"
        "    <ol>\n"
        '      <li><a href="https://app.example.com/studentsignup">Create your student account'
        "</a></li>\n"
        "      <li>After signing up, join the class with access code <strong>AB&amp;12</strong>"
        "</li>\n"
        "    </ol>\n"
        '    <p style="color:#666;font-size:0.875rem">\n'
        "      If you were not expecting this, you can ignore this email.\n"
        "    </p>\n"
        "  </body>\n"
        "</html>\n"
    ),
)


def test_render_class_invite_is_exactly_what_was_sent_before_the_outbox():
    common = {"class_name": "CSE 115C <Fall>", "course_code": "AB&12"}
    assert (
        render_class_invite(**common, instructor_name="Ina O'Structor", registered=True)
        == REGISTERED_INVITE
    )
    assert render_class_invite(**common, instructor_name="", registered=False) == (
        UNREGISTERED_INVITE
    )


def test_the_class_invite_kind_renders_its_payload_with_render_class_invite():
    rendered = get_kind("class_invite").render(INVITE_PAYLOAD, RenderContext())
    assert rendered == render_class_invite(**INVITE_PAYLOAD)
    assert (rendered.cc, rendered.bcc) == ((), ())


def test_send_class_invite_email_sends_what_render_class_invite_renders(monkeypatch):
    sent = []
    monkeypatch.setattr(invite_email, "send_email", lambda **kwargs: sent.append(kwargs))

    invite_email.send_class_invite_email(to="student@ucsc.edu", **INVITE_PAYLOAD)

    expected = render_class_invite(**INVITE_PAYLOAD)
    assert sent == [
        {
            "to": "student@ucsc.edu",
            "subject": expected.subject,
            "body_text": expected.text,
            "body_html": expected.html,
        }
    ]


def test_both_invite_kinds_are_transactional_and_report_failures_to_their_creator():
    for name in ("class_invite", "custom_invite"):
        kind = get_kind(name)
        assert (kind.name, kind.category, kind.still_relevant) == (name, None, None)
        assert kind.notify_creator_on_failure is True


def test_every_kind_is_filed_under_its_name_with_a_known_category():
    assert {"class_invite", "custom_invite"} <= set(KINDS)
    for name, kind in KINDS.items():
        assert kind.name == name
        assert kind.category is None or kind.category in prefs.CATEGORIES


def test_an_unknown_kind_is_none():
    assert get_kind("no_such_kind") is None


def test_rendered_is_one_class_wherever_it_is_imported_from():
    from app.outbox.rendered import Rendered as defined

    assert kinds.Rendered is defined
    assert invite_email.Rendered is defined


# -- notify_email_undeliverable --------------------------------------------------------------


def test_failures_collapse_into_one_unread_notification_per_class(db, mail):
    other_class = "c1a55000-0000-4000-8000-000000000002"
    rows = [queued("a@ucsc.edu"), queued("b@ucsc.edu"), queued("c@ucsc.edu", class_id=other_class)]
    for row in rows:
        mail.fail(row.to_email, PermanentEmailError("bad address"))

    send_owned(*rows)

    # The latest failure of each class is the one the instructor reads.
    assert sorted((note["entity_id"], note["body"]) for note in db.rows("notifications")) == sorted(
        [
            (
                CLASS,
                "Your invite to b@ucsc.edu couldn't be delivered (the mail server refused it).",
            ),
            (
                other_class,
                "Your invite to c@ucsc.edu couldn't be delivered (the mail server refused it).",
            ),
        ]
    )


def test_a_notification_that_was_read_is_not_reused(db):
    notifications.notify_email_undeliverable(
        user_id=INSTRUCTOR,
        to_email="a@ucsc.edu",
        class_id=CLASS,
        reason="the mail server refused it",
    )
    db.rows("notifications")[0]["read_at"] = NOW.isoformat()
    notifications.notify_email_undeliverable(
        user_id=INSTRUCTOR,
        to_email="b@ucsc.edu",
        class_id=CLASS,
        reason="the mail server refused it",
    )
    assert [note["body"] for note in db.rows("notifications")] == [
        "Your invite to a@ucsc.edu couldn't be delivered (the mail server refused it).",
        "Your invite to b@ucsc.edu couldn't be delivered (the mail server refused it).",
    ]


def test_a_notification_without_a_class_is_kept_apart(db):
    for class_id, address in ((CLASS, "a@ucsc.edu"), (None, "b@ucsc.edu"), (None, "c@ucsc.edu")):
        notifications.notify_email_undeliverable(
            user_id=INSTRUCTOR, to_email=address, class_id=class_id, reason="delivery kept failing"
        )
    assert [(note["entity_id"], note["body"]) for note in db.rows("notifications")] == [
        (CLASS, "Your invite to a@ucsc.edu couldn't be delivered (delivery kept failing)."),
        (None, "Your invite to c@ucsc.edu couldn't be delivered (delivery kept failing)."),
    ]


def test_email_undeliverable_is_a_notification_type():
    assert "email_undeliverable" in notifications.NOTIFICATION_TYPES


def test_nobody_is_notified_without_a_user(db):
    notifications.notify_email_undeliverable(
        user_id=None, to_email="a@ucsc.edu", class_id=CLASS, reason="the address was rejected"
    )
    assert db.executes == 0


@pytest.mark.parametrize(("class_id", "entity"), [(CLASS, ("class", CLASS)), (None, (None, None))])
def test_the_notification_names_the_address_and_the_reason(db, class_id, entity):
    notifications.notify_email_undeliverable(
        user_id=INSTRUCTOR,
        to_email="a@ucsc.edu",
        class_id=class_id,
        reason="the address was rejected",
    )
    assert note_of(db) == {
        "user_id": INSTRUCTOR,
        "type": "email_undeliverable",
        "title": "An email couldn't be delivered",
        "body": "Your invite to a@ucsc.edu couldn't be delivered (the address was rejected).",
        "entity_type": entity[0],
        "entity_id": entity[1],
    }
