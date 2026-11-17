"""A burnup snapshot also records the stories the sprint held that day with their numbers
(``sprint_burnup_days.stories``): one ``{id, done, hours, points}`` per live story, in board order, from the
rows the snapshot already reads for its totals. ``done`` is a task and every task done, ``hours`` the sum
of its tasks' estimate hours (0 when none has one). A sprint report reads the sprint as it ended from it.
On a database without the column (2026-11-17_project_documents.sql not applied yet) the snapshot is written
without it, and the board write that took it still succeeds."""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import pytest
from postgrest.exceptions import APIError

from app.scrum import controller
from tests import fake_supabase
from tests.scrum_support import PID, UID, pin_today, scrum_db
from tests.test_mcp_controller import SPRINT_PLANNED, _db, _fill, _req

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
    """Sprint 1 holds, in board order, st2 (rank 1, done), st1 (rank 2, one task left, 5 points) and st3
    (unranked, no task yet, 2 points); st4 is a legacy archived row, which the board lists in the backlog;
    st5 is in the backlog."""
    pin_today(monkeypatch, TODAY)
    return scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("st1", "US-1", "sp1", rank=2, points=5),
            _story("st2", "US-2", "sp1", rank=1, points=None),
            _story("st3", "US-3", "sp1", rank=None, points=2),
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


def test_a_board_write_records_the_sprints_stories_with_their_numbers(db):
    controller.move_task(task_id="t2", user_id=UID, to_status="done")  # st1's last task

    [snap] = db.rows("sprint_burnup_days")
    assert (snap["sprint_id"], snap["day"]) == ("sp1", TODAY.isoformat())
    # Live stories only, in board order: by rank, then the unranked by key.
    assert snap["stories"] == [
        {"id": "st2", "done": True, "hours": 1, "points": None},
        {"id": "st1", "done": True, "hours": 5, "points": 5},
        {"id": "st3", "done": False, "hours": 0, "points": 2},  # no task yet: not completed
    ]
    assert (snap["scope_hours"], snap["completed_hours"]) == (6, 6)


def test_the_boards_own_snapshot_records_them_from_the_rows_it_loaded(db):
    controller.get_board(project_id=PID, user_id=UID, sprint_id=None)

    [snap] = db.rows("sprint_burnup_days")
    assert snap["stories"] == [
        {"id": "st2", "done": True, "hours": 1, "points": None},
        {"id": "st1", "done": False, "hours": 5, "points": 5},
        {"id": "st3", "done": False, "hours": 0, "points": 2},
    ]
    # The snapshot reads nothing of its own: the stories come with the board's reads.
    assert [q["table"] for q in db.queries].count("user_stories") == 1


def test_a_story_whose_tasks_have_no_hours_records_zero_hours():
    stories = [
        {"id": "a", "key": "US-1", "points": 3, "tasks": [{"status": "done"}]},
        {"id": "b", "key": "US-2", "points": None, "tasks": []},
    ]
    assert controller._story_record(stories) == [
        {"id": "a", "done": True, "hours": 0, "points": 3},
        {"id": "b", "done": False, "hours": 0, "points": None},
    ]


_WRITES: dict[str, Callable[[], object]] = {
    "a story created in the sprint": lambda: controller.create_story(
        project_id=PID, user_id=UID, fields={"title": "New", "sprint_id": "sp1"}
    ),
    "a story moved into the sprint": lambda: controller.update_story(
        story_id="st5", user_id=UID, fields={"sprint_id": "sp1"}
    ),
    "a task created": lambda: controller.create_task(
        story_id="st3", user_id=UID, fields={"title": "New", "estimate_hours": 4}
    ),
    "a task re-estimated": lambda: controller.update_task(
        task_id="t2", user_id=UID, fields={"estimate_hours": 5}
    ),
    "a task deleted": lambda: controller.delete_task(task_id="t2", user_id=UID),
    "a task moved": lambda: controller.move_task(task_id="t2", user_id=UID, to_status="done"),
    "the board viewed": lambda: controller.get_board(project_id=PID, user_id=UID, sprint_id=None),
}


@pytest.mark.parametrize("write", list(_WRITES), ids=list(_WRITES))
def test_every_snapshot_the_board_takes_records_the_stories(db, write):
    _WRITES[write]()

    [snap] = db.rows("sprint_burnup_days")
    record = snap["stories"]
    live = {s["id"] for s in db.rows("user_stories") if s["sprint_id"] == "sp1"} - {"st4"}
    assert {s["id"] for s in record} == live
    by_id = {s["id"]: s for s in record}
    hours = {
        sid: sum(t.get("estimate_hours") or 0 for t in db.rows("tasks") if t["story_id"] == sid)
        for sid in live
    }
    assert {sid: s["hours"] for sid, s in by_id.items()} == hours


def test_a_story_moved_between_sprints_leaves_one_record_and_joins_the_other(db):
    db.rows("sprints").append(dict(SPRINT, id="sp2", name="Sprint 2"))
    controller.update_story(story_id="st1", user_id=UID, fields={"sprint_id": "sp2"})

    records = {
        s["sprint_id"]: [r["id"] for r in s["stories"]] for s in db.rows("sprint_burnup_days")
    }
    assert records == {"sp1": ["st2", "st3"], "sp2": ["st1"]}


def test_the_connectors_fill_records_the_stories_of_a_sprint_it_does_not_rebuild(monkeypatch):
    """A fill that adds work to a sprint not started yet snapshots that sprint as a board write does."""
    planned = {
        "id": "planned-1",
        "project_id": PID,
        "sprint_id": SPRINT_PLANNED,
        "key": "US-9",
        "title": "Planned",
        "points": 2,
        "archived_at": None,
        "created_at": "2026-10-20T00:00:00Z",
    }
    fake = _db(
        monkeypatch,
        user_stories=[planned],
        tasks=[_task("tp", "planned-1", "done", hours=3)],
    )
    pin_today(monkeypatch, date(2026, 10, 20))  # the sprint starts on the 26th

    _fill(_req(stories=[{"title": "Ahead", "sprint": SPRINT_PLANNED}]))

    [snap] = fake.rows("sprint_burnup_days")
    assert snap["sprint_id"] == SPRINT_PLANNED
    assert snap["stories"] == [{"id": "planned-1", "done": True, "hours": 3, "points": 2}]


def _refuse_the_record(monkeypatch, code: str, message: str) -> list[dict]:
    """Make the database refuse a snapshot that carries ``stories`` with ``code``; the refused
    payloads."""
    real = fake_supabase._Query.execute
    refused = []

    def execute(query):
        if (
            query._table == "sprint_burnup_days"
            and query._op == "upsert"
            and "stories" in query._payload
        ):
            refused.append(query._payload)
            raise APIError({"code": code, "message": message, "details": None, "hint": None})
        return real(query)

    monkeypatch.setattr(fake_supabase._Query, "execute", execute)
    return refused


@pytest.mark.parametrize(
    ("code", "message"),
    [
        ("PGRST204", "Could not find the 'stories' column of 'sprint_burnup_days'"),
        ("42703", 'column "stories" of relation "sprint_burnup_days" does not exist'),
    ],
)
def test_without_the_column_the_snapshot_keeps_its_totals(db, monkeypatch, code, message):
    """PostgREST, or Postgres, refuses a column the table doesn't have: the snapshot is written again
    without the record, one more round trip, and the move stands."""
    refused = _refuse_the_record(monkeypatch, code, message)

    db.reset_counter()
    out = controller.move_task(task_id="t2", user_id=UID, to_status="done")

    assert out["task"]["status"] == "done"
    assert len(refused) == 1
    [snap] = db.rows("sprint_burnup_days")
    assert "stories" not in snap
    assert (snap["scope_hours"], snap["completed_hours"]) == (6, 6)
    # The task, the writer check, its dependency rows, the move, the sprint's stories, and the
    # snapshot twice: the refused one (which the double counts only in ``refused``) and the retry.
    assert db.executes + len(refused) == 7


def test_another_refusal_is_not_retried_and_the_write_still_stands(db, monkeypatch, caplog):
    refused = _refuse_the_record(monkeypatch, "23514", "sprint_burnup_days_stories_valid")

    out = controller.move_task(task_id="t2", user_id=UID, to_status="done")

    assert out["task"]["status"] == "done"
    assert len(refused) == 1
    assert db.rows("sprint_burnup_days") == []
    assert "burnup snapshot failed" in caplog.text
