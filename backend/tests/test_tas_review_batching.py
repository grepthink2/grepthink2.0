"""Round-trip budgets for the TA / final-review module after batching.

Behaviour is covered by test_ta_review_model.py, test_final_reviews.py and
test_final_review_scoring.py. This file pins the shape of the work: the project
row carries its class (no separate classes / review-window reads), the detail
view fans its reads out, notes are one upsert, and the instructor's reviewer
override is one upsert while a TA's self-appointment stays a plain insert so a
lost race surfaces as 409 instead of silently replacing the winner.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

import app.tas.controller as tas
from tests.fake_supabase import FakeSupabase

INSTR = "instructor-1"
TA1 = "ta-1"  # Home (assigned) TA of P1
TA2 = "ta-2"  # additional reviewer of P1
TA3 = "ta-3"  # class TA with no role on P1
S1, S2 = "student-1", "student-2"
CLASS = "class-1"
P1, P2 = "proj-1", "proj-2"
OLD_CLAIM = "2026-07-20T00:00:00+00:00"


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _ops(db) -> list[str]:
    return [q["op"] for q in db.queries]


@pytest.fixture
def db(monkeypatch):
    names = {INSTR: "Ina", TA1: "Tara", TA2: "Tess", TA3: "Tom", S1: "Sam", S2: "Sara"}
    fake = FakeSupabase(
        profiles=[
            {
                "id": u,
                "email": f"{u}@ucsc.edu",
                "first_name": n,
                "last_name": "X",
                "image_url": None,
            }
            for u, n in names.items()
        ],
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "review_period_open": True,
                "review_zoom_url": "https://zoom.example/room",
            }
        ],
        class_enrollments=[
            {
                "id": f"enr-{u}",
                "class_id": CLASS,
                "user_id": u,
                "enrollment_role": "ta" if u in (TA1, TA2, TA3) else "student",
            }
            for u in (TA1, TA2, TA3, S1, S2)
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "assigned_ta_id": TA1,
                "final_review_at": None,
            },
            {
                "id": P2,
                "class_id": CLASS,
                "name": "Beta",
                "assigned_ta_id": None,
                "final_review_at": None,
            },
        ],
        project_members=[
            {"project_id": P1, "user_id": S1, "role": "member"},
            {"project_id": P1, "user_id": S2, "role": "owner"},
        ],
        project_review_tas=[
            {
                "id": "prt-1",
                "class_id": CLASS,
                "project_id": P1,
                "user_id": TA2,
                "assigned_by": INSTR,
                "claimed_at": OLD_CLAIM,
            }
        ],
        final_review_scores=[],
        final_review_notes=[],
        assignments=[
            {
                "id": "a1",
                "class_id": CLASS,
                "Title": "TSR 1",
                "assignment_type": "tsr",
                "open_date": "2026-07-01",
                "close_date": "2026-07-08",
                "status": "publish",
            }
        ],
        relations={("projects", "classes"): ("class_id", "id", False)},
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


# ---------------------------------------------------------- detail + notes


def test_final_review_detail_is_bounded(db):
    out = tas.get_final_review_detail(TA3, P1)
    assert out["viewer_role"] == "ta"
    assert out["home_ta"]["user_id"] == TA1 and out["review_ta"]["user_id"] == TA2
    assert {m["user_id"] for m in out["members"]} == {S1, S2}
    assert out["review_zoom_url"] == "https://zoom.example/room"
    assert out["review_period_open"] is True
    assert db.executes <= 7, _trace(db)

    db.reset_counter()
    assert tas.get_final_review_detail(INSTR, P1)["viewer_role"] == "instructor"
    assert db.executes <= 6, _trace(db)  # the instructor needs no enrollment lookup


def test_final_review_detail_still_denies_students_and_404s(db):
    with pytest.raises(HTTPException) as student:
        tas.get_final_review_detail(S1, P1)
    assert student.value.status_code == 403
    with pytest.raises(HTTPException) as missing:
        tas.get_final_review_detail(INSTR, "no-such-project")
    assert missing.value.status_code == 404


def test_save_notes_is_one_upsert_on_the_project_key(db):
    out = tas.save_final_review_notes(TA2, P1, {"project_scope": "v1"}, 1)
    assert out["message"] == "Notes saved" and out["project_id"] == P1
    assert out["notes"]["content"] == {"project_scope": "v1"}
    assert set(out["notes"]) == {"content", "template_version", "updated_by", "updated_at"}
    assert _ops(db).count("upsert") == 1
    assert not any(q["table"] == "final_review_notes" and q["op"] == "select" for q in db.queries)
    assert db.executes <= 4, _trace(db)

    tas.save_final_review_notes(INSTR, P1, {"project_scope": "v2"}, 2)
    rows = db.rows("final_review_notes")
    assert len(rows) == 1
    assert rows[0]["content"] == {"project_scope": "v2"} and rows[0]["template_version"] == 2
    assert (rows[0]["class_id"], rows[0]["project_id"], rows[0]["updated_by"]) == (CLASS, P1, INSTR)


# ------------------------------------------------------- additional reviewer


def test_self_appointment_is_an_insert_and_a_lost_race_is_409(db, monkeypatch):
    out = tas.set_review_ta(TA3, P2)
    assert out == {"message": "Additional reviewer assigned", "project_id": P2, "user_id": TA3}
    assert [r["user_id"] for r in db.rows("project_review_tas") if r["project_id"] == P2] == [TA3]
    assert "insert" in _ops(db) and "upsert" not in _ops(db)
    assert db.executes <= 4, _trace(db)

    # Another TA claims P2 between our existence check and our insert.
    db.rows("project_review_tas")[:] = [
        r for r in db.rows("project_review_tas") if r["project_id"] != P2
    ]

    class _LosingInsert:
        def execute(self):
            raise APIError(
                {
                    "code": "23505",
                    "message": 'duplicate key value violates unique constraint "project_review_tas_project_unique"',
                    "details": None,
                    "hint": None,
                }
            )

    real_table = db.table

    def racing_table(name):
        q = real_table(name)
        if name == "project_review_tas":

            def lose_the_race(*_a, **_k):
                return _LosingInsert()

            q.insert = lose_the_race
        return q

    monkeypatch.setattr(db, "table", racing_table)
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA3, P2)
    assert exc.value.status_code == 409


def test_instructor_override_replaces_the_reviewer_with_one_upsert(db):
    out = tas.set_review_ta(INSTR, P1, TA3)
    assert out == {"message": "Additional reviewer assigned", "project_id": P1, "user_id": TA3}
    rows = [r for r in db.rows("project_review_tas") if r["project_id"] == P1]
    assert len(rows) == 1
    assert (rows[0]["user_id"], rows[0]["assigned_by"]) == (TA3, INSTR)
    assert rows[0]["claimed_at"] != OLD_CLAIM  # a new claim, like the old delete+insert
    ops = _ops(db)
    assert ops.count("upsert") == 1 and "delete" not in ops
    assert db.executes <= 4, _trace(db)


def test_self_appointment_with_a_closed_window_costs_one_read(db):
    db.rows("classes")[0]["review_period_open"] = False
    with pytest.raises(HTTPException) as exc:
        tas.set_review_ta(TA3, P2)
    assert exc.value.status_code == 403
    assert db.executes == 1, _trace(db)


# ------------------------------------------------------------- small reads


def test_project_ta_lists_are_bounded(db):
    assert [t["user_id"] for t in tas.list_project_tas(S1, P1)] == [TA1]
    assert db.executes <= 3, _trace(db)

    db.reset_counter()
    out = tas.list_project_review_tas(S1, P1)
    assert [(r["user_id"], r["role"]) for r in out["reviewers"]] == [
        (TA1, "assigned"),
        (TA2, "additional"),
    ]
    assert out["review_period_open"] is True
    assert db.executes <= 4, _trace(db)


def test_release_and_review_time_are_two_round_trips(db):
    tas.release_review_ta(TA2, P1, TA2)
    assert not [r for r in db.rows("project_review_tas") if r["project_id"] == P1]
    assert db.executes <= 2, _trace(db)

    db.reset_counter()
    tas.set_final_review_time(INSTR, P1, None)
    assert db.executes <= 2, _trace(db)


def test_review_targets_budget(db):
    out = tas.get_ta_review_targets(TA1, CLASS)
    assert [p["id"] for p in out["projects"]] == [P1]
    assert [a["id"] for a in out["assignments"]] == ["a1"]
    assert db.executes <= 3, _trace(db)
