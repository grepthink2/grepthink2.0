"""Round-trip budgets + behaviour for app.messages after batching.

Before:

* ``has_shared_class`` read the classes each user owns and each user's
  enrollments one user at a time — four sequential round trips on every DM
  send (``can_message`` = one role read + those four).
* ``list_contacts`` made five sequential reads: the caller's owned classes, the
  caller's enrollments, every enrollment of those classes, their owners, and
  the profiles of everyone found.
* ``_require_participant`` (thread reads, mark-read, hide, channel sends) read
  the conversation, then its participants.

``FakeSupabase`` counts every ``.execute()``; each test pins the answer and an
upper bound on round trips. Reads fanned out with ``fan_out`` run on the query
pool, so traces are compared sorted.
"""

from __future__ import annotations

import threading

import pytest
from fastapi import HTTPException

from app.messages import controller as messages
from tests.fake_supabase import FakeSupabase

INSTR, OTHER_INSTR = "instr-1", "instr-2"
TA = "ta-1"
S1, S2, S3 = "stu-1", "stu-2", "stu-3"
ORPHAN = "stu-orphan"  # enrolled, but has no profiles row
NOBODY = "nobody"  # no rows anywhere
C1, C2, C3 = "class-1", "class-2", "class-3"

#: The foreign keys list_contacts embeds over (all in supabase/schema.sql).
CONTACT_RELATIONS = {
    ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
    ("classes", "class_enrollments!class_enrollments_class_id_fkey"): ("id", "class_id", True),
    ("class_enrollments", "classes!class_enrollments_class_id_fkey"): ("class_id", "id", False),
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
}


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


def _enroll(db, uid, class_id, role="student"):
    db.rows("class_enrollments").append(
        {"id": f"e-{class_id}-{uid}", "class_id": class_id, "user_id": uid, "enrollment_role": role}
    )


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
        relations=CONTACT_RELATIONS,
    )
    for uid, role in ((TA, "ta"), (OTHER_INSTR, "ta"), (S1, "student"), (S2, "student")):
        _enroll(fake, uid, C1, role)
    _enroll(fake, ORPHAN, C1)
    _enroll(fake, S1, C2)
    _enroll(fake, S3, C2)
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


# --------------------------------------------------------------- list_contacts


def test_list_contacts_shape_and_order_for_an_instructor(db):
    """INSTR owns C1 and C3. From C1: S2, S1 and TA. OTHER_INSTR is left out
    (instructor pair), ORPHAN has no profiles row, the caller is never listed.
    Sorted by name, else email, case-insensitively."""
    assert messages.list_contacts(caller_id=INSTR) == [
        {
            "id": S2,
            "name": None,
            "first_name": None,
            "last_name": None,
            "email": "bea@ucsc.edu",
            "image_url": f"https://img.example/{S2}.png",
            "role": "student",
        },
        {
            "id": S1,
            "name": "Sam Stone",
            "first_name": "Sam",
            "last_name": "Stone",
            "email": f"{S1}@ucsc.edu",
            "image_url": f"https://img.example/{S1}.png",
            "role": "student",
        },
        {
            "id": TA,
            "name": "Tara Tran",
            "first_name": "Tara",
            "last_name": "Tran",
            "email": f"{TA}@ucsc.edu",
            "image_url": f"https://img.example/{TA}.png",
            "role": "student",
        },
    ]
    assert db.executes <= 2, _trace(db)


def test_list_contacts_for_a_student_in_two_classes(db):
    """S1 is in C1 and C2: both owners and every classmate; OTHER_INSTR (owner of
    C2 and a TA in C1) is listed once."""
    contacts = messages.list_contacts(caller_id=S1)
    assert [c["id"] for c in contacts] == [S2, INSTR, OTHER_INSTR, TA, S3]
    assert next(c for c in contacts if c["id"] == INSTR)["role"] == "instructor"
    assert db.executes <= 2, _trace(db)


def test_list_contacts_for_an_instructor_who_is_a_ta_elsewhere(db):
    """OTHER_INSTR owns C2 and is a TA in C1: peers from both classes, never INSTR."""
    assert [c["id"] for c in messages.list_contacts(caller_id=OTHER_INSTR)] == [S2, S1, TA, S3]
    assert db.executes <= 2, _trace(db)


def test_list_contacts_for_a_caller_without_a_profile_row(db):
    """No caller role to compare, so no instructor filtering."""
    contacts = messages.list_contacts(caller_id=ORPHAN)
    assert [c["id"] for c in contacts] == [S2, INSTR, OTHER_INSTR, S1, TA]
    assert db.executes <= 2, _trace(db)


def test_list_contacts_breaks_name_ties_by_user_id(db):
    for uid in ("stu-b", "stu-a"):
        db.rows("profiles").append(_profile(uid, "Alex", "Kim"))
        _enroll(db, uid, C3)
    contacts = messages.list_contacts(caller_id=INSTR)
    assert [c["id"] for c in contacts] == ["stu-a", "stu-b", S2, S1, TA]


def test_list_contacts_query_matches_name_or_email(db):
    assert [c["id"] for c in messages.list_contacts(caller_id=S1, query="  ZHOU ")] == [S3]
    assert db.executes <= 2, _trace(db)
    db.reset_counter()
    assert [c["id"] for c in messages.list_contacts(caller_id=S1, query="bea@")] == [S2]
    assert db.executes <= 2, _trace(db)


def test_list_contacts_is_empty_without_classes_or_peers(db):
    assert messages.list_contacts(caller_id=NOBODY) == []
    assert db.executes <= 2, _trace(db)

    db.rows("profiles").append(_profile("instr-3", "Una", "Ueda", role="instructor"))
    db.rows("classes").append({"id": "class-4", "created_by": "instr-3"})
    db.reset_counter()
    assert messages.list_contacts(caller_id="instr-3") == []  # owns a class nobody joined
    assert db.executes <= 2, _trace(db)


def test_list_contacts_reads_owned_and_enrolled_classes_once_each(db):
    """Peers and their profiles are embedded: no separate enrollment, owner or profile reads."""
    messages.list_contacts(caller_id=S1)
    assert _trace(db) == ["class_enrollments:select", "classes:select"]


# -------------------------------------------------------- _require_participant

CONV_DM, CONV_TEAM = "conv-dm", "conv-team"


@pytest.fixture
def conv_db(monkeypatch):
    """A DM between S1 and S2; a TA channel for S1, S3 and TA holding five messages."""
    fake = FakeSupabase(
        conversations=[
            {"id": CONV_DM, "type": "dm", "user_a": S1, "user_b": S2, "project_id": None},
            {
                "id": CONV_TEAM,
                "type": "team_ta",
                "user_a": None,
                "user_b": None,
                "project_id": "proj-1",
            },
        ],
        conversation_participants=[
            {"conversation_id": CONV_DM, "user_id": S1, "role": "member"},
            {"conversation_id": CONV_DM, "user_id": S2, "role": "member"},
            {"conversation_id": CONV_TEAM, "user_id": S1, "role": "member"},
            {"conversation_id": CONV_TEAM, "user_id": S3, "role": "member"},
            {"conversation_id": CONV_TEAM, "user_id": TA, "role": "ta"},
        ],
        messages=[
            {
                "id": f"m{i}",
                "conversation_id": CONV_TEAM,
                "sender_id": S1,
                "body": f"body {i}",
                "created_at": f"2026-07-10T00:00:0{i}+00:00",
            }
            for i in range(5)
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _reads_wait_for_each_other(db, n: int = 2) -> None:
    """Let a read through only once ``n`` reads are in flight together.

    Reads issued one after another never get there: the first one times out
    with ``BrokenBarrierError``.
    """
    barrier = threading.Barrier(n, timeout=1)
    make_query = db.table

    def table(name):
        query = make_query(name)
        run = query.execute

        def execute():
            barrier.wait()
            return run()

        query.execute = execute
        return query

    db.table = table


def test_require_participant_returns_the_conversation(conv_db):
    assert messages._require_participant(CONV_TEAM, TA) == {
        "id": CONV_TEAM,
        "type": "team_ta",
        "user_a": None,
        "user_b": None,
        "project_id": "proj-1",
    }
    assert conv_db.executes <= 2, _trace(conv_db)


def test_require_participant_reads_the_conversation_and_participants_in_one_wave(conv_db):
    """Both reads are in flight together; they used to run one after the other."""
    _reads_wait_for_each_other(conv_db)
    assert messages._require_participant(CONV_DM, S2)["type"] == "dm"


@pytest.mark.parametrize(
    ("conversation_id", "caller", "status", "detail"),
    [
        pytest.param("conv-missing", S1, 404, "Conversation not found", id="missing"),
        pytest.param(CONV_DM, S3, 403, "Not a participant", id="not-a-participant"),
        pytest.param(CONV_TEAM, NOBODY, 403, "Not a participant", id="unknown-user"),
    ],
)
def test_require_participant_denials(conv_db, conversation_id, caller, status, detail):
    with pytest.raises(HTTPException) as exc:
        messages._require_participant(conversation_id, caller)
    assert (exc.value.status_code, exc.value.detail) == (status, detail)
    assert conv_db.executes <= 2, _trace(conv_db)


def test_list_messages_pages_newest_first_with_the_keyset_cursor(conv_db):
    first = messages.list_messages(conversation_id=CONV_TEAM, caller_id=S3, limit=2)
    assert first == {
        "messages": [
            {
                "id": "m4",
                "sender_id": S1,
                "body": "body 4",
                "created_at": "2026-07-10T00:00:04+00:00",
            },
            {
                "id": "m3",
                "sender_id": S1,
                "body": "body 3",
                "created_at": "2026-07-10T00:00:03+00:00",
            },
        ],
        "next_cursor": "2026-07-10T00:00:03+00:00|m3",
    }
    assert conv_db.executes <= 3, _trace(conv_db)  # conversation + participants, then the page

    conv_db.reset_counter()
    rest = messages.list_messages(
        conversation_id=CONV_TEAM, caller_id=S3, limit=2, before=first["next_cursor"]
    )
    assert [m["id"] for m in rest["messages"]] == ["m2", "m1"]
    assert rest["next_cursor"] == "2026-07-10T00:00:01+00:00|m1"
    assert conv_db.executes <= 3, _trace(conv_db)
