"""Scheduled class invites: ``queue_invite`` stores a job, ``app.outbox.invite_jobs`` expands it.

Once a ``pending_invites`` job is due, the dispatcher's producer turns it into one outbox row per
recipient and marks it sent; the same tick then delivers the rows. Everything runs against
FakeSupabase with the outbox's clocks replaced (``_now``, ``_monotonic``) and a stand-in for the
mail transport, like test_outbox_dispatch.py, whose claim function is copied here.
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.classes import controller as classes
from app.core.db import get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.outbox import controller as outbox
from app.outbox import invite_jobs
from app.utils.email_transport import EmailMessage, PermanentEmailError
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
START = 1_000.0  # the monotonic clock when a test begins

INSTR = "11111111-2222-4333-8444-555555555555"
SAM = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"  # registered, not enrolled yet
KIM = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"  # registered and enrolled
CLASS = "c1a55000-0000-4000-8000-000000000001"
JOB = "a0b00000-0000-4000-8000-000000000001"
JOB2 = "a0b00000-0000-4000-8000-000000000002"
JOB3 = "a0b00000-0000-4000-8000-000000000003"

CONTEXT = {"class_name": "CSE 115C", "course_code": "ABCD1234", "instructor_name": "Ina Structor"}
RELATIONS = {("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False)}
WRITE_OPS = {"insert", "update", "upsert", "delete"}


def _profile(uid: str, email: str, *, edu: str | None = None, first="", last="", role="student"):
    return {
        "id": uid,
        "email": email,
        "edu_email": edu,
        "role": role,
        "first_name": first,
        "last_name": last,
    }


def _world() -> dict:
    return {
        "profiles": [
            _profile(INSTR, "ina@ucsc.edu", first="Ina", last="Structor", role="instructor"),
            _profile(SAM, "sam@gmail.com", edu="sam@ucsc.edu", first="Sam", last="One"),
            _profile(KIM, "kim@ucsc.edu", first="Kim", last="Two"),
        ],
        "classes": [
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115C", "course_code": "ABCD1234"}
        ],
        "class_enrollments": [
            {"id": "e-kim", "class_id": CLASS, "user_id": KIM, "enrollment_role": "student"}
        ],
        "pending_invites": [],
        "email_outbox": [],
        "email_suppressions": [],
        "notifications": [],
    }


def job(
    job_id: str = JOB,
    emails=("sam@ucsc.edu", "new@ucsc.edu"),
    *,
    due: datetime = NOW - timedelta(minutes=1),
    subject: str | None = None,
    body: str | None = None,
    html: str | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
    sent: bool = False,
    cancelled: bool = False,
) -> dict:
    """A ``pending_invites`` row, as ``queue_invite`` stores one (standard unless ``subject``
    and ``body`` are given)."""
    return {
        "id": job_id,
        "class_id": CLASS,
        "instructor_id": INSTR,
        "emails": list(emails),
        "send_at": due.isoformat(),
        "cancelled": cancelled,
        "sent": sent,
        "custom_subject": subject,
        "custom_body": body,
        "custom_body_html": html,
        "cc": cc,
        "bcc": bcc,
    }


def custom_job(job_id: str = JOB, emails=("ann@ucsc.edu", "bob@ucsc.edu"), **columns) -> dict:
    return job(
        job_id,
        emails,
        subject="Welcome to CSE 115C",
        body="Hi!\nSee you in section.",
        html="<p>Hi!</p>",
        cc=["ta@ucsc.edu"],
        bcc=["records@ucsc.edu"],
        **columns,
    )


CUSTOM_PAYLOAD = {
    "subject": "Welcome to CSE 115C",
    "body_text": "Hi!\nSee you in section.",
    "body_html": "<p>Hi!</p>",
    "cc": ["ta@ucsc.edu"],
    "bcc": ["records@ucsc.edu"],
}


# -- time, mail and the database ---------------------------------------------------------------


class Clock:
    """The outbox's clocks: a wall clock for timestamps, a monotonic one for budgets."""

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
    """Stands in for ``email_transport.send``: records each message, or raises the error set for
    its address. ``before_send(message)``, when set, runs first."""

    def __init__(self):
        self.sent: list[EmailMessage] = []
        self.failures: dict[str, Exception] = {}
        self.before_send = None

    def send(self, message: EmailMessage) -> str:
        if self.before_send is not None:
            self.before_send(message)
        error = self.failures.get(message.to)
        if error is not None:
            raise error
        self.sent.append(message)
        return f"ref-{len(self.sent)}"


def _ts(value) -> datetime:
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def claim_function(db: FakeSupabase, clock: Clock):
    """``claim_email_outbox(p_limit, p_lease_seconds)`` in Python (as in test_outbox_dispatch.py)."""

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


class HookedDb(FakeSupabase):
    """FakeSupabase that calls ``hook(table, query)`` around each request.

    ``before`` hooks run instead of nothing and may raise (a failing request); ``after`` hooks
    run once the request has been carried out (something that happens meanwhile).
    """

    def __init__(self, **tables):
        super().__init__(relations=RELATIONS, **tables)
        self.before = []
        self.after = []

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def hooked():
            for hook in self.before:
                hook(name, query)
            result = execute()
            for hook in self.after:
                hook(name, query)
            return result

        query.execute = hooked
        return query


@pytest.fixture
def clock(monkeypatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(outbox, "_now", clock.now)
    monkeypatch.setattr(outbox, "_monotonic", clock.monotonic)
    return clock


@pytest.fixture
def mail(monkeypatch) -> Mailbox:
    box = Mailbox()
    monkeypatch.setattr("app.utils.email_transport.send", box.send)
    return box


@pytest.fixture
def db(monkeypatch, clock, mail) -> HookedDb:
    fake = HookedDb(**_world())
    fake.rpcs["claim_email_outbox"] = claim_function(fake, clock)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def expand(seconds: float = 30.0) -> int:
    """Run the producer with ``seconds`` left before the tick's deadline."""
    return invite_jobs.expand_due_invite_jobs(get_client(), outbox._monotonic() + seconds)


def job_of(db: FakeSupabase, job_id: str = JOB) -> dict:
    return next(row for row in db.rows("pending_invites") if row["id"] == job_id)


def rows_of(db: FakeSupabase, job_id: str = JOB) -> dict[str, dict]:
    """The job's outbox rows by address."""
    return {row["to_email"]: row for row in db.rows("email_outbox") if row["batch_id"] == job_id}


def enrolled(db: FakeSupabase) -> set[str]:
    return {row["user_id"] for row in db.rows("class_enrollments") if row["class_id"] == CLASS}


def job_logs(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.name == "app.outbox.invite_jobs"]


def database_error(table: str) -> DatabaseUnavailableError:
    return DatabaseUnavailableError(
        operation="write",
        target=table,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


def missing_outbox(table, query) -> None:
    """Before ``2026-09-30_email_outbox.sql``: the table is not there."""
    if table == "email_outbox":
        raise DatabaseError(
            operation="write",
            target=table,
            pg_code="PGRST205",
            pg_message="Could not find the table 'public.email_outbox' in the schema cache",
        )


# -- queue_invite -------------------------------------------------------------------------------


def test_inserting_the_same_pending_invite_twice_keeps_one_row(db):
    payload = {
        "id": str(uuid.uuid4()),
        "class_id": CLASS,
        "instructor_id": INSTR,
        "emails": ["new@ucsc.edu"],
        "send_at": NOW.isoformat(),
    }
    classes._insert_pending_invite(get_client(), dict(payload))
    classes._insert_pending_invite(get_client(), dict(payload))  # a replay
    assert db.rows("pending_invites") == [payload]


def test_a_retry_after_an_insert_that_committed_queues_the_batch_once(db):
    # The insert commits, then the connection drops before the answer arrives:
    # @retry_on_disconnect runs it again, with the same job id.
    drops = []

    def lose_the_first_answer(table, query):
        if table == "pending_invites" and query._op == "upsert" and not drops:
            drops.append(table)
            raise httpx.RemoteProtocolError("Server disconnected")

    db.after.append(lose_the_first_answer)

    out = classes.queue_invite(CLASS, ["new@ucsc.edu"], INSTR)

    assert drops == ["pending_invites"]
    assert [row["id"] for row in db.rows("pending_invites")] == [out["job_id"]]
    assert job_of(db, out["job_id"])["send_at"] == out["send_at"]


def test_a_job_queue_invite_stored_goes_out_once_it_is_due(db, clock):
    out = classes.queue_invite(
        CLASS,
        [" New@UCSC.edu "],
        INSTR,
        delay_seconds=60,
        cc=["ta@ucsc.edu"],
        custom_subject="Welcome",
        custom_body="Hi",
        custom_body_html="<p>Hi</p>",
    )
    # The columns' defaults, which Postgres fills in and FakeSupabase does not.
    job_of(db, out["job_id"]).update(sent=False, cancelled=False)
    send_at = datetime.fromisoformat(out["send_at"])

    clock.wall = send_at - timedelta(seconds=1)
    assert expand() == 0
    clock.wall = send_at
    assert expand() == 1

    [row] = db.rows("email_outbox")
    assert (row["to_email"], row["kind"], row["batch_id"], row["created_by"]) == (
        "new@ucsc.edu",
        "custom_invite",
        out["job_id"],
        INSTR,
    )
    assert row["payload"] == {
        "subject": "Welcome",
        "body_text": "Hi",
        "body_html": "<p>Hi</p>",
        "cc": ["ta@ucsc.edu"],
        "bcc": [],
    }
    assert job_of(db, out["job_id"])["sent"] is True


# -- expanding custom and standard jobs ---------------------------------------------------------


def test_a_custom_job_becomes_one_custom_invite_per_address(db, mail):
    db.rows("pending_invites").append(
        custom_job(emails=[" Ann@UCSC.edu ", "bob@ucsc.edu", "", "ann@ucsc.edu", "   ", None])
    )

    assert expand() == 1

    rows = list(rows_of(db).values())
    assert [(r["to_email"], r["kind"], r["status"], r["dedupe_key"]) for r in rows] == [
        ("ann@ucsc.edu", "custom_invite", "pending", f"invite_job:{JOB}:ann@ucsc.edu"),
        ("bob@ucsc.edu", "custom_invite", "pending", f"invite_job:{JOB}:bob@ucsc.edu"),
    ]
    assert all(r["payload"] == CUSTOM_PAYLOAD for r in rows)
    assert {(r["batch_id"], r["class_id"], r["created_by"], r["user_id"]) for r in rows} == {
        (JOB, CLASS, INSTR, None)
    }
    assert job_of(db)["sent"] is True
    # Nobody is looked up or enrolled, and delivering is the tick's work, not the producer's.
    assert not [q for q in db.queries if q["table"] in ("profiles", "class_enrollments")]
    assert mail.sent == []


def test_a_custom_job_without_html_or_copies(db):
    db.rows("pending_invites").append(job(emails=["ann@ucsc.edu"], subject="Hello", body="Hi"))
    assert expand() == 1
    [row] = db.rows("email_outbox")
    assert row["payload"] == {
        "subject": "Hello",
        "body_text": "Hi",
        "body_html": None,
        "cc": [],
        "bcc": [],
    }


def test_a_standard_job_enrolls_the_accounts_and_queues_a_class_invite_each(db):
    db.rows("pending_invites").append(
        job(emails=["sam@ucsc.edu", "kim@ucsc.edu", "New@ucsc.edu", "ina@ucsc.edu"])
    )

    assert expand() == 1

    # Sam is enrolled now and Kim was already; the instructor's own address gets nothing.
    assert enrolled(db) == {SAM, KIM}
    rows = rows_of(db)
    assert {address: row["payload"] for address, row in rows.items()} == {
        "sam@gmail.com": {**CONTEXT, "registered": True},  # an account's primary address
        "kim@ucsc.edu": {**CONTEXT, "registered": True},
        "new@ucsc.edu": {**CONTEXT, "registered": False},
    }
    assert {address: row["user_id"] for address, row in rows.items()} == {
        "sam@gmail.com": SAM,
        "kim@ucsc.edu": KIM,
        "new@ucsc.edu": None,
    }
    assert {address: row["dedupe_key"] for address, row in rows.items()} == {
        address: f"invite_job:{JOB}:{address}" for address in rows
    }
    assert {
        (r["kind"], r["status"], r["batch_id"], r["class_id"], r["created_by"])
        for r in rows.values()
    } == {("class_invite", "pending", JOB, CLASS, INSTR)}
    assert job_of(db)["sent"] is True


def test_a_standard_job_emails_a_student_listed_under_two_addresses_once(db):
    # Both addresses lead to Sam's account, so both emails would go to his primary address
    # under the same dedupe key: one is queued.
    db.rows("pending_invites").append(job(emails=["sam@ucsc.edu", "sam@gmail.com"]))
    assert expand() == 1
    assert list(rows_of(db)) == ["sam@gmail.com"]
    assert enrolled(db) == {SAM, KIM}


def test_a_standard_job_for_a_class_that_is_gone_is_marked_sent_with_nothing_to_send(db):
    db.rows("classes").clear()
    db.rows("pending_invites").append(job())
    assert expand() == 1
    assert db.rows("email_outbox") == []
    assert job_of(db)["sent"] is True


def test_only_due_jobs_are_read_the_longest_due_first(db, monkeypatch):
    monkeypatch.setattr(invite_jobs, "JOB_BATCH", 2)
    db.rows("pending_invites").extend(
        [
            custom_job(JOB3, ["c@ucsc.edu"], due=NOW - timedelta(minutes=1)),
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=3)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job("later", ["later@ucsc.edu"], due=NOW + timedelta(minutes=1)),
            custom_job("done", ["done@ucsc.edu"], sent=True),
            custom_job("called-off", ["off@ucsc.edu"], cancelled=True),
        ]
    )

    assert expand() == 2

    assert {row["batch_id"] for row in db.rows("email_outbox")} == {JOB, JOB2}
    assert [job_of(db, j)["sent"] for j in (JOB, JOB2, JOB3, "later")] == [True, True, False, False]
    assert (job_of(db, "called-off")["sent"], job_of(db, "done")["sent"]) == (False, True)
    # The next tick takes the job the batch left behind.
    assert expand() == 1
    assert job_of(db, JOB3)["sent"] is True


# -- running again, and running into others ---------------------------------------------------


@pytest.mark.parametrize("make", [job, custom_job], ids=["standard", "custom"])
def test_expanding_a_job_again_queues_no_email_twice(db, caplog, make):
    # The first tick queues the rows, then cannot mark the job sent (it might as well have died
    # there): the job stays due, and the next tick finds its rows already queued.
    def fail_marking_it_once(table, query):
        if table == "pending_invites" and query._op == "update" and not failures:
            failures.append(table)
            raise database_error(table)

    failures: list[str] = []
    db.before.append(fail_marking_it_once)
    db.rows("pending_invites").append(make())

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0
    first = {address: dict(row) for address, row in rows_of(db).items()}
    assert first and job_of(db)["sent"] is False
    assert any(JOB in message for message in job_logs(caplog))

    assert expand() == 1

    assert rows_of(db) == first
    assert job_of(db)["sent"] is True


def test_a_job_cancelled_while_its_rows_were_queued_has_them_cancelled(db, clock):
    db.rows("pending_invites").append(custom_job(emails=["ann@ucsc.edu", "bob@ucsc.edu"]))

    def cancel_meanwhile(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["cancelled"] = True
            clock.advance(5)
            # Another dispatcher had already taken one of the rows: it is not cancelled here.
            rows_of(db)["bob@ucsc.edu"]["status"] = "sending"

    db.after.append(cancel_meanwhile)

    assert expand() == 0

    rows = rows_of(db)
    assert (rows["ann@ucsc.edu"]["status"], rows["ann@ucsc.edu"]["updated_at"]) == (
        "cancelled",
        clock.now().isoformat(),
    )
    assert rows["bob@ucsc.edu"]["status"] == "sending"
    assert (job_of(db)["sent"], job_of(db)["cancelled"]) == (False, True)


def test_a_job_another_dispatcher_marked_sent_meanwhile_keeps_its_emails(db, mail, monkeypatch):
    # Two ticks expanded the job at once: the rows are the other one's too (one copy each, by
    # their dedupe keys), so they stay, and go out once.
    db.rows("pending_invites").append(custom_job())

    def taken_meanwhile(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["sent"] = True

    db.after.append(taken_meanwhile)

    assert expand() == 0
    assert {row["status"] for row in rows_of(db).values()} == {"pending"}

    db.after.clear()
    monkeypatch.setattr(outbox, "_producers", lambda: (invite_jobs.expand_due_invite_jobs,))
    assert outbox.dispatch_tick(budget_seconds=30)["sent"] == 2
    assert sorted(message.to for message in mail.sent) == ["ann@ucsc.edu", "bob@ucsc.edu"]


def test_a_standard_job_whose_students_cannot_be_looked_up_waits_for_the_next_tick(db, caplog):
    db.rows("pending_invites").append(job())

    def lookup_down(table, query):
        if table == "profiles" and query._op == "select" and lookup_is_down:
            raise database_error(table)

    lookup_is_down = True
    db.before.append(lookup_down)

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    assert db.rows("email_outbox") == []
    assert job_of(db)["sent"] is False
    assert enrolled(db) == {KIM}
    [message] = job_logs(caplog)
    assert JOB in message and "@" not in message

    lookup_is_down = False
    assert expand() == 1
    assert set(rows_of(db)) == {"sam@gmail.com", "new@ucsc.edu"}


def test_no_new_job_is_started_once_the_deadline_is_reached(db, clock):
    db.rows("pending_invites").extend(
        [
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=1)),
        ]
    )

    def slow_queue(table, query):
        if table == "email_outbox" and query._op == "upsert":
            clock.advance(10)

    db.after.append(slow_queue)

    assert expand(seconds=5) == 1

    assert (job_of(db, JOB)["sent"], job_of(db, JOB2)["sent"]) == (True, False)
    assert rows_of(db, JOB2) == {}


def test_without_time_left_nothing_is_read(db):
    db.rows("pending_invites").append(job())
    assert expand(seconds=0) == 0
    assert db.executes == 0


def test_a_database_error_on_one_job_does_not_stop_the_next(db, caplog):
    db.rows("pending_invites").extend(
        [
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=1)),
        ]
    )

    def first_job_cannot_be_queued(table, query):
        if (
            table == "email_outbox"
            and query._op == "upsert"
            and any(row["batch_id"] == JOB for row in query._payload)
        ):
            raise database_error(table)

    db.before.append(first_job_cannot_be_queued)

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert (job_of(db, JOB)["sent"], job_of(db, JOB2)["sent"]) == (False, True)
    assert (rows_of(db, JOB), set(rows_of(db, JOB2))) == ({}, {"b@ucsc.edu"})
    [logged] = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert JOB in logged.getMessage() and "@" not in logged.getMessage()


def test_a_job_that_crashes_does_not_hold_up_the_jobs_after_it(db, monkeypatch, caplog):
    db.rows("pending_invites").extend(
        [
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=1)),
        ]
    )
    rows_for = invite_jobs._rows_for

    def broken_for_the_first(client, job_row):
        if job_row["id"] == JOB:
            raise ValueError("a bug")
        return rows_for(client, job_row)

    monkeypatch.setattr(invite_jobs, "_rows_for", broken_for_the_first)

    with caplog.at_level(logging.ERROR, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert (job_of(db, JOB)["sent"], job_of(db, JOB2)["sent"]) == (False, True)
    [logged] = caplog.records
    assert JOB in logged.getMessage() and isinstance(logged.exc_info[1], ValueError)


# -- before the outbox migration ----------------------------------------------------------------


@pytest.mark.parametrize("make", [job, custom_job], ids=["standard", "custom"])
def test_before_the_migration_a_job_is_marked_sent_then_sent_directly(db, mail, make):
    db.before.append(missing_outbox)
    db.rows("pending_invites").append(make())
    marked_when_sent = []
    mail.before_send = lambda message: marked_when_sent.append(job_of(db)["sent"])

    assert expand() == 1

    assert marked_when_sent == [True, True]  # marked first: nobody else can send it again
    assert len(mail.sent) == 2
    assert db.rows("email_outbox") == []
    # The next tick finds nothing due.
    assert expand() == 0
    assert len(mail.sent) == 2


def test_before_the_migration_a_standard_job_still_enrolls_and_invites(db, mail):
    db.before.append(missing_outbox)
    db.rows("pending_invites").append(job())

    assert expand() == 1

    assert enrolled(db) == {SAM, KIM}
    assert sorted((m.to, m.subject) for m in mail.sent) == [
        ("new@ucsc.edu", "Join CSE 115C on GrepThink"),
        ("sam@gmail.com", "You've been added to CSE 115C on GrepThink"),
    ]


def test_before_the_migration_emails_not_sent_are_logged_without_addresses(db, mail, caplog):
    db.before.append(missing_outbox)
    db.rows("pending_invites").append(custom_job())
    mail.failures["bob@ucsc.edu"] = PermanentEmailError("bad address")

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert [m.to for m in mail.sent] == ["ann@ucsc.edu"]
    [logged] = [r for r in caplog.records if r.name == "app.outbox.invite_jobs"]
    assert logged.levelno == logging.ERROR
    assert JOB in logged.getMessage() and "@" not in logged.getMessage()


def test_before_the_migration_a_job_taken_meanwhile_is_not_sent(db, mail):
    db.rows("pending_invites").append(custom_job())

    def taken_then_missing(table, query):
        if table == "email_outbox":
            job_of(db)["sent"] = True  # another dispatcher marked it sent first
        missing_outbox(table, query)

    db.before.append(taken_then_missing)

    assert expand() == 0
    assert mail.sent == []


# -- one tick, end to end -----------------------------------------------------------------------


def test_one_tick_turns_due_jobs_into_sent_emails(db, mail, monkeypatch):
    monkeypatch.setattr(outbox, "_producers", lambda: (invite_jobs.expand_due_invite_jobs,))
    db.rows("pending_invites").extend(
        [job(JOB, ["sam@ucsc.edu", "new@ucsc.edu"]), custom_job(JOB2, ["ann@ucsc.edu"])]
    )

    counts = outbox.dispatch_tick(budget_seconds=30)

    assert (counts["expanded"], counts["claimed"], counts["sent"]) == (2, 3, 3)
    sent = {message.to: message for message in mail.sent}
    assert set(sent) == {"sam@gmail.com", "new@ucsc.edu", "ann@ucsc.edu"}
    assert sent["sam@gmail.com"].subject == "You've been added to CSE 115C on GrepThink"
    assert sent["new@ucsc.edu"].subject == "Join CSE 115C on GrepThink"
    custom = sent["ann@ucsc.edu"]
    assert (custom.subject, custom.text, custom.cc, custom.bcc) == (
        "Welcome to CSE 115C",
        "Hi!\nSee you in section.",
        ("ta@ucsc.edu",),
        ("records@ucsc.edu",),
    )
    assert {row["status"] for row in db.rows("email_outbox")} == {"sent"}
    assert (job_of(db, JOB)["sent"], job_of(db, JOB2)["sent"]) == (True, True)
    assert enrolled(db) == {SAM, KIM}

    # Nothing is left for the next tick.
    assert outbox.dispatch_tick(budget_seconds=30)["claimed"] == 0
    assert len(mail.sent) == 3


# -- the request ------------------------------------------------------------------------------

QUEUE = f"/api/classes/{CLASS}/invites/queue"


@pytest.fixture
def queued_calls(monkeypatch) -> list[dict]:
    """The controller is replaced: what reaches it, if anything."""
    calls: list[dict] = []

    def record(*args, **kwargs):
        calls.append(kwargs)
        return {"job_id": JOB, "send_at": NOW.isoformat()}

    monkeypatch.setattr("app.classes.views.controller.queue_invite", record)
    return calls


def _queue(client, subject: str):
    return client.post(
        QUEUE,
        headers={"Authorization": f"Bearer {make_token(sub=INSTR)}"},
        json={"emails": ["new@ucsc.edu"], "custom_subject": subject, "custom_body": "Hi"},
    )


def test_a_subject_over_255_characters_is_refused_before_anything_is_queued(client, queued_calls):
    # Maileroo refuses a longer subject, which would fail the email to every recipient.
    assert _queue(client, "x" * 256).status_code == 422
    assert queued_calls == []

    res = _queue(client, "x" * 255)
    assert res.status_code == 200, res.text
    assert [call["custom_subject"] for call in queued_calls] == ["x" * 255]


@pytest.mark.parametrize(
    "subject",
    [
        "Welcome\nBcc: everyone@ucsc.edu",
        "Welcome\r",
        "Welcome\r\nto class",
        "Welcome\x0bto class",
        "Welcome\x85to class",
        "Welcome to class",
        "Welcome to class",
    ],
    ids=["lf", "cr", "crlf", "vt", "nel", "line-separator", "paragraph-separator"],
)
def test_a_subject_with_a_line_break_is_refused_before_anything_is_queued(
    client, queued_calls, subject
):
    # The transport refuses such a subject for every recipient: it could smuggle in a header.
    res = _queue(client, subject)
    assert res.status_code == 422, res.text
    assert "single line" in res.text
    assert queued_calls == []
