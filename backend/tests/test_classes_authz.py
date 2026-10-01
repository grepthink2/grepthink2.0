"""Access rules for app.classes: who may call each controller, and the exact
answer everyone else gets.

Instructor-only routes answer 404 "Class not found" when the class does not
exist and 403 "Only the class instructor can do this" to everyone else, including
a TA of the class whose account is an instructor's (with a class of its own). Class
reads (students, roster, projects) are open to the class instructor and to
enrolled students and TAs: 404 for a missing class, 403 for everyone else.

These tests pin those status codes and messages, and assert that a denied call
writes nothing and sends no email. The retry tests cover
``@retry_on_disconnect``: a dropped connection has to reach the decorator
instead of becoming a 500 first.
"""

from __future__ import annotations

import logging
import threading
import uuid
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from app.core.errors import DatabaseError, DatabaseUnavailableError
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
TA1, S1, OUTSIDER = "ta-1", "s1", "outsider"
CLASS, MISSING = "class-1", "no-such-class"
TA1_CLASS = "class-ta1"  # TA1 teaches it: a TA in CLASS, an instructor elsewhere
P1 = "proj-1"
MANUAL_ENTRY = "roster-manual"
JOB = "job-1"

WRITE_OPS = {"insert", "update", "upsert", "delete"}
CLASS_NOT_FOUND = "Class not found"
NOT_CLASS_INSTRUCTOR = "Only the class instructor can do this"
NO_CLASS_ACCESS = "You do not have access to this class"

RELATIONS = {
    ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("project_members", "profiles!project_members_user_id_fkey"): ("user_id", "id", False),
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid: str, role: str = "student") -> dict:
    return {
        "id": uid,
        "email": f"{uid}@ucsc.edu",
        "edu_email": None,
        "role": role,
        "first_name": uid.title(),
        "last_name": "X",
    }


def _world() -> dict:
    """CLASS belongs to INSTR; TA1 (ta) and S1 (student) are enrolled; S1 is on P1.
    TA1's account is an instructor's, and TA1 created TA1_CLASS."""
    return {
        "profiles": [
            _profile(INSTR, "instructor"),
            _profile(OTHER_INSTR, "instructor"),
            _profile(TA1, "instructor"),
            _profile(S1),
            _profile(OUTSIDER),
        ],
        "classes": [
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "CSE 115C",
                "course_code": "ABCD1234",
                "status": "active",
            },
            {
                "id": TA1_CLASS,
                "created_by": TA1,
                "name": "CSE 101",
                "course_code": "WXYZ5678",
                "status": "active",
            },
        ],
        "class_enrollments": [
            {"id": "e-ta", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e-s1", "class_id": CLASS, "user_id": S1, "enrollment_role": "student"},
        ],
        "roster_entries": [
            {
                "id": MANUAL_ENTRY,
                "course_id": CLASS,
                "email": "manual@ucsc.edu",
                "status": "manual",
                "is_manual": True,
                "matched_profile_id": None,
                "uploaded_at": "2026-01-01T00:00:00+00:00",
                "first_name": "Manny",
                "last_name": "Al",
            }
        ],
        "projects": [
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "team_size": 4,
                "sentiment": "good",
                "image_url": None,
                "num_members": 1,
                "assigned_ta_id": None,
                "created_at": "2026-01-02T00:00:00+00:00",
            }
        ],
        "project_members": [{"id": "m1", "project_id": P1, "user_id": S1, "role": "member"}],
        "pending_invites": [
            {
                "id": JOB,
                "class_id": CLASS,
                "instructor_id": INSTR,
                "emails": ["a@ucsc.edu"],
                "sent": False,
                "cancelled": False,
            }
        ],
        "assignments": [],
        "TSRs": [],
        "project_join_requests": [],
        "project_review_tas": [],
        "notifications": [],
        "relations": RELATIONS,
    }


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def emails(monkeypatch):
    """Every message handed to the email transport (invites go through the outbox)."""
    sent: list = []

    def record(message):
        sent.append(message)
        return None

    monkeypatch.setattr("app.utils.email_transport.send", record)
    return sent


# ------------------------------------------------------ instructor-only routes

CSV = "Email Address,Status\na@ucsc.edu,Enrolled\n"

INSTRUCTOR_ONLY = {
    "update_class_status": lambda caller, cid: classes.update_class_status(cid, "complete", caller),
    "invite_student_to_class": lambda caller, cid: classes.invite_student_to_class(
        cid, "s1@ucsc.edu", caller
    ),
    "get_class_roster_timeline": lambda caller, cid: classes.get_class_roster_timeline(cid, caller),
    "upload_class_roster": lambda caller, cid: classes.upload_class_roster(cid, CSV, caller),
    "add_manual_roster_student": lambda caller, cid: classes.add_manual_roster_student(
        cid, "Ann", "Lee", "ann@ucsc.edu", caller
    ),
    "delete_manual_roster_entry": lambda caller, cid: classes.delete_manual_roster_entry(
        cid, MANUAL_ENTRY, caller
    ),
    "remove_student_from_class": lambda caller, cid: classes.remove_student_from_class(
        cid, S1, caller
    ),
    "bulk_invite_students": lambda caller, cid: classes.bulk_invite_students(
        cid, ["s1@ucsc.edu"], caller
    ),
    "queue_invite": lambda caller, cid: classes.queue_invite(cid, ["s1@ucsc.edu"], caller),
    "cancel_invite": lambda caller, cid: classes.cancel_invite(cid, JOB, caller),
    "get_class_turn_in_stats": lambda caller, cid: classes.get_class_turn_in_stats(cid, caller),
}


@pytest.mark.parametrize("name", sorted(INSTRUCTOR_ONLY))
@pytest.mark.parametrize(
    ("caller", "cid", "status", "detail"),
    [
        (OTHER_INSTR, CLASS, 403, NOT_CLASS_INSTRUCTOR),
        (S1, CLASS, 403, NOT_CLASS_INSTRUCTOR),
        (TA1, CLASS, 403, NOT_CLASS_INSTRUCTOR),
        (INSTR, MISSING, 404, CLASS_NOT_FOUND),
    ],
    ids=["other-instructor", "enrolled-student", "ta-instructor-elsewhere", "missing-class"],
)
def test_instructor_only_routes_answer_404_for_a_missing_class_and_403_otherwise(
    db, emails, name, caller, cid, status, detail
):
    with pytest.raises(HTTPException) as exc:
        INSTRUCTOR_ONLY[name](caller, cid)
    assert (exc.value.status_code, exc.value.detail) == (status, detail)
    assert not [q for q in db.queries if q["op"] in WRITE_OPS], _trace(db)
    assert emails == []


def test_roster_upload_checks_ownership_before_parsing_the_csv(db):
    with pytest.raises(HTTPException) as exc:
        classes.upload_class_roster(CLASS, "not,a,roster\n", OTHER_INSTR)
    assert (exc.value.status_code, exc.value.detail) == (403, NOT_CLASS_INSTRUCTOR)


def test_manual_roster_add_validates_input_before_reading_the_class(db):
    with pytest.raises(HTTPException) as exc:
        classes.add_manual_roster_student(CLASS, " ", "Lee", "ann@ucsc.edu", OTHER_INSTR)
    assert (exc.value.status_code, exc.value.detail) == (400, "First and last name are required")
    assert db.executes == 0


def test_class_status_is_validated_before_any_read(db):
    with pytest.raises(HTTPException) as exc:
        classes.update_class_status(CLASS, "archived", INSTR)
    assert (exc.value.status_code, exc.value.detail) == (
        400,
        "Status must be 'active' or 'complete'",
    )
    assert db.executes == 0


def test_owner_updates_class_status_in_two_round_trips(db):
    updated = classes.update_class_status(CLASS, "complete", INSTR)
    assert (updated["id"], updated["status"]) == (CLASS, "complete")
    assert db.executes == 2, _trace(db)


def test_owner_deletes_a_manual_roster_entry(db):
    out = classes.delete_manual_roster_entry(CLASS, MANUAL_ENTRY, INSTR)
    assert out == {"message": "Student removed from roster", "entry_id": MANUAL_ENTRY}
    assert db.rows("roster_entries") == []
    assert db.executes == 3, _trace(db)


def test_owner_queues_an_invite(db):
    out = classes.queue_invite(CLASS, ["new@ucsc.edu"], INSTR, delay_seconds=0)
    assert set(out) == {"job_id", "send_at"}
    # The job id is chosen before the insert, so a retried insert cannot queue the batch twice.
    assert str(uuid.UUID(out["job_id"])) == out["job_id"]
    job = next(r for r in db.rows("pending_invites") if r["id"] == out["job_id"])
    assert (job["class_id"], job["instructor_id"], job["emails"], job["send_at"]) == (
        CLASS,
        INSTR,
        ["new@ucsc.edu"],
        out["send_at"],
    )
    assert _trace(db) == ["classes:select", "pending_invites:upsert"]


def test_cancel_invite_answers(db):
    # Anyone but the class instructor is turned away before the job is looked up
    # (INSTRUCTOR_ONLY above); the owner gets 404 for a job that does not exist.
    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    with pytest.raises(HTTPException) as missing:
        classes.cancel_invite(CLASS, "no-such-job", INSTR)
    assert (missing.value.status_code, missing.value.detail) == (404, "Invite job not found")
    db.rows("pending_invites")[0]["sent"] = True
    with pytest.raises(HTTPException) as sent:
        classes.cancel_invite(CLASS, JOB, INSTR)
    assert (sent.value.status_code, sent.value.detail) == (409, "Emails already sent")


def test_cancelling_a_cancelled_job_again_still_answers_cancelled(db):
    # What a retry after a dropped connection does when the first update did commit.
    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    assert _job(db)["cancelled"] is True


class _Meanwhile(FakeSupabase):
    """Runs ``meanwhile(db)`` once, right after the first read of ``pending_invites``: what the
    dispatcher (or anyone) does between ``cancel_invite``'s read and its update."""

    def __init__(self, meanwhile, **tables):
        super().__init__(**tables)
        self._meanwhile = meanwhile

    def table(self, name):
        query = super().table(name)
        if name == "pending_invites":
            execute = query.execute

            def then_meanwhile():
                result = execute()
                if query._op == "select" and self._meanwhile is not None:
                    meanwhile, self._meanwhile = self._meanwhile, None
                    meanwhile(self)
                return result

            query.execute = then_meanwhile
        return query


def _job(db) -> dict:
    return next(row for row in db.rows("pending_invites") if row["id"] == JOB)


def _racing(monkeypatch, meanwhile) -> FakeSupabase:
    fake = _Meanwhile(meanwhile, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def test_a_cancel_that_loses_the_race_to_the_dispatcher_answers_409(monkeypatch):
    # The dispatcher marks the job sent between the read and the update. Its emails are on
    # their way, so the answer cannot be "cancelled", and the job is not marked cancelled.
    fake = _racing(monkeypatch, lambda db: _job(db).update(sent=True))
    with pytest.raises(HTTPException) as exc:
        classes.cancel_invite(CLASS, JOB, INSTR)
    assert (exc.value.status_code, exc.value.detail) == (409, "Emails already sent")
    assert (_job(fake)["sent"], _job(fake)["cancelled"]) == (True, False)


def test_a_cancel_whose_job_is_gone_meanwhile_answers_404(monkeypatch):
    _racing(monkeypatch, lambda db: db.rows("pending_invites").clear())
    with pytest.raises(HTTPException) as exc:
        classes.cancel_invite(CLASS, JOB, INSTR)
    assert (exc.value.status_code, exc.value.detail) == (404, "Invite job not found")


class _UpdateChangesNothing(FakeSupabase):
    """An update of ``pending_invites`` that matches no row, whatever the rows say."""

    def table(self, name):
        query = super().table(name)
        if name == "pending_invites":
            execute = query.execute
            query.execute = lambda: SimpleNamespace(data=[]) if query._op == "update" else execute()
        return query


def test_a_cancel_that_changed_nothing_never_answers_cancelled(monkeypatch):
    # Postgres cannot get here (nothing un-sends a job), but the answer follows the update.
    fake = _UpdateChangesNothing(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    with pytest.raises(HTTPException) as exc:
        classes.cancel_invite(CLASS, JOB, INSTR)
    assert (exc.value.status_code, exc.value.detail) == (500, "Failed to cancel invite")
    assert _job(fake)["cancelled"] is False


def _outbox_row(row_id: str, batch_id: str, status: str) -> dict:
    return {"id": row_id, "batch_id": batch_id, "status": status, "updated_at": None}


def test_cancelling_a_job_cancels_its_emails_no_dispatcher_has_claimed(db):
    # Rows a tick queued for the job before it could mark the job sent.
    db.rows("email_outbox").extend(
        [
            _outbox_row("queued", JOB, "pending"),
            _outbox_row("going-out", JOB, "sending"),  # past stopping
            _outbox_row("another-job", "job-2", "pending"),
        ]
    )
    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    statuses = {row["id"]: row["status"] for row in db.rows("email_outbox")}
    assert statuses == {"queued": "cancelled", "going-out": "sending", "another-job": "pending"}
    assert next(r for r in db.rows("email_outbox") if r["id"] == "queued")["updated_at"]


class _OutboxFails(FakeSupabase):
    """Every request to ``email_outbox`` raises ``error``."""

    def __init__(self, error, **tables):
        super().__init__(**tables)
        self._error = error

    def table(self, name):
        query = super().table(name)
        if name == "email_outbox":

            def fail():
                raise self._error

            query.execute = fail
        return query


@pytest.mark.parametrize(
    ("error", "logged"),
    [
        # Before the outbox migration there are no queued emails to cancel: nothing to say.
        pytest.param(
            DatabaseError(
                operation="write",
                target="email_outbox",
                pg_code="PGRST205",
                pg_message="Could not find the table 'public.email_outbox' in the schema cache",
            ),
            False,
            id="no-outbox-yet",
        ),
        # Any other failure is logged; the job itself is cancelled either way.
        pytest.param(
            DatabaseUnavailableError(
                operation="write",
                target="email_outbox",
                pg_code="57014",
                pg_message="canceling statement due to statement timeout",
            ),
            True,
            id="outage",
        ),
    ],
)
def test_a_cancel_answers_cancelled_whatever_happens_to_the_queued_emails(
    monkeypatch, caplog, error, logged
):
    fake = _OutboxFails(error, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    with caplog.at_level(logging.WARNING, logger="app.outbox.invite_jobs"):
        assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    assert _job(fake)["cancelled"] is True
    errors = [r.getMessage() for r in caplog.records if r.name == "app.outbox.invite_jobs"]
    assert bool(errors) is logged
    assert all(JOB in message for message in errors)


# -------------------------------------------------------------- class reads

CLASS_READS = {
    "get_class_students": (
        lambda caller, cid: classes.get_class_students(cid, caller),
        NO_CLASS_ACCESS,
    ),
    "get_class_roster": (
        lambda caller, cid: classes.get_class_roster(cid, caller),
        NO_CLASS_ACCESS,
    ),
    "get_class_projects": (
        lambda caller, cid: classes.get_class_projects(cid, caller),
        NO_CLASS_ACCESS,
    ),
    "get_class_projects_overview": (
        lambda caller, cid: classes.get_class_projects_overview(cid, caller),
        NO_CLASS_ACCESS,
    ),
}


@pytest.mark.parametrize("name", sorted(CLASS_READS))
def test_class_reads_answer_403_to_strangers_and_404_for_a_missing_class(db, name):
    call, detail = CLASS_READS[name]
    for caller in (OUTSIDER, OTHER_INSTR):
        with pytest.raises(HTTPException) as exc:
            call(caller, CLASS)
        assert (exc.value.status_code, exc.value.detail) == (403, detail)
    with pytest.raises(HTTPException) as missing:
        call(INSTR, MISSING)
    assert (missing.value.status_code, missing.value.detail) == (404, "Class not found")


@pytest.mark.parametrize("name", sorted(CLASS_READS))
@pytest.mark.parametrize("caller", [INSTR, S1, TA1])
def test_class_reads_admit_the_instructor_and_enrolled_members(db, name, caller):
    CLASS_READS[name][0](caller, CLASS)


# ------------------------------------------------------------------ retries


class _DisconnectOnce(FakeSupabase):
    """Raises a transient httpx error from the first ``table()`` call (the first of ``on``,
    when given), then behaves."""

    def __init__(self, on: str | None = None, **tables):
        super().__init__(**tables)
        self._lock = threading.Lock()
        self._on = on
        self.disconnects = 1

    def table(self, name):
        with self._lock:
            if self.disconnects and self._on in (None, name):
                self.disconnects -= 1
                raise httpx.RemoteProtocolError("Server disconnected")
        return super().table(name)


@pytest.mark.parametrize(
    ("call", "on"),
    [
        # queue_invite is not retried whole: its owner check and its insert are each retried
        # on their own, the insert with the job id chosen before it (so a retry after an
        # insert that did commit cannot queue the batch twice).
        (lambda: classes.queue_invite(CLASS, ["new@ucsc.edu"], INSTR), "classes"),
        (lambda: classes.queue_invite(CLASS, ["new@ucsc.edu"], INSTR), "pending_invites"),
        (lambda: classes.cancel_invite(CLASS, JOB, INSTR), None),
        (lambda: classes.get_class_projects(CLASS, INSTR), None),
        (lambda: classes.get_class_projects_overview(CLASS, INSTR), None),
    ],
    ids=[
        "queue_invite-owner-check",
        "queue_invite-insert",
        "cancel_invite",
        "get_class_projects",
        "get_class_projects_overview",
    ],
)
def test_a_dropped_connection_is_retried_instead_of_answering_500(monkeypatch, call, on):
    flaky = _DisconnectOnce(on, **_world())
    monkeypatch.setattr("app.core.db.service_client", flaky, raising=False)
    call()
    assert flaky.disconnects == 0
