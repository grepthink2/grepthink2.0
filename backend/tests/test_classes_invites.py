"""Behaviour + round-trip budgets for class invites (bulk and single).

Before: ``bulk_invite_students`` read the class and the instructor's profile, then
for every address looked the profile up by edu_email and again by email, checked
the enrollment and inserted it on its own: 2 + up to 4 round trips per address.
``invite_student_to_class`` made 6. Emails are still sent synchronously to the
same recipients; what changed is how the rows are read and written.

Matching is exact on the stripped, lower-cased address, as before: a profile whose
stored email has capitals does not match, and a profile matched by edu_email wins
over one matched by email.
"""

from __future__ import annotations

import smtplib
from collections import Counter

import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
S1, S2, S3, TA1 = "s1", "s2", "s3", "ta-1"
PROF = "prof"  # an instructor account (another class's instructor): invited like anyone
MIXED = "mixed"  # stored email has capitals
EDU_OWNER, EMAIL_OWNER = "edu-owner", "email-owner"  # both answer to dup@ucsc.edu
NO_EMAIL = "no-email"  # matched by edu_email, no primary email on file
CLASS = "class-1"

WRITE_OPS = {"insert", "update", "upsert", "delete"}
EMAIL_CONTEXT = {
    "class_name": "CSE 115C",
    "course_code": "ABCD1234",
    "instructor_name": "Ina Structor",
}


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _profile(uid, email, *, edu=None, role="student", first="", last=""):
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
            _profile(INSTR, "ina@ucsc.edu", role="instructor", first="Ina", last="Structor"),
            _profile(S1, "s1@gmail.com", edu="s1@ucsc.edu", first="Sam", last="One"),
            _profile(S2, "s2@ucsc.edu"),
            _profile(S3, "s3@ucsc.edu"),
            _profile(TA1, "ta1@ucsc.edu"),
            _profile(PROF, "prof@ucsc.edu", role="instructor"),
            _profile(MIXED, "Mixed@UCSC.edu"),
            _profile(EDU_OWNER, "personal@gmail.com", edu="dup@ucsc.edu"),
            _profile(EMAIL_OWNER, "dup@ucsc.edu"),
            _profile(NO_EMAIL, None, edu="noemail@ucsc.edu"),
        ],
        "classes": [
            {"id": CLASS, "created_by": INSTR, "name": "CSE 115C", "course_code": "ABCD1234"}
        ],
        "class_enrollments": [
            {"id": "e-s3", "class_id": CLASS, "user_id": S3, "enrollment_role": "student"},
            {"id": "e-ta1", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
        ],
        "relations": {
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    }


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


class _Mailbox:
    def __init__(self):
        self.sent: list[dict] = []
        self.failing: set[str] = set()

    def send(self, **kwargs):
        self._deliver("send", kwargs)

    def send_or_raise(self, **kwargs):
        self._deliver("send_or_raise", kwargs)

    def _deliver(self, via: str, kwargs: dict):
        if kwargs["to"] in self.failing:
            raise smtplib.SMTPException("mailbox unavailable")
        self.sent.append({"via": via, **kwargs})

    def recipients(self) -> Counter:
        return Counter((m["to"], m["registered"]) for m in self.sent)


@pytest.fixture
def mail(monkeypatch):
    box = _Mailbox()
    monkeypatch.setattr(classes, "send_class_invite_email", box.send)
    monkeypatch.setattr(classes, "send_class_invite_email_or_raise", box.send_or_raise)
    return box


class _FailingDb(FakeSupabase):
    """FakeSupabase whose ``execute()`` raises when ``fails(table, query)`` is true."""

    def __init__(self, fails, **tables):
        super().__init__(**tables)
        self._fails = fails

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(name, query):
                raise RuntimeError("database unavailable")
            return execute()

        query.execute = maybe_fail
        return query


def _address_lookup(table, query) -> bool:
    """Profile reads by address. A profile read by id (the instructor's) still works."""
    return (
        table == "profiles"
        and query._op == "select"
        and not any(f[0] == "id" for f in query._filters)
    )


def _enrollment_write(table, query) -> bool:
    return table == "class_enrollments" and query._op in {"insert", "upsert"}


def _enrolled(db) -> Counter:
    return Counter(r["user_id"] for r in db.rows("class_enrollments") if r["class_id"] == CLASS)


# ------------------------------------------------------------------- bulk

BULK = [
    " S1@ucsc.edu ",  # S1 by edu_email
    "s2@ucsc.edu",
    "s3@ucsc.edu",  # already enrolled
    "ta1@ucsc.edu",  # already enrolled as a TA
    "prof@ucsc.edu",  # an instructor account: enrolled like anyone else
    "new@ucsc.edu",  # no account
    "mixed@ucsc.edu",  # stored as Mixed@UCSC.edu: no match
    "dup@ucsc.edu",  # EDU_OWNER wins over EMAIL_OWNER
    "noemail@ucsc.edu",
    "",
    "   ",
    "s1@gmail.com",  # S1 again, by email
    "s2@ucsc.edu",  # duplicate address
]


def test_bulk_invite_statuses_recipients_and_rows(db, mail):
    out = classes.bulk_invite_students(CLASS, BULK, INSTR)

    statuses = {r["email"]: r["status"] for r in out["results"]}
    assert len(out["results"]) == len(statuses) == 10
    # S1 is listed twice: the first address enrolls, the second finds the enrollment.
    assert sorted([statuses.pop("s1@ucsc.edu"), statuses.pop("s1@gmail.com")]) == [
        "already_enrolled",
        "enrolled",
    ]
    assert statuses == {
        "s2@ucsc.edu": "enrolled",
        "s3@ucsc.edu": "already_enrolled",
        "ta1@ucsc.edu": "already_enrolled",
        "prof@ucsc.edu": "enrolled",
        "new@ucsc.edu": "invited",
        "mixed@ucsc.edu": "invited",
        "dup@ucsc.edu": "enrolled",
        "noemail@ucsc.edu": "enrolled",
    }
    assert (out["enrolled_count"], out["invited_count"]) == (5, 2)

    assert mail.recipients() == Counter(
        {
            ("s1@gmail.com", True): 2,
            ("s2@ucsc.edu", True): 1,
            ("s3@ucsc.edu", True): 1,
            ("ta1@ucsc.edu", True): 1,
            ("prof@ucsc.edu", True): 1,
            ("new@ucsc.edu", False): 1,
            ("mixed@ucsc.edu", False): 1,
            ("personal@gmail.com", True): 1,
            ("noemail@ucsc.edu", True): 1,
        }
    )
    assert all(
        {k: m[k] for k in EMAIL_CONTEXT} == EMAIL_CONTEXT and m["via"] == "send" for m in mail.sent
    )

    assert _enrolled(db) == Counter(
        {S3: 1, TA1: 1, S1: 1, S2: 1, PROF: 1, EDU_OWNER: 1, NO_EMAIL: 1}
    )
    ta_row = next(r for r in db.rows("class_enrollments") if r["user_id"] == TA1)
    assert ta_row["enrollment_role"] == "ta"


def test_bulk_invite_budget(db, mail):
    classes.bulk_invite_students(CLASS, BULK, INSTR)
    # class + instructor profile, profiles, enrollments, one enrollment write
    assert db.executes <= 4, _trace(db)
    assert sum(1 for q in db.queries if q["op"] in WRITE_OPS) == 1, _trace(db)


def test_bulk_invite_looks_addresses_up_in_batches(db, mail):
    emails = [f"new{i}@ucsc.edu" for i in range(150)]
    out = classes.bulk_invite_students(CLASS, emails, INSTR)
    assert {r["status"] for r in out["results"]} == {"invited"}
    assert out["invited_count"] == 150
    assert sum(1 for q in db.queries if q["table"] == "profiles") <= 2, _trace(db)
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]


def test_bulk_invite_email_failures(db, mail):
    mail.failing = {"s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"}
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "enrolled",  # the enrollment stands even though the email bounced
        "s3@ucsc.edu": "email_failed",
        "new@ucsc.edu": "email_failed",
    }
    assert (out["enrolled_count"], out["invited_count"]) == (1, 0)
    assert _enrolled(db)[S2] == 1


def test_bulk_invite_reports_error_when_the_profile_lookup_fails(monkeypatch, mail):
    fake = _FailingDb(_address_lookup, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "error",
        "new@ucsc.edu": "error",
    }
    assert (out["enrolled_count"], out["invited_count"]) == (0, 0)
    assert mail.sent == []
    assert not [q for q in fake.queries if q["op"] in WRITE_OPS]


def test_bulk_invite_reports_error_for_new_students_when_enrolling_fails(monkeypatch, mail):
    fake = _FailingDb(_enrollment_write, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    out = classes.bulk_invite_students(
        CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu", "prof@ucsc.edu"], INSTR
    )
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "error",
        "s3@ucsc.edu": "already_enrolled",
        "new@ucsc.edu": "invited",
        "prof@ucsc.edu": "error",
    }
    assert mail.recipients() == Counter({("s3@ucsc.edu", True): 1, ("new@ucsc.edu", False): 1})


def _make_the_instructor_a_student_account(db):
    """The class decides who its instructor is, not the account role."""
    next(p for p in db.rows("profiles") if p["id"] == INSTR)["role"] = "student"


def test_bulk_invite_reports_the_class_instructor_and_leaves_them_out(db, mail):
    _make_the_instructor_a_student_account(db)
    out = classes.bulk_invite_students(CLASS, ["ina@ucsc.edu", "s2@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "ina@ucsc.edu": "not_a_student",
        "s2@ucsc.edu": "enrolled",
    }
    assert _enrolled(db)[INSTR] == 0
    assert mail.recipients() == Counter({("s2@ucsc.edu", True): 1})


# ----------------------------------------------------------------- single


def test_invite_enrolls_a_registered_student(db, mail):
    out = classes.invite_student_to_class(CLASS, " S2@ucsc.edu ", INSTR)
    assert out == {"message": "Student invited successfully", "student_email": "s2@ucsc.edu"}
    assert _enrolled(db)[S2] == 1
    assert [(m["via"], m["to"], m["registered"]) for m in mail.sent] == [
        ("send", "s2@ucsc.edu", True)
    ]
    assert {k: mail.sent[0][k] for k in EMAIL_CONTEXT} == EMAIL_CONTEXT
    assert db.executes <= 3, _trace(db)


def test_invite_resends_to_an_enrolled_ta_without_touching_the_enrollment(db, mail):
    out = classes.invite_student_to_class(CLASS, "ta1@ucsc.edu", INSTR)
    assert out == {
        "message": "Student already enrolled; invitation email resent",
        "student_email": "ta1@ucsc.edu",
    }
    assert _enrolled(db)[TA1] == 1
    ta_row = next(r for r in db.rows("class_enrollments") if r["user_id"] == TA1)
    assert ta_row["enrollment_role"] == "ta"
    assert mail.recipients() == Counter({("ta1@ucsc.edu", True): 1})
    assert db.executes <= 3, _trace(db)


def test_invite_prefers_the_edu_email_match_and_mails_the_primary_address(db, mail):
    out = classes.invite_student_to_class(CLASS, "dup@ucsc.edu", INSTR)
    assert out["message"] == "Student invited successfully"
    assert _enrolled(db)[EDU_OWNER] == 1 and _enrolled(db)[EMAIL_OWNER] == 0
    assert mail.recipients() == Counter({("personal@gmail.com", True): 1})


def test_invite_without_an_account_sends_a_signup_email(db, mail):
    out = classes.invite_student_to_class(CLASS, "New@ucsc.edu", INSTR)
    assert out == {"message": "Invitation email sent", "student_email": "new@ucsc.edu"}
    assert [(m["via"], m["to"], m["registered"]) for m in mail.sent] == [
        ("send_or_raise", "new@ucsc.edu", False)
    ]
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]
    assert db.executes <= 2, _trace(db)


def test_invite_enrolls_an_account_whose_role_is_instructor(db, mail):
    # PROF may teach elsewhere; here they are invited, as a TA would be.
    out = classes.invite_student_to_class(CLASS, "prof@ucsc.edu", INSTR)
    assert out == {"message": "Student invited successfully", "student_email": "prof@ucsc.edu"}
    assert _enrolled(db)[PROF] == 1
    assert mail.recipients() == Counter({("prof@ucsc.edu", True): 1})


def test_invite_refuses_the_class_instructor(db, mail):
    _make_the_instructor_a_student_account(db)
    with pytest.raises(HTTPException) as exc:
        classes.invite_student_to_class(CLASS, "ina@ucsc.edu", INSTR)
    assert (exc.value.status_code, exc.value.detail) == (
        400,
        "You are the instructor of this class",
    )
    assert mail.sent == []
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]


def test_invite_email_failure_answers(db, mail):
    mail.failing = {"s2@ucsc.edu", "s3@ucsc.edu"}
    newly = classes.invite_student_to_class(CLASS, "s2@ucsc.edu", INSTR)
    assert newly == {
        "message": "Student enrolled, but the notification email could not be sent",
        "student_email": "s2@ucsc.edu",
    }
    assert _enrolled(db)[S2] == 1
    with pytest.raises(HTTPException) as already:
        classes.invite_student_to_class(CLASS, "s3@ucsc.edu", INSTR)
    assert (already.value.status_code, already.value.detail) == (
        502,
        "Failed to send invitation email",
    )


def test_manual_roster_add_matches_the_profile_with_one_lookup(db):
    out = classes.add_manual_roster_student(CLASS, " Sam ", "One", " S1@UCSC.edu ", INSTR)
    assert out["message"] == "Student added to roster"
    entry = out["entry"]
    assert {
        k: entry[k]
        for k in (
            "course_id",
            "email",
            "status",
            "first_name",
            "last_name",
            "matched_profile_id",
            "is_manual",
        )
    } == {
        "course_id": CLASS,
        "email": "s1@ucsc.edu",
        "status": "manual",
        "first_name": "Sam",
        "last_name": "One",
        "matched_profile_id": S1,
        "is_manual": True,
    }
    # class, duplicate check, profile lookup (was 2), insert
    assert db.executes <= 4, _trace(db)

    with pytest.raises(HTTPException) as duplicate:
        classes.add_manual_roster_student(CLASS, "Sam", "One", "s1@ucsc.edu", INSTR)
    assert (duplicate.value.status_code, duplicate.value.detail) == (
        409,
        "This student is already on the roster",
    )


def test_addresses_with_postgrest_reserved_characters_are_quoted_in_the_lookup():
    # Plain addresses go into the or=(...) filter as-is, like .in_() values.
    assert classes._postgrest_value("s1@ucsc.edu") == "s1@ucsc.edu"
    assert classes._postgrest_value("o'hara+tag@ucsc.edu") == "o'hara+tag@ucsc.edu"
    # A comma or parenthesis would split the list; quote, and escape " and \ inside.
    assert classes._postgrest_value("a,b@ucsc.edu") == '"a,b@ucsc.edu"'
    assert classes._postgrest_value("(x)@ucsc.edu") == '"(x)@ucsc.edu"'
    assert classes._postgrest_value('say"hi"@ucsc.edu') == '"say\\"hi\\"@ucsc.edu"'
    assert classes._postgrest_value("back\\slash@ucsc.edu") == '"back\\\\slash@ucsc.edu"'
