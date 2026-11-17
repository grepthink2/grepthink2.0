"""A burnup snapshot also records which stories the sprint held that day and which of them were
completed (``sprint_burnup_days.story_ids``, ``done_story_ids``), from the rows it already reads for its
totals: a sprint report reads the sprint as it ended from them. A completed story has a task and every
task done. On a database without the two columns (2026-11-17_project_documents.sql not applied yet) the
snapshot is written without them, and the board write that took it still succeeds."""

from __future__ import annotations

from datetime import date

import pytest
from postgrest.exceptions import APIError

from app.scrum import controller
from tests import fake_supabase
from tests.scrum_support import PID, UID, pin_today, scrum_db

TODAY = date(2026, 9, 10)
SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-09-07",
    "ends_at": "2026-09-20",
}


def _story(sid: str, key: str, sprint: str | None, **extra) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "key": key,
        "title": key,
        "sprint_id": sprint,
        "reporter_id": UID,
        "archived_at": None,
        "created_at": "2026-09-01T00:00:00+00:00",
        **extra,
    }


def _task(tid: str, story_id: str, status: str, hours: int | None = None) -> dict:
    return {
        "id": tid,
        "story_id": story_id,
        "project_id": PID,
        "key": f"GT-{tid}",
        "title": tid,
        "status": status,
        "points": None,
        "estimate_hours": hours,
        "reporter_id": UID,
        "created_at": "2026-09-01T00:00:00+00:00",
    }


@pytest.fixture
def db(monkeypatch):
    """Sprint 1 holds st1 (one task left), st2 (done), st3 (no task yet) and, archived, st4, which the
    board lists in the backlog; st5 is in the backlog."""
    pin_today(monkeypatch, TODAY)
    return scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("st1", "US-1", "sp1"),
            _story("st2", "US-2", "sp1"),
            _story("st3", "US-3", "sp1"),
            _story("st4", "US-4", "sp1", archived_at="2026-09-01T00:00:00+00:00"),
            _story("st5", "US-5", None),
        ],
        tasks=[
            _task("t1", "st1", "done", hours=2),
            _task("t2", "st1", "todo", hours=3),
            _task("t3", "st2", "done", hours=1),
            _task("t4", "st4", "done"),
        ],
        sprint_burnup_days=[],
        task_moves=[],
        task_dependencies=[],
        scrum_comments=[],
    )


def test_a_board_write_records_the_sprints_stories_and_the_completed_ones(db):
    controller.move_task(task_id="t2", user_id=UID, to_status="done")  # st1's last task

    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["day"]) == ("sp1", TODAY.isoformat())
    assert sorted(snap["story_ids"]) == ["st1", "st2", "st3"]  # live stories only
    assert sorted(snap["done_story_ids"]) == ["st1", "st2"]  # st3 has no task yet
    assert (snap["scope_hours"], snap["completed_hours"]) == (6, 6)


def test_the_boards_own_snapshot_records_them_from_the_rows_it_loaded(db):
    controller.get_board(project_id=PID, user_id=UID, sprint_id=None)

    [snap] = db.rows("sprint_burnup_days")
    assert sorted(snap["story_ids"]) == ["st1", "st2", "st3"]
    assert snap["done_story_ids"] == ["st2"]


def test_without_the_two_columns_the_snapshot_keeps_its_totals(db, monkeypatch):
    """PostgREST refuses a column the table doesn't have (PGRST204): the snapshot is written again
    without the story arrays, one more round trip, and the move stands."""
    real = fake_supabase._Query.execute
    refused = []

    def execute(query):
        if (
            query._table == "sprint_burnup_days"
            and query._op == "upsert"
            and "story_ids" in query._payload
        ):
            refused.append(query._payload)
            raise APIError(
                {
                    "code": "PGRST204",
                    "message": "Could not find the 'done_story_ids' column",
                    "details": None,
                    "hint": None,
                }
            )
        return real(query)

    monkeypatch.setattr(fake_supabase._Query, "execute", execute)

    out = controller.move_task(task_id="t2", user_id=UID, to_status="done")

    assert out["task"]["status"] == "done"
    assert len(refused) == 1
    [snap] = db.rows("sprint_burnup_days")
    assert "story_ids" not in snap and "done_story_ids" not in snap
    assert (snap["scope_hours"], snap["completed_hours"]) == (6, 6)
