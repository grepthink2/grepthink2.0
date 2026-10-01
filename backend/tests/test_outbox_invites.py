"""Scheduled class invites: ``queue_invite`` stores a job, ``app.outbox.invite_jobs`` expands it.

Once a ``pending_invites`` job is due, the dispatcher's producer turns it into one outbox row per
recipient and marks it sent; the same tick then delivers the rows. Everything runs against
FakeSupabase with the outbox's clocks, the mail transport and the claim function replaced by
the doubles in tests/outbox_support.py.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta

import httpx
import pytest

from app.classes import controller as classes
from app.core.db import get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.outbox import controller as outbox
from app.outbox import invite_jobs
from app.utils.email_transport import PermanentEmailError
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase
from tests.outbox_support import NOW, Clock, Mailbox, claim_function

INSTR = "11111111-2222-4333-8444-555555555555"
SAM = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"  # registered, not enrolled yet
KIM = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"  # registered and enrolled
CLASS = "c1a55000-0000-4000-8000-000000000001"
JOB = "a0b00000-0000-4000-8000-000000000001"
JOB2 = "a0b00000-0000-4000-8000-000000000002"
JOB3 = "a0b00000-0000-4000-8000-000000000003"

CONTEXT = {"class_name": "CSE 115C", "course_code": "ABCD1234", "instructor_name": "Ina Structor"}
RELATIONS = {("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False)}
#: When a job that failed now is tried again.
RETRY_AT = (NOW + timedelta(seconds=invite_jobs.RETRY_SECONDS)).isoformat()


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
    created: datetime = NOW - timedelta(minutes=2),
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
        "created_at": created.isoformat(),
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


# -- the database ------------------------------------------------------------------------------


class HookedDb(FakeSupabase):
    """FakeSupabase that calls ``hook(table, query)`` around each request.

    ``before`` hooks run first and may raise (a failing request); ``after`` hooks run once the
    request has been carried out (something that happens meanwhile).
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
def mail(monkeypatch, clock) -> Mailbox:
    box = Mailbox(clock)
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


def job_logs(caplog, level: int = logging.DEBUG) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == "app.outbox.invite_jobs" and r.levelno >= level]


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


def fail_marking_sent_once(db: HookedDb) -> None:
    """The first time a tick marks a job sent, the database fails: the job's rows are queued
    by then, and the job stays unsent."""
    failures: list[str] = []

    def hook(table, query):
        if table == "pending_invites" and query._payload == {"sent": True} and not failures:
            failures.append(table)
            raise database_error(table)

    db.before.append(hook)


def lookups_down(db: HookedDb, table: str) -> dict:
    """Reads of ``table`` fail while the returned switch says ``down``."""
    switch = {"down": True}

    def hook(name, query):
        if name == table and query._op == "select" and switch["down"]:
            raise database_error(name)

    db.before.append(hook)
    return switch


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
    job_of(db, out["job_id"]).update(sent=False, cancelled=False, created_at=NOW.isoformat())
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
def test_expanding_a_job_again_queues_no_email_twice(db, clock, caplog, make):
    # The first tick queues the rows, then cannot mark the job sent (it might as well have died
    # there): the job is tried again later, and that tick finds its rows already queued.
    fail_marking_sent_once(db)
    db.rows("pending_invites").append(make())

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0
    first = {address: dict(row) for address, row in rows_of(db).items()}
    assert first and (job_of(db)["sent"], job_of(db)["send_at"]) == (False, RETRY_AT)
    assert [JOB in record.getMessage() for record in job_logs(caplog)] == [True]

    clock.advance(invite_jobs.RETRY_SECONDS)
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


def test_a_job_deleted_while_its_rows_were_queued_has_them_cancelled(db):
    db.rows("pending_invites").append(custom_job())

    def deleted_meanwhile(table, query):
        if table == "email_outbox" and query._op == "upsert":
            db.rows("pending_invites").clear()

    db.after.append(deleted_meanwhile)

    assert expand() == 0
    assert {row["status"] for row in rows_of(db).values()} == {"cancelled"}


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


def test_a_job_taken_meanwhile_that_cannot_be_read_again_keeps_its_emails(db, caplog):
    # Withdrawing never raises: had it, the job would count as failed and be pushed back.
    db.rows("pending_invites").append(custom_job())

    def cancelled_meanwhile(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["cancelled"] = True

    def the_second_read_breaks(table, query):
        if table == "pending_invites" and query._op == "select" and query._select == "cancelled":
            raise RuntimeError("a bug")

    db.after.append(cancelled_meanwhile)
    db.before.append(the_second_read_breaks)

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    assert {row["status"] for row in rows_of(db).values()} == {"pending"}
    assert job_of(db)["send_at"] == (NOW - timedelta(minutes=1)).isoformat()
    [logged] = job_logs(caplog)
    assert logged.levelno == logging.ERROR and JOB in logged.getMessage()
    assert isinstance(logged.exc_info[1], RuntimeError)


def test_emails_of_a_cancelled_job_that_cannot_be_cancelled_are_logged_not_raised(db, caplog):
    db.rows("pending_invites").append(custom_job())

    def cancelled_meanwhile(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["cancelled"] = True

    def the_cancel_breaks(table, query):
        if table == "email_outbox" and query._op == "update":
            raise RuntimeError("a bug")

    db.after.append(cancelled_meanwhile)
    db.before.append(the_cancel_breaks)

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    [logged] = job_logs(caplog)
    assert logged.levelno == logging.ERROR and JOB in logged.getMessage()
    assert job_of(db)["send_at"] == (NOW - timedelta(minutes=1)).isoformat()


def test_cancelling_a_job_whose_emails_are_queued_cancels_them(db, clock):
    # A tick enrolled the students and queued the emails, then could not mark the job sent, so
    # the job can still be cancelled: that stops every email no dispatcher has claimed yet.
    fail_marking_sent_once(db)
    db.rows("pending_invites").append(job())
    assert expand() == 0
    rows = rows_of(db)
    assert {row["status"] for row in rows.values()} == {"pending"}
    rows["new@ucsc.edu"]["status"] = "sending"  # a dispatcher has this one already
    clock.advance(5)

    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}

    rows = rows_of(db)
    assert (rows["sam@gmail.com"]["status"], rows["sam@gmail.com"]["updated_at"]) == (
        "cancelled",
        clock.now().isoformat(),
    )
    assert rows["new@ucsc.edu"]["status"] == "sending"
    # The enrollment the expansion made stands.
    assert enrolled(db) == {SAM, KIM}


# -- jobs that fail ---------------------------------------------------------------------------


def test_a_standard_job_whose_students_cannot_be_looked_up_is_tried_again_later(db, clock, caplog):
    db.rows("pending_invites").append(job())
    profiles = lookups_down(db, "profiles")

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    assert db.rows("email_outbox") == []
    assert (job_of(db)["sent"], job_of(db)["send_at"]) == (False, RETRY_AT)
    assert enrolled(db) == {KIM}
    [logged] = job_logs(caplog)
    assert JOB in logged.getMessage() and "@" not in logged.getMessage()

    profiles["down"] = False
    clock.advance(invite_jobs.RETRY_SECONDS)
    assert expand() == 1
    assert set(rows_of(db)) == {"sam@gmail.com", "new@ucsc.edu"}


def test_a_standard_job_whose_enrollments_cannot_be_read_enrolls_nobody_yet(db, clock, caplog):
    db.rows("pending_invites").append(job())
    enrollments = lookups_down(db, "class_enrollments")

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    assert db.rows("email_outbox") == []
    assert enrolled(db) == {KIM}
    assert (job_of(db)["sent"], job_of(db)["send_at"]) == (False, RETRY_AT)
    [logged] = job_logs(caplog)
    assert JOB in logged.getMessage() and "@" not in logged.getMessage()

    enrollments["down"] = False
    clock.advance(invite_jobs.RETRY_SECONDS)
    assert expand() == 1
    assert enrolled(db) == {SAM, KIM}


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
    assert job_of(db, JOB)["send_at"] == RETRY_AT
    assert (rows_of(db, JOB), set(rows_of(db, JOB2))) == ({}, {"b@ucsc.edu"})
    [logged] = job_logs(caplog, logging.ERROR)
    assert JOB in logged.getMessage() and "@" not in logged.getMessage()


def test_a_job_that_crashes_does_not_hold_up_the_jobs_after_it(db, monkeypatch, caplog):
    db.rows("pending_invites").extend(
        [
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=1)),
        ]
    )
    build_rows = invite_jobs._enroll_and_build_rows

    def broken_for_the_first(client, job_row):
        if job_row["id"] == JOB:
            raise ValueError("a bug")
        return build_rows(client, job_row)

    monkeypatch.setattr(invite_jobs, "_enroll_and_build_rows", broken_for_the_first)

    with caplog.at_level(logging.ERROR, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert (job_of(db, JOB)["sent"], job_of(db, JOB2)["sent"]) == (False, True)
    assert job_of(db, JOB)["send_at"] == RETRY_AT
    [logged] = job_logs(caplog)
    assert JOB in logged.getMessage() and isinstance(logged.exc_info[1], ValueError)


def test_jobs_that_keep_failing_do_not_starve_a_job_due_after_them(db):
    # 21 jobs due first fail every time, more than one tick reads (JOB_BATCH). Each failure
    # moves its job back, so the next tick reads past them to the 22nd job, which goes out.
    failing = [f"f0000000-0000-4000-8000-{n:012d}" for n in range(21)]
    db.rows("pending_invites").extend(
        custom_job(job_id, [f"s{n}@ucsc.edu"], due=NOW - timedelta(minutes=60 - n))
        for n, job_id in enumerate(failing)
    )
    db.rows("pending_invites").append(
        custom_job(JOB, ["fine@ucsc.edu"], due=NOW - timedelta(seconds=1))
    )

    def failing_jobs_cannot_be_queued(table, query):
        if (
            table == "email_outbox"
            and query._op == "upsert"
            and any(row["batch_id"] in failing for row in query._payload)
        ):
            raise database_error(table)

    db.before.append(failing_jobs_cannot_be_queued)

    assert invite_jobs.JOB_BATCH == 20
    assert expand() == 0  # the first 20 failing jobs
    assert expand() == 1  # the 21st, then the job behind them

    assert job_of(db, JOB)["sent"] is True
    assert {job_of(db, j)["send_at"] for j in failing} == {RETRY_AT}
    assert not any(job_of(db, j)["sent"] or job_of(db, j)["cancelled"] for j in failing)


def test_a_job_still_failing_a_day_after_it_was_queued_is_given_up(db, caplog):
    db.rows("pending_invites").append(job(created=NOW - timedelta(hours=24, seconds=1)))
    # An email an earlier run queued for it before it failed: giving up cancels it too.
    earlier = outbox.OutboxRow(
        kind="class_invite",
        to_email="sam@gmail.com",
        payload={**CONTEXT, "registered": True},
        class_id=CLASS,
        batch_id=JOB,
        created_by=INSTR,
        dedupe_key=f"invite_job:{JOB}:sam@gmail.com",
    )
    db.rows("email_outbox").append(earlier.as_insert(owned=False, now=NOW))
    lookups_down(db, "profiles")

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 0

    given_up = job_of(db)
    assert (given_up["sent"], given_up["cancelled"]) == (False, True)
    assert given_up["send_at"] == (NOW - timedelta(minutes=1)).isoformat()
    assert rows_of(db)["sam@gmail.com"]["status"] == "cancelled"
    [note] = db.rows("notifications")
    assert (note["user_id"], note["type"], note["entity_id"]) == (
        INSTR,
        "email_undeliverable",
        CLASS,
    )
    assert "2 addresses" in note["body"] and "the scheduled invite kept failing" in note["body"]
    [gave_up] = job_logs(caplog, logging.ERROR)
    assert JOB in gave_up.getMessage() and "@" not in gave_up.getMessage()


def test_a_failing_job_less_than_a_day_old_is_tried_again_later(db):
    db.rows("pending_invites").append(job(created=NOW - timedelta(hours=23)))
    lookups_down(db, "profiles")

    assert expand() == 0

    assert (job_of(db)["cancelled"], job_of(db)["send_at"]) == (False, RETRY_AT)
    assert db.rows("notifications") == []


def test_a_failing_job_cancelled_meanwhile_is_not_reported_as_given_up(db):
    db.rows("pending_invites").append(custom_job(created=NOW - timedelta(days=2)))

    def cancelled_then_fails(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["cancelled"] = True  # by its instructor
            raise database_error(table)

    db.before.append(cancelled_then_fails)

    assert expand() == 0
    assert db.rows("notifications") == []


def test_a_failing_job_another_dispatcher_marked_sent_is_left_as_it_is(db):
    db.rows("pending_invites").append(custom_job())

    def sent_elsewhere_then_fails(table, query):
        if table == "email_outbox" and query._op == "upsert":
            job_of(db)["sent"] = True
            raise database_error(table)

    db.before.append(sent_elsewhere_then_fails)

    assert expand() == 0
    assert (job_of(db)["sent"], job_of(db)["send_at"]) == (
        True,
        (NOW - timedelta(minutes=1)).isoformat(),
    )


def test_a_failing_job_that_cannot_be_put_back_does_not_stop_the_next(db, caplog):
    db.rows("pending_invites").extend(
        [
            custom_job(JOB, ["a@ucsc.edu"], due=NOW - timedelta(minutes=2)),
            custom_job(JOB2, ["b@ucsc.edu"], due=NOW - timedelta(minutes=1)),
        ]
    )

    def first_job_fails_and_sticks(table, query):
        queues_the_first_job = query._op == "upsert" and any(
            row["batch_id"] == JOB for row in query._payload
        )
        if table == "email_outbox" and queues_the_first_job:
            raise database_error(table)
        if table == "pending_invites" and "send_at" in (query._payload or {}):
            raise database_error(table)

    db.before.append(first_job_fails_and_sticks)

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert job_of(db, JOB2)["sent"] is True
    assert any("could not put the job back" in r.getMessage() for r in job_logs(caplog))


# -- the time a tick has ------------------------------------------------------------------------


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
    mail.fail("bob@ucsc.edu", PermanentEmailError("bad address"))

    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert expand() == 1

    assert [m.to for m in mail.sent] == ["ann@ucsc.edu"]
    [logged] = job_logs(caplog)
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
#: An address as long as one can be: 254 characters.
LONGEST_ADDRESS = "a" * 245 + "@ucsc.edu"
LINE_BREAKS = pytest.mark.parametrize(
    "line_break",
    ["\n", "\r", "\r\n", "\x0b", "\x85", "\N{LINE SEPARATOR}", "\N{PARAGRAPH SEPARATOR}"],
    ids=["lf", "cr", "crlf", "vt", "nel", "line-separator", "paragraph-separator"],
)


@pytest.fixture
def queued_calls(monkeypatch) -> list[dict]:
    """The controller is replaced: what reaches it, if anything."""
    calls: list[dict] = []

    def record(*args, **kwargs):
        calls.append(kwargs)
        return {"job_id": JOB, "send_at": NOW.isoformat()}

    monkeypatch.setattr("app.classes.views.controller.queue_invite", record)
    return calls


def _queue(client, **body):
    return client.post(
        QUEUE,
        headers={"Authorization": f"Bearer {make_token(sub=INSTR)}"},
        json={"emails": ["new@ucsc.edu"], **body},
    )


def _custom(client, subject: str):
    return _queue(client, custom_subject=subject, custom_body="Hi")


def test_a_subject_over_255_characters_is_refused_before_anything_is_queued(client, queued_calls):
    # Maileroo refuses a longer subject, which would fail the email to every recipient.
    assert _custom(client, "x" * 256).status_code == 422
    assert queued_calls == []

    res = _custom(client, "x" * 255)
    assert res.status_code == 200, res.text
    assert [call["custom_subject"] for call in queued_calls] == ["x" * 255]


@LINE_BREAKS
def test_a_subject_with_a_line_break_is_refused_before_anything_is_queued(
    client, queued_calls, line_break
):
    # The transport refuses such a subject for every recipient: it could smuggle in a header.
    res = _custom(client, f"Welcome{line_break}Bcc: everyone@ucsc.edu")
    assert res.status_code == 422, res.text
    assert "single line" in res.text
    assert queued_calls == []


@pytest.mark.parametrize("field", ["emails", "cc", "bcc"])
def test_an_address_over_254_characters_is_refused_before_anything_is_queued(
    client, queued_calls, field
):
    assert len(LONGEST_ADDRESS) == 254
    assert _queue(client, **{field: ["b" + LONGEST_ADDRESS]}).status_code == 422
    assert queued_calls == []

    res = _queue(client, **{field: [LONGEST_ADDRESS]})
    assert res.status_code == 200, res.text
    assert len(queued_calls) == 1


@LINE_BREAKS
@pytest.mark.parametrize("field", ["emails", "cc", "bcc"])
def test_an_address_with_a_line_break_is_refused_before_anything_is_queued(
    client, queued_calls, field, line_break
):
    res = _queue(client, **{field: [f"ann@ucsc.edu{line_break}Bcc: everyone@ucsc.edu"]})
    assert res.status_code == 422, res.text
    assert "single line" in res.text
    assert queued_calls == []


@pytest.mark.parametrize(("field", "most"), [("emails", 500), ("cc", 20), ("bcc", 20)])
def test_a_batch_has_at_most_500_addresses_and_20_copies_of_each_kind(
    client, queued_calls, field, most
):
    addresses = [f"s{n}@ucsc.edu" for n in range(most + 1)]
    assert _queue(client, **{field: addresses}).status_code == 422
    assert queued_calls == []

    res = _queue(client, **{field: addresses[:most]})
    assert res.status_code == 200, res.text
    assert len(queued_calls) == 1
