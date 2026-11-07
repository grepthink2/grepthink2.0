"""A team's move-in through the connector (app/mcp/controller.py): finished work arrives as done on
the day it was done, and each started sprint it joins has its burnup rows rebuilt in the same call.

The rows reach ``scrum_fill_board`` here; that it replaces them in one transaction is checked on DEV,
because the test double runs no SQL.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.core.errors import DatabaseConflictError
from app.mcp import controller
from app.mcp.controller import BOARD_CHANGED, FillRejected
from tests.scrum_support import PID, UID, pin_clock, pin_today
from tests.test_mcp_controller import SPRINT_DONE, SPRINT_PLANNED, _db, _fill, _req, hand_made

SCHOOL = ZoneInfo("America/Los_Angeles")
#: At noon. SPRINT_DONE ran Oct 12 to 23, SPRINT_PLANNED runs Oct 26 to Nov 6.
TODAY = date(2026, 10, 27)
OVER = "only while a board holds 3 or fewer stories that weren't imported, and this one holds more"


def _noon(day: int) -> str:
    return datetime(2026, 10, day, 12, tzinfo=SCHOOL).isoformat()


def _stories(*stories: dict) -> dict:
    return {"stories": list(stories)}


def _sent(fake) -> list[dict]:
    return fake.fill_calls[-1]["p_stories"]


def _dates_and_open_work(warnings: list[str]) -> list[str]:
    """The warnings about chosen dates and open work, without those about empty fields."""
    return [w for w in warnings if "so it's dated" in w or "stays open" in w]


# ---------------------------------------------------------------------- the window ----


@pytest.mark.parametrize(
    ("stories", "is_open"),
    [
        pytest.param(hand_made(3), True, id="3 hand-made stories"),
        pytest.param(hand_made(4), False, id="4 hand-made stories"),
        pytest.param(
            hand_made(3) + [{**s, "imported_at": "2026-10-20T00:00:00Z"} for s in hand_made(9)],
            True,
            id="imported stories don't count",
        ),
        pytest.param(
            hand_made(3) + [{**s, "archived_at": "2026-10-20T00:00:00Z"} for s in hand_made(9)],
            True,
            id="archived stories don't count",
        ),
    ],
)
def test_the_window_is_open_while_three_stories_or_fewer_were_not_imported(
    monkeypatch, stories, is_open
):
    fake = _db(monkeypatch, user_stories=stories, tasks=[])
    pin_today(monkeypatch, TODAY)

    context = controller.board_context(project_id=PID, user_id=UID)
    _fill(_req(**_stories({"title": "New"})))

    assert context["import_window_open"] is is_open
    assert bool(_sent(fake)[0]["imported_at"]) is is_open
    assert fake.rows("events")[-1]["meta"]["imported"] == (1 if is_open else 0)


def test_a_second_batch_stays_in_the_window_after_a_large_first_one(monkeypatch):
    imported = [{**s, "imported_at": _noon(26)} for s in hand_made(60)]
    fake = _db(monkeypatch, user_stories=imported, tasks=[])
    pin_today(monkeypatch, TODAY)

    _fill(
        _req(
            **_stories(
                {
                    "title": "More",
                    "sprint": SPRINT_DONE,
                    "tasks": [{"title": "t", "status": "done"}],
                }
            )
        )
    )

    assert _sent(fake)[0]["tasks"][0]["status"] == "done"


@pytest.mark.parametrize(
    ("batch", "error"),
    [
        pytest.param(
            _stories(
                {
                    "title": "s",
                    "sprint": SPRINT_PLANNED,
                    "tasks": [{"title": "t", "status": "done"}],
                }
            ),
            f"stories[0].tasks[0].status: done work can be imported {OVER}",
            id="done",
        ),
        pytest.param(
            _stories({"title": "s", "tasks": [{"title": "t", "status": "in_progress"}]}),
            f"stories[0].tasks[0].status: in_progress work can be imported {OVER}",
            id="in progress",
        ),
        pytest.param(
            {
                "sprints": [
                    {"ref": "x", "name": "Past", "starts_at": "2026-10-01", "ends_at": "2026-10-05"}
                ],
                "stories": [{"title": "s", "sprint": "x"}],
            },
            "stories[0].sprint: x is completed; add stories to a planned or active sprint. "
            f"A finished sprint takes stories {OVER}",
            id="a new finished sprint",
        ),
    ],
)
def test_past_the_window_finished_work_is_refused_and_says_why(monkeypatch, batch, error):
    fake = _db(monkeypatch, user_stories=hand_made(4), tasks=[])
    pin_today(monkeypatch, TODAY)

    with pytest.raises(FillRejected) as exc:
        _fill(_req(**batch))

    assert exc.value.errors == [error]
    assert fake.fill_calls == []


# ---------------------------------------------------------- status and the done day ----


def test_tasks_arrive_with_their_status_and_the_day_their_move_is_dated(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)
    req = _req(
        **_stories(
            {
                "title": "Finished work",
                "sprint": SPRINT_DONE,
                "tasks": [
                    {"title": "on its day", "status": "done", "done_on": "2026-10-14"},
                    {"title": "no day", "status": "done"},
                    {"title": "too late", "status": "done", "done_on": "2026-10-25"},
                    {"title": "too early", "status": "done", "done_on": "2026-10-01"},
                    {"title": "open"},
                    {"title": "under way", "status": "in_progress"},
                ],
            }
        )
    )

    result = _fill(req)

    sent = _sent(fake)[0]["tasks"]
    json.dumps(fake.fill_calls[-1])  # PostgREST serializes this; the test double doesn't
    assert "done_on" not in sent[0]
    assert [(t["title"], t["status"], t["moved_at"]) for t in sent] == [
        ("on its day", "done", _noon(14)),
        ("no day", "done", _noon(23)),
        ("too late", "done", _noon(23)),
        ("too early", "done", _noon(12)),
        ("open", "todo", None),
        (
            "under way",
            "in_progress",
            datetime(2026, 10, 27, 12, tzinfo=SCHOOL).astimezone(UTC).isoformat(),
        ),
    ]
    assert _dates_and_open_work(result["warnings"]) == [
        "stories[0].tasks[1] 'no day': no done day given, so it's dated 2026-10-23",
        "stories[0].tasks[2] 'too late': done on 2026-10-25 is outside its sprint, so it's dated "
        "2026-10-23",
        "stories[0].tasks[3] 'too early': done on 2026-10-01 is outside its sprint, so it's dated "
        "2026-10-12",
        "stories[0].tasks[4] 'open': not done in a finished sprint, so it stays open in that "
        "sprint's burnup",
        "stories[0].tasks[5] 'under way': not done in a finished sprint, so it stays open in that "
        "sprint's burnup",
    ]
    meta = fake.rows("events")[-1]["meta"]
    assert (meta["done"], meta["in_progress"], meta["imported"]) == (4, 1, 1)


def test_a_task_done_today_is_never_dated_in_the_future(monkeypatch):
    fake = _db(monkeypatch)
    morning = datetime(2026, 10, 27, 9, tzinfo=SCHOOL)
    pin_clock(monkeypatch, morning)

    result = _fill(
        _req(
            **_stories(
                {
                    "title": "This morning",
                    "sprint": SPRINT_PLANNED,
                    "tasks": [
                        {"title": "dated", "status": "done", "done_on": "2026-10-27"},
                        {"title": "undated", "status": "done"},
                    ],
                }
            )
        )
    )

    moved = [datetime.fromisoformat(t["moved_at"]) for t in _sent(fake)[0]["tasks"]]
    assert moved == [morning, morning]
    assert _dates_and_open_work(result["warnings"]) == [
        "stories[0].tasks[1] 'undated': no done day given, so it's dated 2026-10-27"
    ]


@pytest.mark.parametrize(
    ("batch", "error"),
    [
        pytest.param(
            _stories({"title": "s", "tasks": [{"title": "t", "status": "done"}]}),
            "stories[0].tasks[0].status: a done task can't sit in the backlog; put its story in "
            "the sprint that holds its done day",
            id="done in the backlog",
        ),
        pytest.param(
            {
                "sprints": [
                    {"ref": "x", "name": "Next", "starts_at": "2026-11-09", "ends_at": "2026-11-20"}
                ],
                "stories": [
                    {"title": "s", "sprint": "x", "tasks": [{"title": "t", "status": "done"}]}
                ],
            },
            "stories[0].tasks[0].status: a done task can't sit in a sprint that hasn't started; "
            "put its story in the sprint that holds its done day",
            id="done in a sprint that hasn't started",
        ),
        pytest.param(
            _stories({"title": "s", "tasks": [{"title": "t", "done_on": "2026-10-14"}]}),
            "stories[0].tasks[0].done_on: only a done task has a done day",
            id="a done day on open work",
        ),
        pytest.param(
            _stories(
                {
                    "title": "s",
                    "sprint": SPRINT_PLANNED,
                    "tasks": [{"title": "t", "status": "done", "done_on": "2026-10-28"}],
                }
            ),
            "stories[0].tasks[0].done_on: 2026-10-28 is after today, 2026-10-27",
            id="a done day in the future",
        ),
    ],
)
def test_done_work_that_cant_be_placed_is_refused(monkeypatch, batch, error):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)

    with pytest.raises(FillRejected) as exc:
        _fill(_req(**batch))

    assert exc.value.errors == [error]
    assert fake.fill_calls == []


# ------------------------------------------------------------------- the burnup rows ----


def _existing_work() -> dict:
    """In SPRINT_DONE: a task of 2 points and 1 hour, done on the 13th, reopened on the 14th and done
    again on the 16th, and one of 3 points and 2 hours never moved. An archived story's task counts
    for nothing."""
    story = {
        "id": "story-d",
        "project_id": PID,
        "sprint_id": SPRINT_DONE,
        "key": "US-d",
        "title": "Done before",
        "archived_at": None,
        "imported_at": None,
        "created_at": "2026-10-13T00:00:00Z",
    }
    task = {"story_id": "story-d", "project_id": PID, "created_at": "2026-10-13T00:00:00Z"}
    return {
        "user_stories": [
            story,
            {**story, "id": "story-a", "key": "US-a", "archived_at": "2026-10-20T00:00:00Z"},
        ],
        "tasks": [
            {**task, "id": "t1", "key": "GT-1", "points": 2, "estimate_hours": 1, "status": "done"},
            {**task, "id": "t2", "key": "GT-2", "points": 3, "estimate_hours": 2, "status": "todo"},
            {
                **task,
                "id": "t3",
                "story_id": "story-a",
                "key": "GT-3",
                "points": 8,
                "estimate_hours": 8,
                "status": "done",
            },
        ],
        "task_moves": [
            # Out of order on purpose: the rebuild sorts them.
            {"task_id": "t1", "to_status": "done", "moved_at": "2026-10-16T19:00:00Z"},
            {"task_id": "t1", "to_status": "done", "moved_at": "2026-10-13T19:00:00Z"},
            {"task_id": "t1", "to_status": "todo", "moved_at": "2026-10-14T19:00:00Z"},
            {"task_id": "t3", "to_status": "done", "moved_at": "2026-10-13T19:00:00Z"},
        ],
    }


def test_a_finished_sprint_is_rebuilt_flat_with_completed_on_the_done_days(monkeypatch):
    fake = _db(monkeypatch, **_existing_work())
    pin_today(monkeypatch, TODAY)
    before = fake.executes

    _fill(
        _req(
            **_stories(
                {
                    "title": "Imported",
                    "sprint": SPRINT_DONE,
                    "tasks": [
                        {
                            "title": "done",
                            "points": 5,
                            "estimate_hours": 4,
                            "status": "done",
                            "done_on": "2026-10-15",
                        },
                        {"title": "open", "points": 1, "estimate_hours": 3},
                    ],
                }
            )
        )
    )

    rows = fake.fill_calls[-1]["p_burnup"]
    # Its whole length, and today's row, which the cumulative chart reads.
    assert [r["day"] for r in rows] == [f"2026-10-{d}" for d in (*range(12, 24), 27)]
    assert {(r["sprint_id"], r["scope_points"], r["scope_hours"]) for r in rows} == {
        (SPRINT_DONE, 11, 10)
    }
    points = [r["completed_points"] for r in rows]
    hours = [r["completed_hours"] for r in rows]
    # Oct:      12  13  14  15  16 ... 23  27
    assert points == [0, 2, 0, 5, *[7] * 8, 7]
    assert hours == [0, 1, 0, 4, *[5] * 8, 5]
    assert fake.rows("sprint_burnup_days") == []  # replaced in the rpc, not snapshotted after it
    # access, four fanned-out reads, the counters, the work to replay, the rpc, the event: two more
    # reads than a batch with no sprint to rebuild.
    assert fake.executes - before == 9


def test_rows_carry_the_counters_they_were_computed_from(monkeypatch):
    counters = [{"project_id": PID, "story_seq": 7, "task_seq": 21}]
    fake = _db(monkeypatch, scrum_counters=counters)
    pin_today(monkeypatch, TODAY)

    _fill(_req(**_stories({"title": "Now", "sprint": SPRINT_PLANNED})))

    params = fake.fill_calls[-1]
    assert (params["p_expected_story_seq"], params["p_expected_task_seq"]) == (7, 21)


def test_a_board_with_no_counters_yet_expects_zero(monkeypatch):
    fake = _db(monkeypatch, scrum_counters=[])
    pin_today(monkeypatch, TODAY)

    _fill(_req(**_stories({"title": "Now", "sprint": SPRINT_PLANNED})))

    params = fake.fill_calls[-1]
    assert (params["p_expected_story_seq"], params["p_expected_task_seq"]) == (0, 0)


def test_a_batch_with_no_rows_expects_nothing(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)

    _fill(_req(**_stories({"title": "Backlog"})))

    params = fake.fill_calls[-1]
    assert (params["p_expected_story_seq"], params["p_expected_task_seq"]) == (None, None)


def test_another_batch_reaching_the_board_first_is_a_refusal_the_assistant_can_act_on(monkeypatch):
    def beaten(_params):
        raise DatabaseConflictError(operation="write", target="scrum_fill_board", pg_code="23505")

    _db(monkeypatch, fill=beaten)
    pin_today(monkeypatch, TODAY)

    with pytest.raises(FillRejected) as exc:
        _fill(_req(**_stories({"title": "Now", "sprint": SPRINT_PLANNED})))

    assert exc.value.errors == [BOARD_CHANGED]


def test_work_finished_after_a_sprint_ended_counts_only_on_todays_row(monkeypatch):
    work = _existing_work()
    work["task_moves"] = [
        {"task_id": "t2", "to_status": "done", "moved_at": "2026-10-25T19:00:00Z"}  # after its end
    ]
    fake = _db(monkeypatch, **work)
    pin_today(monkeypatch, TODAY)

    _fill(_req(**_stories({"title": "Imported", "sprint": SPRINT_DONE})))

    rows = {r["day"]: r["completed_points"] for r in fake.fill_calls[-1]["p_burnup"]}
    assert rows["2026-10-23"] == 0
    assert rows["2026-10-27"] == 3
    assert "2026-10-25" not in rows


def test_one_batch_rebuilds_a_started_sprint_and_snapshots_one_that_has_not(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(
        monkeypatch, date(2026, 10, 20)
    )  # Sprint 0 is running, and Sprint 1 starts on the 26th

    _fill(
        _req(
            **_stories(
                {"title": "Running", "sprint": SPRINT_DONE},
                {"title": "Ahead", "sprint": SPRINT_PLANNED},
            )
        )
    )

    assert {r["sprint_id"] for r in fake.fill_calls[-1]["p_burnup"]} == {SPRINT_DONE}
    assert [r["sprint_id"] for r in fake.rows("sprint_burnup_days")] == [SPRINT_PLANNED]


def test_a_new_sprint_needs_a_ref(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)
    sprint = {"ref": "", "name": "Past", "starts_at": "2026-10-01", "ends_at": "2026-10-02"}

    with pytest.raises(FillRejected) as exc:
        _fill(_req(sprints=[sprint], stories=[]))

    assert exc.value.errors == ["sprints[0].ref: must not be empty"]
    assert fake.fill_calls == []


def test_a_running_sprint_is_rebuilt_up_to_today(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)

    _fill(
        _req(
            **_stories(
                {
                    "title": "Now",
                    "sprint": SPRINT_PLANNED,
                    "tasks": [
                        {"title": "t", "points": 2, "status": "done", "done_on": "2026-10-26"}
                    ],
                }
            )
        )
    )

    rows = fake.fill_calls[-1]["p_burnup"]
    assert [(r["day"], r["scope_points"], r["completed_points"]) for r in rows] == [
        ("2026-10-26", 2, 2),
        ("2026-10-27", 2, 2),
    ]


def test_a_new_finished_sprint_is_rebuilt_by_its_ref(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, TODAY)

    _fill(
        _req(
            sprints=[
                {"ref": "x", "name": "Past", "starts_at": "2026-10-01", "ends_at": "2026-10-02"}
            ],
            stories=[
                {
                    "title": "s",
                    "sprint": "x",
                    "tasks": [
                        {
                            "title": "t",
                            "estimate_hours": 2,
                            "status": "done",
                            "done_on": "2026-10-02",
                        }
                    ],
                }
            ],
        )
    )

    assert fake.fill_calls[-1]["p_burnup"] == [
        {
            "sprint_ref": "x",
            "day": day,
            "scope_points": 0,
            "completed_points": 0,
            "scope_hours": 2,
            "completed_hours": done,
        }
        for day, done in (("2026-10-01", 0), ("2026-10-02", 2), ("2026-10-27", 2))
    ]
    assert fake.rows("sprint_burnup_days") == []


def test_a_sprint_that_hasnt_started_keeps_its_snapshot_and_needs_no_rows(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, date(2026, 10, 20))  # Sprint 1 starts on the 26th
    before = fake.executes

    _fill(_req(**_stories({"title": "Ahead", "sprint": SPRINT_PLANNED})))

    assert fake.fill_calls[-1]["p_burnup"] == []
    assert _sent(fake)[0]["imported_at"]  # the stories still count as imported
    assert [r["sprint_id"] for r in fake.rows("sprint_burnup_days")] == [SPRINT_PLANNED]
    # access, four fanned-out reads, the rpc, the snapshot's read and write, the event: no work
    # to replay.
    assert fake.executes - before == 9
