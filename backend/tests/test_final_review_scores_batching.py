"""Round-trip budget and atomicity guards for save_final_review_scores.

The behavioural contract (validation rules, clears, role gating) is covered
by test_final_review_scoring.py. This file pins the *shape of the work*:
one DELETE for clears, one UPSERT for the rest, and nothing written when any
entry is invalid.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

import app.tas.controller as tas
from tests.fake_supabase import FakeSupabase

INSTR = "instr"
TA1 = "ta-1"
CLASS = "class-1"
P1 = "proj-1"
STUDENTS = [f"s{i}" for i in range(1, 7)]  # a six-member team

WRITE_OPS = {"insert", "update", "upsert", "delete"}


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        relations={("projects", "classes"): ("class_id", "id", False)},
        classes=[
            {"id": CLASS, "created_by": INSTR, "review_period_open": True, "review_zoom_url": None}
        ],
        class_enrollments=[
            {"id": "e-ta", "class_id": CLASS, "user_id": TA1, "enrollment_role": "ta"},
            *[
                {"id": f"e-{s}", "class_id": CLASS, "user_id": s, "enrollment_role": "student"}
                for s in STUDENTS
            ],
        ],
        projects=[
            {
                "id": P1,
                "class_id": CLASS,
                "name": "Alpha",
                "assigned_ta_id": TA1,
                "final_review_at": None,
            }
        ],
        project_members=[{"project_id": P1, "user_id": s, "role": "member"} for s in STUDENTS],
        project_review_tas=[],
        final_review_scores=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _home(sid: str, v: float = 4.0) -> dict:
    return {"student_id": sid, "product": v, "team": v, "scrum": v}


def test_full_team_save_is_bounded_round_trips(db):
    out = tas.save_final_review_scores(TA1, P1, "home", [_home(s) for s in STUDENTS])
    assert out["saved"] == 6
    assert len(db.rows("final_review_scores")) == 6
    # context (project, class, enrollment, review TA) + members + ONE upsert.
    # Before batching this was 5 + 2 per student = 17 for a six-member team.
    assert db.executes <= 6, [q["table"] + ":" + q["op"] for q in db.queries]
    assert [q["op"] for q in db.queries].count("upsert") == 1


def test_mixed_clear_and_write_is_one_delete_plus_one_upsert(db):
    tas.save_final_review_scores(TA1, P1, "home", [_home("s1"), _home("s2")])
    db.reset_counter()

    out = tas.save_final_review_scores(
        TA1,
        P1,
        "home",
        [
            {"student_id": "s1", "product": None, "team": None, "scrum": None},  # clear
            _home("s2", 3.0),  # update
            _home("s3"),  # insert
        ],
    )
    assert out["saved"] == 3
    rows = {r["student_id"]: r for r in db.rows("final_review_scores")}
    assert "s1" not in rows
    assert rows["s2"]["product"] == 3.0
    assert rows["s3"]["product"] == 4.0
    ops = [q["op"] for q in db.queries]
    assert ops.count("delete") == 1
    assert ops.count("upsert") == 1
    assert db.executes <= 7


def test_invalid_entry_anywhere_writes_nothing(db):
    """The old per-row loop persisted entries 1..n-1 before failing on entry n."""
    with pytest.raises(HTTPException) as exc:
        tas.save_final_review_scores(TA1, P1, "home", [_home("s1"), _home("s2", 9.0)])
    assert exc.value.status_code == 400
    assert db.rows("final_review_scores") == []
    assert not any(q["op"] in WRITE_OPS for q in db.queries)


def test_non_member_anywhere_writes_nothing(db):
    with pytest.raises(HTTPException) as exc:
        tas.save_final_review_scores(TA1, P1, "home", [_home("s1"), _home("stranger")])
    assert exc.value.status_code == 400
    assert db.rows("final_review_scores") == []


def test_last_entry_for_a_student_wins(db):
    out = tas.save_final_review_scores(TA1, P1, "home", [_home("s1", 4.0), _home("s1", 2.0)])
    assert out["saved"] == 1
    rows = db.rows("final_review_scores")
    assert len(rows) == 1
    assert rows[0]["product"] == 2.0

    # clear after write within one payload → no row; write after clear → row
    tas.save_final_review_scores(
        TA1,
        P1,
        "home",
        [_home("s1", 3.0), {"student_id": "s1", "product": None, "team": None, "scrum": None}],
    )
    assert db.rows("final_review_scores") == []
    tas.save_final_review_scores(
        TA1,
        P1,
        "home",
        [{"student_id": "s1", "product": None, "team": None, "scrum": None}, _home("s1", 3.0)],
    )
    assert db.rows("final_review_scores")[0]["product"] == 3.0
