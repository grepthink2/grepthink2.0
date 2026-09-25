"""Access rules for app.classes: who may call each controller, and the exact
answer everyone else gets.

Instructor-only routes answer 404 "Class not found" when the class does not
exist and 403 "Only the class instructor can do this" to everyone else. Class
reads (students, roster, projects) are open to the class instructor and to
enrolled students and TAs: 404 for a missing class, 403 for everyone else.

These tests pin those status codes and messages, and assert that a denied call
writes nothing and sends no email. The retry tests cover
``@retry_on_disconnect``: a dropped connection has to reach the decorator
instead of becoming a 500 first.
"""

from __future__ import annotations

import threading

import httpx
import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr", "instr-2"
TA1, S1, OUTSIDER = "ta-1", "s1", "outsider"
CLASS, MISSING = "class-1", "no-such-class"
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
    """CLASS belongs to INSTR; TA1 (ta) and S1 (student) are enrolled; S1 is on P1."""
    return {
        "profiles": [
            _profile(INSTR, "instructor"),
            _profile(OTHER_INSTR, "instructor"),
            _profile(TA1),
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
            }
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
    sent: list[dict] = []

    def record(**kwargs):
        sent.append(kwargs)

    monkeypatch.setattr(classes, "send_class_invite_email", record)
    monkeypatch.setattr(classes, "send_class_invite_email_or_raise", record)
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
    "get_class_turn_in_stats": lambda caller, cid: classes.get_class_turn_in_stats(cid, caller),
}


@pytest.mark.parametrize("name", sorted(INSTRUCTOR_ONLY))
@pytest.mark.parametrize(
    ("caller", "cid", "status", "detail"),
    [
        (OTHER_INSTR, CLASS, 403, NOT_CLASS_INSTRUCTOR),
        (S1, CLASS, 403, NOT_CLASS_INSTRUCTOR),
        (INSTR, MISSING, 404, CLASS_NOT_FOUND),
    ],
    ids=["other-instructor", "enrolled-student", "missing-class"],
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
    job = next(r for r in db.rows("pending_invites") if r["id"] == out["job_id"])
    assert (job["class_id"], job["instructor_id"], job["emails"]) == (
        CLASS,
        INSTR,
        ["new@ucsc.edu"],
    )
    assert db.executes == 2, _trace(db)


def test_cancel_invite_answers(db):
    assert classes.cancel_invite(CLASS, JOB, INSTR) == {"cancelled": True}
    with pytest.raises(HTTPException) as other:
        classes.cancel_invite(CLASS, JOB, OTHER_INSTR)
    assert (other.value.status_code, other.value.detail) == (404, "Invite job not found")
    db.rows("pending_invites")[0]["sent"] = True
    with pytest.raises(HTTPException) as sent:
        classes.cancel_invite(CLASS, JOB, INSTR)
    assert (sent.value.status_code, sent.value.detail) == (409, "Emails already sent")


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
    """Raises a transient httpx error from the first ``table()`` call, then behaves."""

    def __init__(self, **tables):
        super().__init__(**tables)
        self._lock = threading.Lock()
        self.disconnects = 1

    def table(self, name):
        with self._lock:
            if self.disconnects:
                self.disconnects -= 1
                raise httpx.RemoteProtocolError("Server disconnected")
        return super().table(name)


@pytest.mark.parametrize(
    "call",
    [
        lambda: classes.queue_invite(CLASS, ["new@ucsc.edu"], INSTR),
        lambda: classes.cancel_invite(CLASS, JOB, INSTR),
        lambda: classes.get_class_projects(CLASS, INSTR),
        lambda: classes.get_class_projects_overview(CLASS, INSTR),
    ],
    ids=["queue_invite", "cancel_invite", "get_class_projects", "get_class_projects_overview"],
)
def test_a_dropped_connection_is_retried_instead_of_answering_500(monkeypatch, call):
    flaky = _DisconnectOnce(**_world())
    monkeypatch.setattr("app.core.db.service_client", flaky, raising=False)
    call()
    assert flaky.disconnects == 0
