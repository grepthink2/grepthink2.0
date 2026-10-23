"""The scrum board's calendar day is the school's day, not Pacific's.

One instant, 22:30 UTC on 10 September 2026, is 15:30 on the 10th in Santa Cruz (PDT, UTC-7)
and already 01:30 on the 11th in Istanbul (UTC+3). Everything the board files under a day (the
burnup snapshots and series, the day a move counts on, the daily AI quota) must follow the class's
school, read from the ``institution_id`` that rides on the membership check every endpoint makes.
A class with no school keeps the default zone, Pacific.
"""

from datetime import UTC, datetime

import pytest

from app.config import settings
from app.core.errors import DatabaseError
from app.institutions import controller as institutions
from app.scrum import controller
from tests.conftest import ISTINYE_INSTITUTION, UCSC_INSTITUTION
from tests.scrum_support import CLASS, INSTR, PID, UID, pin_clock, scrum_db

ISTINYE = ISTINYE_INSTITUTION["id"]
LATE_ON_THE_10TH = datetime(2026, 9, 10, 22, 30, tzinfo=UTC)

SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-09-09",
    "ends_at": "2026-09-13",
    "status": "active",
}
STORY = {
    "id": "st1",
    "project_id": PID,
    "key": "US-1",
    "title": "Search",
    "sprint_id": "sp1",
    "points": 5,
    "created_at": "1",
    "archived_at": None,
}
TASK = {
    "id": "t1",
    "story_id": "st1",
    "project_id": PID,
    "key": "GT-1",
    "title": "Index it",
    "status": "done",
    "points": 3,
    "tags": [],
    "created_at": "1",
}


def _class(institution_id):
    return {"id": CLASS, "created_by": INSTR, "institution_id": institution_id}


def _board_of(monkeypatch, school, *, task=TASK, **tables):
    """A class at ``school`` (an institution id, or None) with one sprint, story and task."""
    return scrum_db(
        monkeypatch,
        classes=[_class(school)],
        sprints=[dict(SPRINT)],
        user_stories=[dict(STORY)],
        tasks=[dict(task)],
        **tables,
    )


@pytest.mark.parametrize("viewer", [UID, INSTR], ids=["a team member", "the instructor"])
@pytest.mark.parametrize(
    ("school", "snapshot_day", "scope"),
    [
        pytest.param(None, "2026-09-10", [0, 5], id="no school: the default zone"),
        pytest.param(UCSC_INSTITUTION["id"], "2026-09-10", [0, 5], id="Santa Cruz"),
        pytest.param(ISTINYE, "2026-09-11", [0, 0, 5], id="Istanbul"),
    ],
)
def test_the_board_files_its_burnup_under_the_schools_day(
    monkeypatch, with_istinye, school, snapshot_day, scope, viewer
):
    pin_clock(monkeypatch, LATE_ON_THE_10TH)
    db = _board_of(monkeypatch, school)

    board = controller.get_board(project_id=PID, user_id=viewer, sprint_id=None)

    [snap] = db.rows("sprint_burnup_days")
    assert snap["day"] == snapshot_day
    series = board["burnup"]["sprint"]
    assert series["labels"] == ["9/9", "9/10", "9/11", "9/12", "9/13"]
    assert series["scope"] == scope  # one value per day up to the school's today
    assert not {"classes", "institutions"} & {q["table"] for q in db.queries}


@pytest.mark.parametrize(
    ("school", "completed"),
    [
        # 22:00 UTC on the 9th: the afternoon of the 9th in Santa Cruz, 01:00 on the 10th in Istanbul.
        pytest.param(None, [0, 3, 3, 3], id="finished on the 9th in Santa Cruz"),
        pytest.param(ISTINYE, [0, 0, 3, 3], id="finished on the 10th in Istanbul"),
    ],
)
def test_a_finished_task_counts_on_the_day_the_school_finished_it(
    monkeypatch, with_istinye, school, completed
):
    pin_clock(monkeypatch, datetime(2026, 9, 11, 12, tzinfo=UTC))
    move = {
        "id": "mv1",
        "task_id": "t1",
        "from_status": "todo",
        "to_status": "done",
        "moved_by": UID,
        "moved_at": "2026-09-09T22:00:00Z",
    }
    scrum_db(
        monkeypatch,
        classes=[_class(school)],
        sprints=[dict(SPRINT, starts_at="2026-09-08")],
        user_stories=[dict(STORY)],
        tasks=[dict(TASK)],
        task_moves=[move],
    )

    board = controller.get_board(project_id=PID, user_id=UID, sprint_id=None)

    assert board["burnup"]["sprint"]["completed"] == completed  # 9/8 to the school's today, 9/11


WRITES = {
    "create_story": lambda: controller.create_story(
        project_id=PID, user_id=UID, fields={"title": "New", "sprint_id": "sp1"}
    ),
    "update_story": lambda: controller.update_story(
        story_id="st1", user_id=UID, fields={"points": 8}
    ),
    "create_task": lambda: controller.create_task(
        story_id="st1", user_id=UID, fields={"title": "New"}
    ),
    "move_task": lambda: controller.move_task(task_id="t1", user_id=UID, to_status="done"),
}


@pytest.mark.parametrize("write", WRITES.values(), ids=WRITES.keys())
def test_a_write_snapshots_the_burnup_on_the_schools_day(monkeypatch, with_istinye, write):
    pin_clock(monkeypatch, LATE_ON_THE_10TH)
    db = _board_of(monkeypatch, ISTINYE, task=dict(TASK, status="todo"))

    write()

    assert [s["day"] for s in db.rows("sprint_burnup_days")] == ["2026-09-11"]
    # The school came with the membership check, not from a read of its own.
    assert not {"classes", "institutions", "projects"} & {q["table"] for q in db.queries}


def test_the_school_adds_no_round_trip_to_a_move(monkeypatch, with_istinye):
    pin_clock(monkeypatch, LATE_ON_THE_10TH)
    db = _board_of(monkeypatch, ISTINYE, task=dict(TASK, status="todo"))

    controller.move_task(task_id="t1", user_id=UID, to_status="done")

    # The same six as a Santa Cruz move (test_scrum_moves): the task, the writer check, its
    # dependency rows (none), the insert, and the snapshot's read and upsert.
    assert db.executes == 6


def test_a_write_still_succeeds_when_the_schools_zone_cannot_be_read(monkeypatch, with_istinye):
    """The snapshot is best-effort: an institutions outage with nothing cached costs the
    snapshot, never the move that already happened."""
    pin_clock(monkeypatch, LATE_ON_THE_10TH)
    db = _board_of(monkeypatch, ISTINYE, task=dict(TASK, status="todo"))

    def unreadable():
        raise DatabaseError(operation="read", target="institutions")

    monkeypatch.setattr(institutions, "_cache", None)
    monkeypatch.setattr(institutions, "_fetch_institutions", unreadable)

    out = controller.move_task(task_id="t1", user_id=UID, to_status="done")

    assert out["task"]["status"] == "done"
    assert db.rows("sprint_burnup_days") == []


def test_the_daily_ai_quota_rolls_over_at_the_schools_midnight(monkeypatch, with_istinye):
    """Ten drafts on the 10th used up the quota of Santa Cruz's day; in Istanbul it is the 11th."""
    pin_clock(monkeypatch, LATE_ON_THE_10TH)
    db = scrum_db(
        monkeypatch,
        classes=[_class(ISTINYE)],
        ai_draft_usage=[{"user_id": UID, "used_on": "2026-09-10", "count": 10}],
    )
    monkeypatch.setattr(settings, "AI_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_BASE_URL", "http://ai.test")
    monkeypatch.setattr("app.scrum.ai_draft.request_draft", lambda **_: {"title": "Search"})

    out = controller.ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)

    assert out["draft"]["title"] == "Search"
    assert {r["used_on"]: r["count"] for r in db.rows("ai_draft_usage")} == {
        "2026-09-10": 10,
        "2026-09-11": 1,
    }
