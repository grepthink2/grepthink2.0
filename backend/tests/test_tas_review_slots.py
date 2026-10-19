"""Final-review slots: the instructor posts them, a team's Product Owner books one, and a TA signs
up to review a team only once it has one.

The controllers run against FakeSupabase with Python twins of the two booking functions
(tests/review_slot_support.py), and each test pins its call's round-trip budget. Most refusals
are in test_authz_status_policy.py; the ones here involve the booking functions (one proves the
function is never reached) or set a refused caller next to an allowed one.
"""

from __future__ import annotations

import inspect
from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.assignments import deadlines
from app.tas import controller as tas
from app.tas import review_slots
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase
from tests.review_slot_support import book_function, release_function

INSTR = "10000000-0000-4000-8000-000000000001"
OTHER_INSTR = "10000000-0000-4000-8000-000000000002"  # created OTHER_CLASS
TA1 = "20000000-0000-4000-8000-000000000001"  # P1's Home TA (assigned_ta_id)
TA2 = "20000000-0000-4000-8000-000000000002"  # a class TA with no team of their own
PO1 = "30000000-0000-4000-8000-000000000001"  # P1's Product Owner
PO2 = "30000000-0000-4000-8000-000000000002"  # P2's Product Owner
M2 = "30000000-0000-4000-8000-000000000003"  # on P2 with no role (NULL)
M3 = "30000000-0000-4000-8000-000000000004"  # on P3, a plain member
CLASS = "c0000000-0000-4000-8000-000000000001"
OTHER_CLASS = "c0000000-0000-4000-8000-000000000002"
P1 = "d0000000-0000-4000-8000-000000000001"
P2 = "d0000000-0000-4000-8000-000000000002"
P3 = "d0000000-0000-4000-8000-000000000003"
SLOT_A = "e0000000-0000-4000-8000-00000000000a"
SLOT_B = "e0000000-0000-4000-8000-00000000000b"
SLOT_ELSEWHERE = "e0000000-0000-4000-8000-0000000000c2"  # in OTHER_CLASS

ZOOM = "https://ucsc.zoom.us/j/555"
SLOT_A_AT = datetime(2026, 12, 7, 17, 0, tzinfo=UTC)
SLOT_B_AT = SLOT_A_AT + timedelta(hours=1)
# Stored the way the controller writes them: UTC ISO strings.
SLOT_A_START = SLOT_A_AT.isoformat()
SLOT_B_START = SLOT_B_AT.isoformat()
PACIFIC = timezone(timedelta(hours=-8))
#: The clock until a test moves it: the week before the reviews, when no slot has started.
BEFORE_THE_REVIEWS = datetime(2026, 12, 1, 12, 0, tzinfo=UTC)

SLOT_TAKEN = "That slot was just taken."
SLOT_NOT_FOUND = "Slot not found"
RELEASE_FIRST = "Release the team before deleting its slot."
TIME_PASSED = "Your team's review time has passed."
SLOT_STARTED = "That slot has already started."


def _profile(uid: str, first: str) -> dict:
    return {
        "id": uid,
        "email": f"{first.lower()}@ucsc.edu",
        "first_name": first,
        "last_name": "X",
        "image_url": None,
    }


def _slot(slot_id: str, class_id: str, starts_at: str) -> dict:
    return {
        "id": slot_id,
        "class_id": class_id,
        "starts_at": starts_at,
        "duration_minutes": 60,
        "project_id": None,
        "booked_by": None,
        "booked_at": None,
        "created_by": INSTR,
    }


@pytest.fixture
def db(monkeypatch):
    """CLASS (INSTR's, sign-ups open, a shared Zoom room) has teams P1 (Product Owner PO1, Home
    TA TA1) and P2 (Product Owner PO2 and M2, whose role is NULL), class TAs TA1 and TA2, and free
    slots SLOT_A and SLOT_B. SLOT_ELSEWHERE is a free slot in OTHER_CLASS. The clock reads
    BEFORE_THE_REVIEWS."""
    monkeypatch.setattr(deadlines, "now_utc", lambda: BEFORE_THE_REVIEWS)
    fake = FakeSupabase(
        relations={
            ("projects", "classes"): ("class_id", "id", False),
            ("projects", "project_members"): ("id", "project_id", True),
            ("final_review_slots", "classes"): ("class_id", "id", False),
        },
        profiles=[
            _profile(INSTR, "Ina"),
            _profile(TA1, "Tara"),
            _profile(TA2, "Tess"),
            _profile(PO1, "Pat"),
            _profile(PO2, "Poe"),
            _profile(M2, "Max"),
        ],
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "status": "active",
                "review_period_open": True,
                "review_zoom_url": ZOOM,
            },
            {
                "id": OTHER_CLASS,
                "created_by": OTHER_INSTR,
                "status": "active",
                "review_period_open": True,
                "review_zoom_url": None,
            },
        ],
        class_enrollments=[
            {"id": f"enr-{uid}", "class_id": CLASS, "user_id": uid, "enrollment_role": role}
            for uid, role in (
                (TA1, "ta"),
                (TA2, "ta"),
                (PO1, "student"),
                (PO2, "student"),
                (M2, "student"),
            )
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Team 1",
                "assigned_ta_id": TA1,
                "final_review_at": None,
            },
            {
                "id": P2,
                "class_id": CLASS,
                "name": "Team 2",
                "assigned_ta_id": None,
                "final_review_at": None,
            },
        ],
        project_members=[
            {"project_id": P1, "user_id": PO1, "role": "product owner"},
            {"project_id": P2, "user_id": PO2, "role": "product owner"},
            {"project_id": P2, "user_id": M2, "role": None},
        ],
        project_review_tas=[],
        final_review_slots=[
            _slot(SLOT_A, CLASS, SLOT_A_START),
            _slot(SLOT_B, CLASS, SLOT_B_START),
            _slot(SLOT_ELSEWHERE, OTHER_CLASS, SLOT_A_START),
        ],
    )
    fake.rpcs["book_final_review_slot"] = book_function(fake)
    fake.rpcs["release_final_review_slot"] = release_function(fake)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


@pytest.fixture
def clock(monkeypatch):
    """Move the clock the slot rules read (``deadlines.now_utc``)."""

    def set_now(value: datetime) -> None:
        monkeypatch.setattr(deadlines, "now_utc", lambda: value)

    return set_now


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _rpc_params(db) -> dict:
    """The params of the last call, which must be the booking function's."""
    assert db.queries[-1]["op"] == "rpc", _trace(db)
    [params] = db.queries[-1]["filters"]
    return params


def _project(db, project_id: str) -> dict:
    return next(p for p in db.rows("projects") if p["id"] == project_id)


def _held(db) -> dict[str, str | None]:
    """slot id → the team holding it (None when free)."""
    return {s["id"]: s["project_id"] for s in db.rows("final_review_slots")}


def _review_tas(db) -> list[tuple[str, str]]:
    return [(r["project_id"], r["user_id"]) for r in db.rows("project_review_tas")]


# ---------------------------------------------------------------- booking


def test_a_product_owner_books_a_free_slot_while_signups_are_open(db):
    out = review_slots.book_review_slot(PO1, UUID(SLOT_A), UUID(P1))

    assert out == {"status": "booked", "slot_id": SLOT_A, "starts_at": SLOT_A_START}
    assert db.rows("projects")[0]["final_review_at"] == SLOT_A_START
    assert db.queries[-1]["table"] == "rpc:book_final_review_slot"
    # The ids reach PostgREST as plain strings: supabase-py cannot serialise a UUID.
    params = _rpc_params(db)
    assert params == {"p_slot": SLOT_A, "p_project": P1, "p_actor": PO1}
    assert {type(value) for value in params.values()} == {str}
    assert db.executes <= 4, _trace(db)


def test_moving_frees_the_old_slot_and_drops_the_review_ta(db):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.rows("project_review_tas").append({"project_id": P1, "user_id": TA2, "class_id": CLASS})
    db.reset_counter()

    out = review_slots.book_review_slot(PO1, UUID(SLOT_B), UUID(P1))

    assert out == {"status": "moved", "slot_id": SLOT_B, "starts_at": SLOT_B_START}
    held = _held(db)
    assert held[SLOT_A] is None and held[SLOT_B] == P1 and db.rows("project_review_tas") == []
    assert _project(db, P1)["final_review_at"] == SLOT_B_START
    assert db.executes <= 4, _trace(db)


@pytest.mark.parametrize(
    "old_time", [None, "2026-12-04T20:00:00+00:00"], ids=["no-time", "time-without-a-slot"]
)
def test_a_first_booking_keeps_the_review_ta(db, old_time):
    # No slot row yet, so a first booking either way: a time set before slots existed is not one.
    # That time is still ahead; once it has passed, see the past-times tests below.
    _project(db, P1)["final_review_at"] = old_time
    db.rows("project_review_tas").append({"project_id": P1, "user_id": TA2, "class_id": CLASS})

    out = review_slots.book_review_slot(PO1, SLOT_A, P1)

    assert out["status"] == "booked"
    assert _review_tas(db) == [(P1, TA2)]
    assert _project(db, P1)["final_review_at"] == SLOT_A_START
    assert db.executes <= 4, _trace(db)


def test_a_taken_slot_is_409(db):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.reset_counter()

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO2, SLOT_A, P2)

    assert (exc.value.status_code, exc.value.detail) == (409, SLOT_TAKEN)
    assert _held(db)[SLOT_A] == P1 and _project(db, P2)["final_review_at"] is None
    assert db.executes <= 4, _trace(db)


def test_one_team_booking_two_slots_at_once_is_409(db):
    # The second of two concurrent bookings by one team trips final_review_slots_project_uniq.
    def unique_violation(_params):
        raise APIError(
            {
                "code": "23505",
                "message": 'duplicate key value violates unique constraint "final_review_slots_project_uniq"',
                "details": None,
                "hint": None,
            }
        )

    db.rpcs["book_final_review_slot"] = unique_violation

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO1, SLOT_A, P1)

    assert (exc.value.status_code, exc.value.detail) == (409, SLOT_TAKEN)
    assert db.executes <= 4, _trace(db)


def test_a_slot_from_another_class_is_404(db):
    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO1, SLOT_ELSEWHERE, P1)

    assert (exc.value.status_code, exc.value.detail) == (404, SLOT_NOT_FOUND)
    # Refused before the booking function: nothing is written, through it or otherwise.
    assert {q["op"] for q in db.queries} == {"select"}, _trace(db)
    assert _held(db)[SLOT_ELSEWHERE] is None and _project(db, P1)["final_review_at"] is None
    assert db.executes <= 4, _trace(db)


def test_a_slot_deleted_just_before_the_booking_is_404(db):
    book = db.rpcs["book_final_review_slot"]

    def deleted_first(params):
        db.rows("final_review_slots")[:] = [
            s for s in db.rows("final_review_slots") if s["id"] != SLOT_A
        ]
        return book(params)

    db.rpcs["book_final_review_slot"] = deleted_first

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO1, SLOT_A, P1)

    assert (exc.value.status_code, exc.value.detail) == (404, SLOT_NOT_FOUND)
    assert _project(db, P1)["final_review_at"] is None
    assert db.executes <= 4, _trace(db)


def test_closed_signups_stop_the_product_owner_not_the_instructor(db):
    db.rows("classes")[0]["review_period_open"] = False

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO1, SLOT_A, P1)
    assert (exc.value.status_code, exc.value.detail) == (403, "Sign-ups aren't open.")
    assert "rpc" not in {q["op"] for q in db.queries}, _trace(db)

    # The instructor places any team, any time, naming it in the request.
    db.reset_counter()
    out = review_slots.book_review_slot(INSTR, UUID(SLOT_A), UUID(P2))

    assert out == {"status": "booked", "slot_id": SLOT_A, "starts_at": SLOT_A_START}
    assert _rpc_params(db) == {"p_slot": SLOT_A, "p_project": P2, "p_actor": INSTR}
    assert _held(db)[SLOT_A] == P2 and _project(db, P2)["final_review_at"] == SLOT_A_START
    assert db.executes <= 4, _trace(db)


# --------------------------------------------------------------- releasing


def test_a_product_owner_releases_the_team_slot_while_signups_are_open(db):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.rows("project_review_tas").append({"project_id": P1, "user_id": TA2, "class_id": CLASS})
    db.reset_counter()

    out = review_slots.release_review_slot(PO1, UUID(P1))

    assert out == {"released": True}
    assert _held(db)[SLOT_A] is None and _project(db, P1)["final_review_at"] is None
    assert db.rows("project_review_tas") == []
    params = _rpc_params(db)
    assert params == {"p_project": P1} and type(params["p_project"]) is str
    assert db.executes <= 3, _trace(db)


def test_the_instructor_releases_a_team_while_signups_are_closed(db):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.rows("classes")[0]["review_period_open"] = False
    db.reset_counter()

    out = review_slots.release_review_slot(INSTR, P1)

    assert out == {"released": True}
    assert _held(db)[SLOT_A] is None and _project(db, P1)["final_review_at"] is None
    assert db.executes <= 3, _trace(db)


def test_releasing_a_team_that_holds_no_slot_releases_nothing(db):
    out = review_slots.release_review_slot(PO2, P2)

    # The function answers a bare false, which must not become a truthy or empty value.
    assert out == {"released": False}
    assert db.queries[-1]["table"] == "rpc:release_final_review_slot"
    assert db.executes <= 3, _trace(db)


# -------------------------------------------------------------- past times


@pytest.mark.parametrize(
    "now", [SLOT_A_AT, SLOT_A_AT + timedelta(minutes=30)], ids=["at-the-time", "after-it"]
)
@pytest.mark.parametrize(
    "change",
    [
        pytest.param(lambda: review_slots.book_review_slot(PO1, SLOT_B, P1), id="move"),
        pytest.param(lambda: review_slots.release_review_slot(PO1, P1), id="release"),
    ],
)
def test_a_product_owner_cannot_move_or_release_once_the_team_time_has_passed(
    db, clock, change, now
):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.rows("project_review_tas").append({"project_id": P1, "user_id": TA2, "class_id": CLASS})
    clock(now)  # SLOT_B hasn't started: only the team's own time is in the way
    db.reset_counter()

    with pytest.raises(HTTPException) as exc:
        change()

    assert (exc.value.status_code, exc.value.detail) == (403, TIME_PASSED)
    # Refused before the booking functions: the team keeps its slot, its time and its Review TA.
    assert {q["op"] for q in db.queries} == {"select"}, _trace(db)
    assert _held(db) == {SLOT_A: P1, SLOT_B: None, SLOT_ELSEWHERE: None}
    assert _project(db, P1)["final_review_at"] == SLOT_A_START
    assert _review_tas(db) == [(P1, TA2)]


@pytest.mark.parametrize(
    "now", [SLOT_A_AT, SLOT_A_AT + timedelta(minutes=30)], ids=["at-its-start", "after-it"]
)
def test_a_product_owner_cannot_book_a_slot_that_has_started(db, clock, now):
    clock(now)

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO2, SLOT_A, P2)

    assert (exc.value.status_code, exc.value.detail) == (409, SLOT_STARTED)
    assert {q["op"] for q in db.queries} == {"select"}, _trace(db)
    assert _held(db)[SLOT_A] is None and _project(db, P2)["final_review_at"] is None
    # A slot that hasn't started is still theirs to book.
    assert review_slots.book_review_slot(PO2, SLOT_B, P2)["status"] == "booked"


def test_a_time_set_before_slots_existed_also_counts_once_it_has_passed(db):
    # P1 has a time but no slot (C-R4); that time is behind the clock, so its review was held.
    _project(db, P1)["final_review_at"] = "2026-07-22T20:00:00+00:00"

    with pytest.raises(HTTPException) as exc:
        review_slots.book_review_slot(PO1, SLOT_A, P1)

    assert (exc.value.status_code, exc.value.detail) == (403, TIME_PASSED)
    assert {q["op"] for q in db.queries} == {"select"}, _trace(db)
    assert _project(db, P1)["final_review_at"] == "2026-07-22T20:00:00+00:00"


def test_the_instructor_places_and_releases_teams_after_their_time(db, clock):
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    clock(SLOT_B_AT + timedelta(minutes=30))  # both slots have started: P1's review is over

    # Moving P1 and releasing it, then putting P2 on a slot that has started: that is how a
    # review already held gets recorded.
    assert review_slots.book_review_slot(INSTR, SLOT_B, P1)["status"] == "moved"
    assert review_slots.release_review_slot(INSTR, P1) == {"released": True}
    assert review_slots.book_review_slot(INSTR, SLOT_A, P2)["status"] == "booked"
    assert _held(db) == {SLOT_A: P2, SLOT_B: None, SLOT_ELSEWHERE: None}
    assert _project(db, P1)["final_review_at"] is None
    assert _project(db, P2)["final_review_at"] == SLOT_A_START


# ------------------------------------------------------ creating, deleting


def test_creating_slots_skips_times_that_already_exist(db):
    same_as_slot_a = datetime(2026, 12, 7, 9, 0, tzinfo=PACIFIC)  # 17:00 UTC
    morning = datetime(2026, 12, 8, 9, 0, tzinfo=PACIFIC)  # 17:00 UTC the next day
    evening = datetime(2026, 12, 8, 18, 0, tzinfo=UTC)

    out = review_slots.create_review_slots(INSTR, UUID(CLASS), [same_as_slot_a, morning, evening])

    assert out == {"created": 2}
    # Sent as UTC ISO strings, so an existing time matches the class's unique key however the
    # request spelled its zone.
    new = [
        (s["class_id"], s["starts_at"], s["created_by"])
        for s in db.rows("final_review_slots")
        if s["id"] not in (SLOT_A, SLOT_B, SLOT_ELSEWHERE)
    ]
    assert new == [
        (CLASS, "2026-12-08T17:00:00+00:00", INSTR),
        (CLASS, "2026-12-08T18:00:00+00:00", INSTR),
    ]
    assert [q["op"] for q in db.queries].count("upsert") == 1
    assert db.executes <= 2, _trace(db)


def test_a_booked_slot_cannot_be_deleted(db):
    review_slots.book_review_slot(PO1, SLOT_A, P1)

    with pytest.raises(HTTPException) as exc:
        review_slots.delete_review_slot(INSTR, UUID(SLOT_A))
    assert (exc.value.status_code, exc.value.detail) == (409, RELEASE_FIRST)
    assert _held(db)[SLOT_A] == P1

    db.reset_counter()
    assert review_slots.delete_review_slot(INSTR, UUID(SLOT_B)) is None
    assert SLOT_B not in _held(db)
    assert db.executes <= 2, _trace(db)


def test_a_slot_booked_while_it_is_being_deleted_is_kept(db, monkeypatch):
    # The slot is free when the instructor's request reads it; P2 books it before the delete runs.
    real_table = db.table

    def booking_first(name):
        query = real_table(name)
        if name == "final_review_slots":
            real_delete = query.delete

            def delete():
                db.rpcs["book_final_review_slot"](
                    {"p_slot": SLOT_B, "p_project": P2, "p_actor": PO2}
                )
                return real_delete()

            query.delete = delete
        return query

    monkeypatch.setattr(db, "table", booking_first)

    with pytest.raises(HTTPException) as exc:
        review_slots.delete_review_slot(INSTR, SLOT_B)

    assert (exc.value.status_code, exc.value.detail) == (409, RELEASE_FIRST)
    assert _held(db)[SLOT_B] == P2


# ----------------------------------------------------------------- reading


def test_students_see_every_slot_and_their_own_details_once_booked(db):
    before = review_slots.get_review_slots(PO1, UUID(CLASS))
    assert before["my_team"] == {
        "project_id": P1,
        "name": "Team 1",
        "is_product_owner": True,
        "slot_id": None,
        "starts_at": None,
        "zoom_url": None,
        "home_ta": None,
        "review_ta": None,
    }
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.rows("project_review_tas").append({"project_id": P1, "user_id": TA2, "class_id": CLASS})
    db.reset_counter()

    out = review_slots.get_review_slots(PO1, UUID(CLASS))

    assert out == {
        "class_id": CLASS,
        "signups_open": True,
        "slots": [
            {
                "id": SLOT_A,
                "starts_at": SLOT_A_START,
                "duration_minutes": 60,
                "team": {"project_id": P1, "name": "Team 1"},
            },
            {"id": SLOT_B, "starts_at": SLOT_B_START, "duration_minutes": 60, "team": None},
        ],
        "my_team": {
            "project_id": P1,
            "name": "Team 1",
            "is_product_owner": True,
            "slot_id": SLOT_A,
            "starts_at": SLOT_A_START,
            "zoom_url": ZOOM,
            "home_ta": {"user_id": TA1, "name": "Tara X"},
            "review_ta": {"user_id": TA2, "name": "Tess X"},
        },
        "unbooked_teams": [],
        "review_zoom_url": None,
    }
    assert db.executes <= 6, _trace(db)

    # A member who is not the Product Owner, on a team with no slot: no time, no room, no names.
    other = review_slots.get_review_slots(M2, CLASS)["my_team"]
    assert (other["project_id"], other["is_product_owner"], other["zoom_url"]) == (P2, False, None)


@pytest.mark.parametrize("viewer", [INSTR, TA2], ids=["instructor", "class-ta"])
def test_staff_see_unbooked_teams_with_their_product_owner(db, viewer):
    db.rows("projects").append(
        {
            "id": P3,
            "class_id": CLASS,
            "name": "Team 3",
            "assigned_ta_id": None,
            "final_review_at": None,
        }
    )
    db.rows("project_members").append({"project_id": P3, "user_id": M3, "role": "member"})
    review_slots.book_review_slot(PO1, SLOT_A, P1)
    db.reset_counter()

    out = review_slots.get_review_slots(viewer, CLASS)

    assert out["unbooked_teams"] == [
        {"project_id": P2, "name": "Team 2", "product_owner": {"user_id": PO2, "name": "Poe X"}},
        {"project_id": P3, "name": "Team 3", "product_owner": None},
    ]
    assert out["review_zoom_url"] == ZOOM
    assert out["my_team"] is None
    assert [s["team"] for s in out["slots"]] == [{"project_id": P1, "name": "Team 1"}, None]
    assert db.executes <= 6, _trace(db)


# ------------------------------------------------------------ Review TAs


def test_a_ta_cannot_sign_up_to_review_a_team_without_a_slot(db):
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA2, P2)

    assert (exc.value.status_code, exc.value.detail) == (
        403,
        "This team hasn't booked a review slot yet.",
    )
    assert db.rows("project_review_tas") == []
    # Decided from the project read the other checks already make: no extra round trip.
    assert db.executes <= 3, _trace(db)

    # Checked after the TA check: anyone else gets the answer they always got, and learns
    # nothing about whether the team has booked.
    with pytest.raises(HTTPException) as student:
        tas.set_review_ta(PO1, P2)
    assert (student.value.status_code, student.value.detail) == (
        400,
        "The reviewer must be a designated TA of this class",
    )

    review_slots.book_review_slot(PO2, SLOT_B, P2)
    tas.set_review_ta(TA2, P2)
    assert _review_tas(db) == [(P2, TA2)]


# ------------------------------------------------------------------ routes


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


@pytest.mark.parametrize(
    ("method", "path", "kwargs", "name", "returns", "status", "arguments"),
    [
        pytest.param(
            "get",
            f"/api/tas/classes/{CLASS}/review-slots",
            {},
            "get_review_slots",
            {"class_id": CLASS, "slots": []},
            200,
            {"user_id": PO1, "class_id": CLASS},
            id="list",
        ),
        pytest.param(
            "delete",
            f"/api/tas/review-slots/{SLOT_A}",
            {},
            "delete_review_slot",
            None,
            204,
            {"instructor_id": PO1, "slot_id": SLOT_A},
            id="delete",
        ),
        pytest.param(
            "post",
            f"/api/tas/review-slots/{SLOT_A}/book",
            {"json": {"project_id": P1}},
            "book_review_slot",
            {"status": "booked", "slot_id": SLOT_A, "starts_at": SLOT_A_START},
            200,
            {"user_id": PO1, "slot_id": SLOT_A, "project_id": P1},
            id="book",
        ),
        pytest.param(
            "post",
            f"/api/tas/projects/{P1}/review-slot/release",
            {},
            "release_review_slot",
            {"released": True},
            200,
            {"user_id": PO1, "project_id": P1},
            id="release",
        ),
    ],
)
def test_each_slot_route_passes_the_caller_and_its_ids_to_the_controller(
    client, monkeypatch, method, path, kwargs, name, returns, status, arguments
):
    real = getattr(review_slots, name)
    calls: list[inspect.BoundArguments] = []

    def controller(*call_args, **call_kwargs):
        calls.append(inspect.signature(real).bind(*call_args, **call_kwargs))
        return returns

    monkeypatch.setattr(review_slots, name, controller)
    res = getattr(client, method)(path, headers=_as(PO1), **kwargs)

    assert res.status_code == status, res.text
    if status == 204:
        assert res.content == b""
    else:
        assert res.json() == returns
    # By name: a view that swapped the slot and the team (or the caller and an id) fails here.
    [call] = calls
    assert {key: str(value) for key, value in call.arguments.items()} == arguments


def _times(count: int) -> list[str]:
    return [f"2026-12-{1 + i // 24:02d}T{i % 24:02d}:00:00Z" for i in range(count)]


@pytest.mark.parametrize(
    ("starts_at", "status"),
    [
        pytest.param([], 422, id="none"),
        pytest.param(["2026-12-07T17:00:00Z", "2026-12-07T09:00:00-08:00"], 422, id="repeat"),
        pytest.param(["2026-12-07T17:00:00"], 422, id="no-zone"),
        pytest.param(_times(201), 422, id="201-times"),
        pytest.param(_times(200), 200, id="200-times"),
    ],
)
def test_creating_slots_takes_1_to_200_distinct_times_with_a_zone(
    client, monkeypatch, starts_at, status
):
    calls = []
    monkeypatch.setattr(
        review_slots,
        "create_review_slots",
        lambda instructor_id, class_id, times: calls.append(times) or {"created": len(times)},
    )

    res = client.post(
        f"/api/tas/classes/{CLASS}/review-slots", json={"starts_at": starts_at}, headers=_as(INSTR)
    )

    assert res.status_code == status, res.text
    assert len(calls) == (1 if status == 200 else 0)


@pytest.mark.parametrize(
    "start",
    [
        pytest.param("0001-01-01T00:00:00+05:00", id="before-year-1-in-utc"),
        pytest.param("9999-12-31T23:30:00-05:00", id="after-year-9999-in-utc"),
        pytest.param("2026-12-07T17:00:00.123Z", id="milliseconds"),
        pytest.param("2026-12-07T17:00:30Z", id="seconds"),
    ],
)
def test_a_start_time_must_be_a_whole_minute_that_utc_can_hold(client, db, start):
    res = client.post(
        f"/api/tas/classes/{CLASS}/review-slots", json={"starts_at": [start]}, headers=_as(INSTR)
    )

    assert res.status_code == 422, res.text
    # Refused by the request model: the controller never runs, so nothing is read or written.
    assert db.queries == [], _trace(db)
    assert len(db.rows("final_review_slots")) == 3
