"""Round-trip budgets + behaviour for app.messages after batching.

Before: ``has_shared_class`` read the classes each user owns and each user's
enrollments one user at a time — four sequential round trips on every DM send
(``can_message`` = one role read + those four).

``FakeSupabase`` counts every ``.execute()``; each test pins the answer and an
upper bound on round trips. Reads fanned out with ``fan_out`` run on the query
pool, so traces are compared sorted.
"""

from __future__ import annotations

import pytest

from app.messages import controller as messages
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr-1", "instr-2"
TA = "ta-1"
S1, S2, S3 = "stu-1", "stu-2", "stu-3"
ORPHAN = "stu-orphan"  # enrolled, but has no profiles row
NOBODY = "nobody"  # no rows anywhere
C1, C2, C3 = "class-1", "class-2", "class-3"


def _trace(db) -> list[str]:
    return sorted(f"{q['table']}:{q['op']}" for q in db.queries)


def _profile(uid, first, last, role="student", email=None):
    return {
        "id": uid,
        "email": email or f"{uid}@ucsc.edu",
        "role": role,
        "first_name": first,
        "last_name": last,
        "image_url": f"https://img.example/{uid}.png",
    }


@pytest.fixture
def db(monkeypatch):
    """C1 (owned by INSTR): TA and OTHER_INSTR as TAs; S1, S2 and ORPHAN as students.
    C2 (owned by OTHER_INSTR): S1 and S3. C3 (owned by INSTR): nobody enrolled."""
    fake = FakeSupabase(
        profiles=[
            _profile(INSTR, "Ina", "Irwin", role="instructor"),
            _profile(OTHER_INSTR, "Ivo", "Olsen", role="instructor"),
            _profile(TA, "Tara", "Tran"),
            _profile(S1, "Sam", "Stone"),
            _profile(S2, None, None, email="bea@ucsc.edu"),  # no name: sorts by email
            _profile(S3, "Zed", "Zhou"),
        ],
        classes=[
            {"id": C1, "created_by": INSTR},
            {"id": C2, "created_by": OTHER_INSTR},
            {"id": C3, "created_by": INSTR},
        ],
        class_enrollments=[
            {"id": "e1", "class_id": C1, "user_id": TA, "enrollment_role": "ta"},
            {"id": "e2", "class_id": C1, "user_id": OTHER_INSTR, "enrollment_role": "ta"},
            {"id": "e3", "class_id": C1, "user_id": S1, "enrollment_role": "student"},
            {"id": "e4", "class_id": C1, "user_id": S2, "enrollment_role": "student"},
            {"id": "e5", "class_id": C1, "user_id": ORPHAN, "enrollment_role": "student"},
            {"id": "e6", "class_id": C2, "user_id": S1, "enrollment_role": "student"},
            {"id": "e7", "class_id": C2, "user_id": S3, "enrollment_role": "student"},
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


# ------------------------------------------------------------ has_shared_class


@pytest.mark.parametrize(
    ("a", "b", "shared"),
    [
        pytest.param(INSTR, S1, True, id="owner-and-student"),
        pytest.param(S1, INSTR, True, id="student-and-owner"),
        pytest.param(S1, S2, True, id="two-students"),
        pytest.param(S1, S3, True, id="students-sharing-a-second-class"),
        pytest.param(TA, S2, True, id="ta-and-student"),
        pytest.param(TA, INSTR, True, id="ta-and-owner"),
        pytest.param(INSTR, OTHER_INSTR, True, id="owner-and-instructor-enrolled-as-ta"),
        pytest.param(ORPHAN, S2, True, id="enrollment-without-a-profile-row"),
        pytest.param(S2, S3, False, id="students-of-different-classes"),
        pytest.param(INSTR, S3, False, id="owner-and-student-of-another-class"),
        pytest.param(NOBODY, S1, False, id="unknown-user"),
        pytest.param(NOBODY, "nobody-2", False, id="both-unknown"),
    ],
)
def test_has_shared_class(db, a, b, shared):
    assert messages.has_shared_class(a, b) is shared
    assert db.executes <= 2, _trace(db)


def test_has_shared_class_reads_each_table_once_for_both_users(db):
    messages.has_shared_class(S1, S3)
    assert _trace(db) == ["class_enrollments:select", "classes:select"]


def test_rows_are_matched_back_to_users_the_way_postgres_compares_uuids():
    """Per-user ``.eq()`` reads let Postgres compare uuids (case, braces, hyphens).
    Rows read for both users with ``.in_()`` are matched back in Python on this key,
    so a non-canonical request id must still find its rows. The fake compares
    strings exactly, which is why this is pinned on the key itself."""
    canonical = "0f8c1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b"
    assert messages._id_key(canonical) == canonical
    assert messages._id_key(canonical.upper()) == canonical
    assert messages._id_key("{" + canonical + "}") == canonical
    assert messages._id_key(canonical.replace("-", "")) == canonical
    assert messages._id_key(S1) == S1  # not a uuid: compared as a plain string


# ----------------------------------------------------------------- can_message


def test_can_message_student_and_instructor(db):
    assert messages.can_message(S1, INSTR) is True
    assert db.executes <= 3, _trace(db)  # roles, then owned classes + enrollments


def test_can_message_without_a_shared_class(db):
    assert messages.can_message(S2, S3) is False
    assert db.executes <= 3, _trace(db)


def test_can_message_instructor_pair_stops_after_the_role_read(db):
    assert messages.can_message(INSTR, OTHER_INSTR) is False  # they do share C1
    assert _trace(db) == ["profiles:select"]
