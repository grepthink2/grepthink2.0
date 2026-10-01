"""Behaviour + round-trip budgets for class invites (bulk and single).

Before: ``bulk_invite_students`` read the class and the instructor's profile, then
for every address looked the profile up by edu_email and again by email, checked
the enrollment and inserted it on its own: 2 + up to 4 round trips per address.
``invite_student_to_class`` made 6. Both now plan their addresses the same way
(``_plan_invites``) and send through the email outbox: one ``class_invite`` row per
email, inserted leased to the request, which sends it before answering. The outbox
runs for real here, against FakeSupabase, with ``_Transport`` standing in for the
mail provider.

Matching is exact on the stripped, lower-cased address, as before: a profile whose
stored email has capitals does not match, and a profile matched by edu_email wins
over one matched by email.
"""

from __future__ import annotations

import logging
from collections import Counter

import pytest
from fastapi import HTTPException

from app.classes import controller as classes
from app.config import settings
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.utils.email_transport import (
    EmailMessage,
    EmailMisconfiguredError,
    PermanentEmailError,
    TransientEmailError,
)
from tests.conftest import make_token
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

#: How the transport can fail. A rejected address is final; a provider outage clears by itself
#: (the outbox retries); a transport that refuses us pauses the outbox until it is fixed.
PERMANENT = PermanentEmailError("Maileroo rejected the email (HTTP 400: invalid address)")
TRANSIENT = TransientEmailError("Maileroo could not take the email (HTTP 503)")
MISCONFIGURED = EmailMisconfiguredError("Maileroo refused the request (HTTP 401)")


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
        # The outbox's tables: its rows, the addresses not to mail, and the in-app notice the
        # instructor gets when an invite cannot be delivered.
        "email_outbox": [],
        "email_suppressions": [],
        "notifications": [],
        "relations": {
            ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
        },
    }


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _registered(message: EmailMessage) -> bool:
    """Which invite ``message`` is: "You've been added to ..." for an account, "Join ..." not."""
    if message.subject.startswith("You've been added to "):
        return True
    assert message.subject.startswith("Join "), message.subject
    return False


class _Transport:
    """Stands in for ``email_transport.send``: records each message, or raises the error chosen
    for its address."""

    def __init__(self):
        self.attempts: list[EmailMessage] = []
        self.sent: list[EmailMessage] = []
        self.failures: dict[str, Exception] = {}

    def fail(self, error: Exception, *addresses: str) -> None:
        self.failures.update(dict.fromkeys(addresses, error))

    def send(self, message: EmailMessage) -> str:
        self.attempts.append(message)
        error = self.failures.get(message.to)
        if error is not None:
            raise error
        self.sent.append(message)
        return f"ref-{len(self.sent)}"

    def recipients(self) -> Counter:
        """(address, registered) of every email sent."""
        return Counter((m.to, _registered(m)) for m in self.sent)


@pytest.fixture
def mail(monkeypatch):
    transport = _Transport()
    monkeypatch.setattr("app.utils.email_transport.send", transport.send)
    return transport


def _outage(table: str) -> Exception:
    """What the client raises while the database is down."""
    return DatabaseUnavailableError(
        operation="read",
        target=table,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


class _FailingDb(FakeSupabase):
    """FakeSupabase whose ``execute()`` raises ``error(table)`` when ``fails(table, query)`` is
    true: a database outage unless the test says otherwise."""

    def __init__(self, fails, error=_outage, **tables):
        super().__init__(**tables)
        self._fails = fails
        self._error = error

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(name, query):
                raise self._error(name)
            return execute()

        query.execute = maybe_fail
        return query


class _NoOutbox(FakeSupabase):
    """Before ``2026-09-30_email_outbox.sql``: writing to ``email_outbox`` fails the way a
    missing table does, so invites are sent directly (``deliver_now``)."""

    def table(self, name):
        query = super().table(name)
        if name == "email_outbox":

            def missing():
                raise DatabaseError(
                    operation="write",
                    target=name,
                    pg_code="PGRST205",
                    pg_message="Could not find the table 'public.email_outbox' in the schema cache",
                )

            query.execute = missing
        return query


@pytest.fixture
def no_outbox(monkeypatch):
    fake = _NoOutbox(**_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


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


def _non_outbox_writes(db) -> list[str]:
    return [
        f"{q['table']}:{q['op']}"
        for q in db.queries
        if q["op"] in WRITE_OPS and q["table"] != "email_outbox"
    ]


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

#: What BULK reports, its emails all delivered (S1 is listed twice: the first of its addresses
#: enrolls, the second finds the enrollment; the order between the two is not pinned).
BULK_STATUSES = {
    "s2@ucsc.edu": "enrolled",
    "s3@ucsc.edu": "already_enrolled",
    "ta1@ucsc.edu": "already_enrolled",
    "prof@ucsc.edu": "enrolled",
    "new@ucsc.edu": "invited",
    "mixed@ucsc.edu": "invited",
    "dup@ucsc.edu": "enrolled",
    "noemail@ucsc.edu": "enrolled",
}
BULK_RECIPIENTS = Counter(
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


def _assert_bulk_statuses(out: dict) -> None:
    statuses = {r["email"]: r["status"] for r in out["results"]}
    assert len(out["results"]) == len(statuses) == 10
    assert sorted([statuses.pop("s1@ucsc.edu"), statuses.pop("s1@gmail.com")]) == [
        "already_enrolled",
        "enrolled",
    ]
    assert statuses == BULK_STATUSES
    assert (out["enrolled_count"], out["invited_count"], out["queued_count"]) == (5, 2, 0)


def test_bulk_invite_statuses_recipients_and_rows(db, mail):
    out = classes.bulk_invite_students(CLASS, BULK, INSTR)

    _assert_bulk_statuses(out)
    assert mail.recipients() == BULK_RECIPIENTS

    rows = db.rows("email_outbox")
    assert len(rows) == 10
    assert {(r["kind"], r["status"], r["class_id"], r["created_by"]) for r in rows} == {
        ("class_invite", "sent", CLASS, INSTR)
    }
    assert all({k: r["payload"][k] for k in EMAIL_CONTEXT} == EMAIL_CONTEXT for r in rows)
    # An email to an account names it; a signup invite has nobody to name.
    assert {r["to_email"]: r["user_id"] for r in rows} == {
        "s1@gmail.com": S1,
        "s2@ucsc.edu": S2,
        "s3@ucsc.edu": S3,
        "ta1@ucsc.edu": TA1,
        "prof@ucsc.edu": PROF,
        "new@ucsc.edu": None,
        "mixed@ucsc.edu": None,
        "personal@gmail.com": EDU_OWNER,
        "noemail@ucsc.edu": NO_EMAIL,
    }

    assert _enrolled(db) == Counter(
        {S3: 1, TA1: 1, S1: 1, S2: 1, PROF: 1, EDU_OWNER: 1, NO_EMAIL: 1}
    )
    ta_row = next(r for r in db.rows("class_enrollments") if r["user_id"] == TA1)
    assert ta_row["enrollment_role"] == "ta"


def test_bulk_invite_budget(db, mail):
    classes.bulk_invite_students(CLASS, BULK, INSTR)
    emails = len(mail.sent)
    assert emails == 10
    # The plan is unchanged: class + instructor profile, profiles, enrollments, one enrollment
    # write. The emails now go through the outbox: one insert for all of them, one suppression
    # read, and one status write per email (the outbox records each one it sent).
    assert db.executes <= 4 + 2 + emails, _trace(db)
    writes = Counter(q["table"] for q in db.queries if q["op"] in WRITE_OPS)
    assert writes == Counter({"class_enrollments": 1, "email_outbox": 1 + emails}), _trace(db)


def test_bulk_invite_looks_addresses_up_in_batches(db, mail):
    emails = [f"new{i}@ucsc.edu" for i in range(150)]
    out = classes.bulk_invite_students(CLASS, emails, INSTR)
    assert {r["status"] for r in out["results"]} == {"invited"}
    assert out["invited_count"] == 150
    assert sum(1 for q in db.queries if q["table"] == "profiles") <= 2, _trace(db)
    # Nobody is enrolled: the only writes are the outbox's.
    assert not _non_outbox_writes(db)
    assert len(mail.sent) == 150


@pytest.mark.parametrize(
    ("error", "statuses", "queued"),
    [
        # Rejected: the enrollment stands even though the email bounced; the rest failed.
        pytest.param(
            PERMANENT,
            {
                "s2@ucsc.edu": "enrolled",
                "s3@ucsc.edu": "email_failed",
                "new@ucsc.edu": "email_failed",
            },
            0,
            id="permanent",
        ),
        # A provider outage: the outbox retries the invite and the reminder later.
        pytest.param(
            TRANSIENT,
            {"s2@ucsc.edu": "enrolled", "s3@ucsc.edu": "queued", "new@ucsc.edu": "queued"},
            2,
            id="transient",
        ),
        # The provider refuses us: the run pauses after the first, and every email waits.
        pytest.param(
            MISCONFIGURED,
            {"s2@ucsc.edu": "enrolled", "s3@ucsc.edu": "queued", "new@ucsc.edu": "queued"},
            2,
            id="misconfigured",
        ),
    ],
)
def test_bulk_invite_email_failures(db, mail, error, statuses, queued):
    mail.fail(error, "s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu")
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == statuses
    assert (out["enrolled_count"], out["invited_count"], out["queued_count"]) == (1, 0, queued)
    assert _enrolled(db)[S2] == 1
    assert mail.sent == []


def test_a_rejected_invite_is_reported_to_the_instructor_in_the_app(db, mail):
    mail.fail(PERMANENT, "new@ucsc.edu")
    classes.bulk_invite_students(CLASS, ["new@ucsc.edu", "s2@ucsc.edu"], INSTR)
    [note] = db.rows("notifications")
    assert (note["user_id"], note["type"], note["entity_id"]) == (
        INSTR,
        "email_undeliverable",
        CLASS,
    )
    assert "new@ucsc.edu" in note["body"]


def test_a_misconfigured_transport_is_tried_once_per_request(db, mail):
    mail.fail(MISCONFIGURED, "s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu")
    classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"], INSTR)
    # Every other email would fail the same way, so they wait (unattempted) for the pause to end.
    assert [m.to for m in mail.attempts] == ["s2@ucsc.edu"]
    assert {(r["status"], r["attempts"]) for r in db.rows("email_outbox")} == {("pending", 0)}


def test_bulk_invite_without_time_to_send_leaves_the_emails_to_the_dispatcher(
    db, mail, monkeypatch
):
    monkeypatch.setattr(settings, "EMAIL_INLINE_BUDGET_SECONDS", 0)
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "enrolled",
        "s3@ucsc.edu": "queued",
        "new@ucsc.edu": "queued",
    }
    assert out["queued_count"] == 2
    assert mail.attempts == []
    # Back in the queue, untried and due now, for the dispatcher.
    assert {(r["status"], r["attempts"], r["locked_until"]) for r in db.rows("email_outbox")} == {
        ("pending", 0, None)
    }


def test_a_suppressed_address_is_not_emailed(db, mail):
    # It bounced or complained before: the outbox skips it, and the instructor hears why.
    db.rows("email_suppressions").extend(
        [
            {"email": "new@ucsc.edu", "reason": "bounced"},
            {"email": "s2@ucsc.edu", "reason": "complained"},
            {"email": "ta1@ucsc.edu", "reason": "rejected"},
        ]
    )
    out = classes.bulk_invite_students(CLASS, ["new@ucsc.edu", "s2@ucsc.edu", "s3@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "new@ucsc.edu": "email_failed",
        "s2@ucsc.edu": "enrolled",
        "s3@ucsc.edu": "already_enrolled",
    }
    assert mail.recipients() == Counter({("s3@ucsc.edu", True): 1})
    assert {(n["user_id"], n["type"], n["entity_id"]) for n in db.rows("notifications")} == {
        (INSTR, "email_undeliverable", CLASS)
    }

    assert classes.invite_student_to_class(CLASS, "s1@ucsc.edu", INSTR)["message"] == (
        "Student invited successfully"
    )
    db.rows("email_suppressions").append({"email": "s1@gmail.com", "reason": "bounced"})
    with pytest.raises(HTTPException) as skipped:
        classes.invite_student_to_class(CLASS, "s1@ucsc.edu", INSTR)
    assert (skipped.value.status_code, skipped.value.detail) == FAILED_TO_SEND
    with pytest.raises(HTTPException) as skipped:
        classes.invite_student_to_class(CLASS, "ta1@ucsc.edu", INSTR)
    assert (skipped.value.status_code, skipped.value.detail) == FAILED_TO_SEND


def test_a_suppressed_address_of_a_new_enrollment_says_the_email_was_not_sent(db, mail):
    db.rows("email_suppressions").append({"email": "s2@ucsc.edu", "reason": "bounced"})
    out = classes.invite_student_to_class(CLASS, "s2@ucsc.edu", INSTR)
    assert out == {
        "message": "Student enrolled, but the notification email could not be sent",
        "student_email": "s2@ucsc.edu",
    }
    assert _enrolled(db)[S2] == 1
    assert mail.sent == []


def test_bulk_invite_reports_error_when_the_profile_lookup_fails(monkeypatch, mail):
    fake = _FailingDb(_address_lookup, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "error",
        "new@ucsc.edu": "error",
    }
    assert (out["enrolled_count"], out["invited_count"], out["queued_count"]) == (0, 0, 0)
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
        "ina@ucsc.edu": "class_instructor",
        "s2@ucsc.edu": "enrolled",
    }
    assert _enrolled(db)[INSTR] == 0
    assert mail.recipients() == Counter({("s2@ucsc.edu", True): 1})


# ----------------------------------------------------------------- single


def test_invite_enrolls_a_registered_student(db, mail):
    out = classes.invite_student_to_class(CLASS, " S2@ucsc.edu ", INSTR)
    assert out == {"message": "Student invited successfully", "student_email": "s2@ucsc.edu"}
    assert _enrolled(db)[S2] == 1
    assert mail.recipients() == Counter({("s2@ucsc.edu", True): 1})
    [row] = db.rows("email_outbox")
    assert {k: row["payload"][k] for k in EMAIL_CONTEXT} == EMAIL_CONTEXT
    assert (row["status"], row["user_id"], row["class_id"], row["created_by"]) == (
        "sent",
        S2,
        CLASS,
        INSTR,
    )
    # class + instructor profile, profile, enrollment read, enrollment write (the plan a bulk
    # invite makes, which reads the enrollment first), then the outbox: insert, suppression
    # read, status write.
    assert db.executes <= 7, _trace(db)


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
    # The plan reads the enrollment first, so nothing is written to it.
    assert not _non_outbox_writes(db), _trace(db)
    # class + instructor profile, profile, enrollment read; outbox insert, suppression read,
    # status write.
    assert db.executes <= 6, _trace(db)


def test_invite_prefers_the_edu_email_match_and_mails_the_primary_address(db, mail):
    out = classes.invite_student_to_class(CLASS, "dup@ucsc.edu", INSTR)
    assert out["message"] == "Student invited successfully"
    assert _enrolled(db)[EDU_OWNER] == 1 and _enrolled(db)[EMAIL_OWNER] == 0
    assert mail.recipients() == Counter({("personal@gmail.com", True): 1})


def test_invite_without_an_account_sends_a_signup_email(db, mail):
    out = classes.invite_student_to_class(CLASS, "New@ucsc.edu", INSTR)
    assert out == {"message": "Invitation email sent", "student_email": "new@ucsc.edu"}
    assert mail.recipients() == Counter({("new@ucsc.edu", False): 1})
    assert not _non_outbox_writes(db), _trace(db)
    [row] = db.rows("email_outbox")
    assert (row["status"], row["user_id"]) == ("sent", None)
    # class + instructor profile, profile; outbox insert, suppression read, status write.
    assert db.executes <= 5, _trace(db)


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
    # The same answer as joining one's own class by code (test_authz_status_policy.py).
    assert (exc.value.status_code, exc.value.detail) == (
        409,
        "You are the instructor of this class",
    )
    assert mail.sent == []
    assert not [q for q in db.queries if q["op"] in WRITE_OPS]


@pytest.mark.parametrize("fails", [_address_lookup, _enrollment_write], ids=["lookup", "enroll"])
def test_a_single_invite_during_a_database_outage_answers_with_the_outage(monkeypatch, mail, fails):
    # Raised as it was before the outbox: the DatabaseError handler answers 503 + Retry-After.
    fake = _FailingDb(fails, **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    with pytest.raises(DatabaseUnavailableError) as exc:
        classes.invite_student_to_class(CLASS, "s2@ucsc.edu", INSTR)
    assert (exc.value.status_code, exc.value.code, exc.value.headers) == (
        503,
        "database_unavailable",
        {"Retry-After": "5"},
    )
    assert mail.attempts == []
    assert fake.rows("email_outbox") == []


@pytest.mark.parametrize("fails", [_address_lookup, _enrollment_write], ids=["lookup", "enroll"])
def test_a_single_invite_answers_500_when_the_lookup_or_the_enrollment_breaks(
    monkeypatch, mail, caplog, fails
):
    fake = _FailingDb(fails, lambda table: RuntimeError("a bug"), **_world())
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    with (
        caplog.at_level(logging.ERROR, logger="app.classes.controller"),
        pytest.raises(HTTPException) as exc,
    ):
        classes.invite_student_to_class(CLASS, "s2@ucsc.edu", INSTR)
    assert type(exc.value) is HTTPException
    assert (exc.value.status_code, exc.value.detail) == (500, "Failed to invite student")
    [logged] = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert isinstance(logged.exc_info[1], RuntimeError)
    assert mail.attempts == []


PROBE_INSTR = "11111111-2222-4333-8444-555555555555"
PROBE_CLASS = "c1a55000-0000-4000-8000-000000000001"


def test_the_invite_route_answers_503_with_retry_after_during_a_database_outage(
    client, monkeypatch, mail
):
    world = _world()
    world["profiles"].append(_profile(PROBE_INSTR, "probe@ucsc.edu", role="instructor"))
    world["classes"].append(
        {"id": PROBE_CLASS, "created_by": PROBE_INSTR, "name": "CSE 115A", "course_code": "WXYZ"}
    )
    fake = _FailingDb(_address_lookup, **world)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)

    res = client.post(
        f"/api/classes/{PROBE_CLASS}/invite",
        headers={"Authorization": f"Bearer {make_token(sub=PROBE_INSTR)}"},
        json={"student_email": "s2@ucsc.edu"},
    )

    assert res.status_code == 503, res.text
    assert res.headers["Retry-After"] == "5"
    assert res.json()["code"] == "database_unavailable"
    assert mail.attempts == []


@pytest.fixture
def bulk_calls(monkeypatch) -> list[tuple]:
    """The bulk-invite controller is replaced: what reaches it, if anything."""
    calls: list[tuple] = []

    def record(*args, **kwargs):
        calls.append(args)
        return {"results": [], "enrolled_count": 0, "invited_count": 0, "queued_count": 0}

    monkeypatch.setattr("app.classes.views.controller.bulk_invite_students", record)
    return calls


def _bulk(client, emails: list[str]):
    return client.post(
        f"/api/classes/{PROBE_CLASS}/students/bulk-invite",
        headers={"Authorization": f"Bearer {make_token(sub=PROBE_INSTR)}"},
        json={"emails": emails},
    )


def test_a_bulk_invite_names_at_most_500_addresses(client, bulk_calls):
    addresses = [f"s{n}@ucsc.edu" for n in range(501)]
    assert _bulk(client, addresses).status_code == 422
    assert bulk_calls == []

    res = _bulk(client, addresses[:500])
    assert res.status_code == 200, res.text
    assert len(bulk_calls) == 1


@pytest.mark.parametrize(
    "address",
    [
        "b" + "a" * 245 + "@ucsc.edu",  # 255 characters
        "ann@ucsc.edu\nBcc: everyone@ucsc.edu",
        "ann@ucsc.edu\N{LINE SEPARATOR}",
    ],
    ids=["too-long", "line-feed", "line-separator"],
)
def test_a_bulk_invite_refuses_an_address_too_long_or_with_a_line_break(
    client, bulk_calls, address
):
    assert _bulk(client, [address]).status_code == 422
    assert bulk_calls == []

    longest = "a" * 245 + "@ucsc.edu"  # 254 characters, as long as an address can be
    res = _bulk(client, [longest])
    assert res.status_code == 200, res.text
    assert len(bulk_calls) == 1


NO_ROLE = "no-role"  # signed up with Google and has not picked a role on /select yet


def _add_an_account_without_a_role(db) -> None:
    db.rows("profiles").append(_profile(NO_ROLE, "norole@gmail.com", role=None))


def test_invite_enrolls_an_account_that_has_not_picked_a_role(db, mail):
    # Unlike joining by code (403 until a role is picked), an invite names the address, and the
    # app sends a role-less user to /select before anything else.
    _add_an_account_without_a_role(db)
    out = classes.invite_student_to_class(CLASS, "norole@gmail.com", INSTR)
    assert out == {"message": "Student invited successfully", "student_email": "norole@gmail.com"}
    assert _enrolled(db)[NO_ROLE] == 1
    assert mail.recipients() == Counter({("norole@gmail.com", True): 1})


def test_bulk_invite_enrolls_an_account_that_has_not_picked_a_role(db, mail):
    _add_an_account_without_a_role(db)
    out = classes.bulk_invite_students(CLASS, ["norole@gmail.com"], INSTR)
    assert out["results"] == [{"email": "norole@gmail.com", "status": "enrolled"}]
    assert _enrolled(db)[NO_ROLE] == 1
    assert mail.recipients() == Counter({("norole@gmail.com", True): 1})


FAILED_TO_SEND = (502, "Failed to send invitation email")
#: The answers while the outbox keeps trying (``queued``).
QUEUED_ANSWERS = {
    "s2@ucsc.edu": "Student enrolled; the notification email is queued and will be retried",
    "s3@ucsc.edu": "Student already enrolled; invitation email queued",
    "new@ucsc.edu": "Invitation email queued; it will be sent shortly",
}


@pytest.mark.parametrize(
    ("error", "answers"),
    [
        # Rejected: a new enrollment stands and says so; a reminder or an invite answers 502.
        pytest.param(
            PERMANENT,
            {
                "s2@ucsc.edu": "Student enrolled, but the notification email could not be sent",
                "s3@ucsc.edu": FAILED_TO_SEND,
                "new@ucsc.edu": FAILED_TO_SEND,
            },
            id="permanent",
        ),
        pytest.param(TRANSIENT, QUEUED_ANSWERS, id="transient"),
        pytest.param(MISCONFIGURED, QUEUED_ANSWERS, id="misconfigured"),
    ],
)
def test_invite_email_failure_answers(db, mail, error, answers):
    # s2 is enrolled by this invite, s3 was enrolled before, new has no account.
    mail.fail(error, *answers)
    for address, answer in answers.items():
        if answer == FAILED_TO_SEND:
            with pytest.raises(HTTPException) as failed:
                classes.invite_student_to_class(CLASS, address, INSTR)
            assert (failed.value.status_code, failed.value.detail) == FAILED_TO_SEND
        else:
            out = classes.invite_student_to_class(CLASS, address, INSTR)
            assert out == {"message": answer, "student_email": address}
    assert _enrolled(db)[S2] == 1
    assert mail.sent == []


def test_invite_without_time_to_send_says_the_email_is_queued(db, mail, monkeypatch):
    monkeypatch.setattr(settings, "EMAIL_INLINE_BUDGET_SECONDS", 0)
    for address, answer in QUEUED_ANSWERS.items():
        out = classes.invite_student_to_class(CLASS, address, INSTR)
        assert out == {"message": answer, "student_email": address}
    assert mail.attempts == []


# ------------------------------------------- before the outbox migration


def test_before_the_outbox_migration_bulk_invites_are_sent_directly(no_outbox, mail):
    out = classes.bulk_invite_students(CLASS, BULK, INSTR)
    _assert_bulk_statuses(out)
    assert mail.recipients() == BULK_RECIPIENTS
    assert no_outbox.rows("email_outbox") == []


@pytest.mark.parametrize("error", [PERMANENT, TRANSIENT], ids=["permanent", "transient"])
def test_before_the_outbox_migration_a_failed_email_answers_as_it_did(no_outbox, mail, error):
    # Sent directly there is nobody to retry: every failure is final, as before the outbox.
    mail.fail(error, "s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu")
    out = classes.bulk_invite_students(CLASS, ["s2@ucsc.edu", "s3@ucsc.edu", "new@ucsc.edu"], INSTR)
    assert {r["email"]: r["status"] for r in out["results"]} == {
        "s2@ucsc.edu": "enrolled",
        "s3@ucsc.edu": "email_failed",
        "new@ucsc.edu": "email_failed",
    }
    assert out["queued_count"] == 0


def test_before_the_outbox_migration_single_invites_answer_as_they_did(no_outbox, mail):
    sent = {
        "s2@ucsc.edu": "Student invited successfully",
        "ta1@ucsc.edu": "Student already enrolled; invitation email resent",
        "new@ucsc.edu": "Invitation email sent",
    }
    for address, answer in sent.items():
        out = classes.invite_student_to_class(CLASS, address, INSTR)
        assert out == {"message": answer, "student_email": address}

    mail.fail(TRANSIENT, "s1@gmail.com", "s3@ucsc.edu", "other@ucsc.edu")
    out = classes.invite_student_to_class(CLASS, "s1@ucsc.edu", INSTR)
    assert out == {
        "message": "Student enrolled, but the notification email could not be sent",
        "student_email": "s1@ucsc.edu",
    }
    for address in ("s3@ucsc.edu", "other@ucsc.edu"):
        with pytest.raises(HTTPException) as failed:
            classes.invite_student_to_class(CLASS, address, INSTR)
        assert (failed.value.status_code, failed.value.detail) == FAILED_TO_SEND

    assert mail.recipients() == Counter(
        {("s2@ucsc.edu", True): 1, ("ta1@ucsc.edu", True): 1, ("new@ucsc.edu", False): 1}
    )
    assert no_outbox.rows("email_outbox") == []


# ---------------------------------------------------------------- roster


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
