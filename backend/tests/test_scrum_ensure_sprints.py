"""A team's sprints follow its class's sprint schedule (spec D20): ``ensure_project_sprints``.

Sprint k of the schedule is the team's sprint whose ``sequence`` is k, named "Sprint k", over the
schedule's k-th window. A call inserts the missing ones in one insert, updates in place each one
whose name or dates differ (its stories stay in it), and deletes the ones beyond the count in one
delete while no story is in them. When a story is in one, the call answers 409 ``SPRINTS_IN_USE``
naming the team and the lowest such sprint, and writes nothing. A sprint made any other way
(``sequence`` NULL, as every sprint made before schedules) is never touched, and neither is another
team's.

Through the real controller and a FakeSupabase; the windows are worked out by hand.
"""

from datetime import date

import pytest
from fastapi import HTTPException

from app.core.db import get_client
from app.scrum import controller
from app.scrum.schedule import Schedule
from tests.scrum_support import OTHER_PID, PID, UID, scrum_db

START = date(2026, 9, 28)  # a Monday
#: The windows of three biweekly sprints from START.
BIWEEKLY = [
    ("2026-09-28", "2026-10-11"),
    ("2026-10-12", "2026-10-25"),
    ("2026-10-26", "2026-11-08"),
]

#: Made through ``POST /api/projects/{id}/scrum/sprints`` before the class had a schedule: no
#: sequence, though it carries the name the schedule gives sequence 1.
LEGACY = {
    "id": "legacy",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-09-01",
    "ends_at": "2026-09-14",
    "status": "planned",
    "sequence": None,
}
#: The other team's Sprint 1, on other dates, and its Sprint 4, beyond every count used here.
OTHER_TEAM = [
    {**LEGACY, "id": "other-1", "project_id": OTHER_PID, "sequence": 1},
    {**LEGACY, "id": "other-4", "project_id": OTHER_PID, "name": "Sprint 4", "sequence": 4},
]


def _sprint(k: int, window: tuple[str, str], name: str | None = None) -> dict:
    """This team's sprint ``k`` of a schedule, as PostgREST returns it (dates as ISO text)."""
    starts_at, ends_at = window
    return {
        "id": f"s{k}",
        "project_id": PID,
        "name": name or f"Sprint {k}",
        "starts_at": starts_at,
        "ends_at": ends_at,
        "status": "planned",
        "sequence": k,
    }


#: Sprints 1-3 of the biweekly schedule, ids s1-s3.
SCHEDULED = [_sprint(k, window) for k, window in enumerate(BIWEEKLY, start=1)]


def _story(sid: str, sprint_id: str) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "key": sid,
        "title": sid,
        "sprint_id": sprint_id,
        "reporter_id": UID,
        "archived_at": None,
    }


def _seed(monkeypatch, sprints=(), stories=()):
    """This team's ``sprints`` and ``stories``, beside LEGACY and the other team's sprints."""
    return scrum_db(
        monkeypatch,
        sprints=[dict(LEGACY), *(dict(s) for s in OTHER_TEAM), *(dict(s) for s in sprints)],
        user_stories=[dict(s) for s in stories],
    )


def _ensure(start_on: date = START, count: int = 3, frequency: str = "biweekly") -> dict:
    return controller.ensure_project_sprints(
        get_client(),
        project_id=PID,
        project_name="Trailhead",
        schedule=Schedule(start_on, count, frequency),
    )


def _ours(db) -> list[dict]:
    """This team's scheduled sprints, by sequence."""
    rows = [
        r for r in db.rows("sprints") if r["project_id"] == PID and r.get("sequence") is not None
    ]
    return sorted(rows, key=lambda r: r["sequence"])


def _windows(db) -> list[tuple]:
    """``(sequence, name, starts_at, ends_at)`` of this team's scheduled sprints."""
    return [(r["sequence"], r["name"], r["starts_at"], r["ends_at"]) for r in _ours(db)]


def _theirs(db) -> list[dict]:
    """The sprints no call here may touch: LEGACY and the other team's."""
    return [r for r in db.rows("sprints") if r["project_id"] != PID or r.get("sequence") is None]


def _writes(db) -> list[str]:
    """The write operations so far, sorted: which writes ran, not in which order."""
    return sorted(q["op"] for q in db.queries if q["op"] != "select")


def test_a_team_without_sprints_gets_them_all_in_one_insert(monkeypatch):
    db = _seed(monkeypatch)
    assert _ensure() == {"created": 3, "updated": 0, "deleted": 0}
    assert _windows(db) == [
        (1, "Sprint 1", "2026-09-28", "2026-10-11"),
        (2, "Sprint 2", "2026-10-12", "2026-10-25"),
        (3, "Sprint 3", "2026-10-26", "2026-11-08"),
    ]
    # What the insert wrote (the fake adds the id). No status: the column keeps its default, and
    # the API derives a sprint's status from its dates (D22).
    columns = {"id", "project_id", "name", "starts_at", "ends_at", "sequence"}
    assert [set(row) for row in _ours(db)] == [columns] * 3
    assert [(q["table"], q["op"]) for q in db.queries] == [
        ("sprints", "select"),
        ("sprints", "insert"),
    ]
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_the_same_schedule_again_reads_once_and_writes_nothing(monkeypatch):
    db = _seed(monkeypatch)
    _ensure()
    stored = [dict(row) for row in db.rows("sprints")]
    db.reset_counter()
    assert _ensure() == {"created": 0, "updated": 0, "deleted": 0}
    assert db.executes == 1
    assert db.rows("sprints") == stored


def test_a_lower_count_deletes_the_empty_sprint_beyond_it(monkeypatch):
    db = _seed(monkeypatch, sprints=SCHEDULED, stories=[_story("A", "s1"), _story("B", "s2")])
    assert _ensure(count=2) == {"created": 0, "updated": 0, "deleted": 1}
    assert [row["id"] for row in _ours(db)] == ["s1", "s2"]
    assert _writes(db) == ["delete"]
    assert db.executes == 3  # the sprints, the stories in Sprint 3, the delete
    assert [story["sprint_id"] for story in db.rows("user_stories")] == ["s1", "s2"]
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_a_story_beyond_the_count_refuses_the_change_and_nothing_is_written(monkeypatch):
    """The call would also give Sprint 1 its name back and create Sprint 2; it does neither."""
    sprints = [_sprint(1, BIWEEKLY[0], name="Kickoff"), _sprint(3, BIWEEKLY[2])]
    db = _seed(monkeypatch, sprints=sprints, stories=[_story("A", "s3")])
    with pytest.raises(HTTPException) as refused:
        _ensure(count=2)
    assert refused.value.status_code == 409
    assert refused.value.detail == (
        "Trailhead already uses Sprint 3; lower the count after they move their stories or "
        "delete that plan"
    )
    assert _writes(db) == []
    assert db.executes == 2  # the sprints and the stories in Sprint 3
    assert db.rows("sprints") == [LEGACY, *OTHER_TEAM, *sprints]


def test_the_refusal_names_the_lowest_sprint_in_use(monkeypatch):
    # Sprint 3 and its story come back first: the reads have no order.
    db = _seed(monkeypatch, sprints=SCHEDULED[::-1], stories=[_story("C", "s3"), _story("B", "s2")])
    with pytest.raises(HTTPException) as refused:
        _ensure(count=1)
    assert refused.value.detail == (
        "Trailhead already uses Sprint 2; lower the count after they move their stories or "
        "delete that plan"
    )
    assert _writes(db) == []


def test_a_new_frequency_moves_each_sprint_in_place(monkeypatch):
    db = _seed(monkeypatch, sprints=SCHEDULED, stories=[_story("B", "s2")])
    assert _ensure(frequency="weekly") == {"created": 0, "updated": 3, "deleted": 0}
    assert [(r["id"], r["name"], r["starts_at"], r["ends_at"]) for r in _ours(db)] == [
        ("s1", "Sprint 1", "2026-09-28", "2026-10-04"),
        ("s2", "Sprint 2", "2026-10-05", "2026-10-11"),
        ("s3", "Sprint 3", "2026-10-12", "2026-10-18"),
    ]
    assert db.rows("user_stories")[0]["sprint_id"] == "s2"  # the story stays in its sprint
    assert _writes(db) == ["update"] * 3
    assert db.executes == 4  # the sprints, then one update per sprint
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_one_call_inserts_renames_and_deletes(monkeypatch):
    """Sprint 1 is right, Sprint 2 was renamed, Sprint 3 is missing, and Sprints 4 and 5, left
    from a longer schedule, are empty: one insert, one update and one delete."""
    sprints = [
        _sprint(1, BIWEEKLY[0]),
        _sprint(2, BIWEEKLY[1], name="Kickoff"),
        _sprint(4, ("2026-11-09", "2026-11-22")),
        _sprint(5, ("2026-11-23", "2026-12-06")),
    ]
    db = _seed(monkeypatch, sprints=sprints)
    assert _ensure() == {"created": 1, "updated": 1, "deleted": 2}
    assert _windows(db) == [
        (1, "Sprint 1", "2026-09-28", "2026-10-11"),
        (2, "Sprint 2", "2026-10-12", "2026-10-25"),
        (3, "Sprint 3", "2026-10-26", "2026-11-08"),
    ]
    assert [row["id"] for row in _ours(db)][:2] == ["s1", "s2"]
    assert _writes(db) == ["delete", "insert", "update"]
    assert db.executes == 5  # the sprints, the stories in Sprints 4 and 5, then the three writes
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_a_sprint_without_a_sequence_survives_every_call(monkeypatch):
    """LEGACY carries the name "Sprint 1" and a story, and is never the schedule's Sprint 1: the
    schedule creates its own sprints, moves them, deletes two and moves and adds again."""
    db = _seed(monkeypatch, stories=[_story("L", "legacy")])
    calls = [
        ({}, {"created": 3, "updated": 0, "deleted": 0}),
        ({}, {"created": 0, "updated": 0, "deleted": 0}),
        ({"frequency": "weekly"}, {"created": 0, "updated": 3, "deleted": 0}),
        ({"count": 1, "frequency": "weekly"}, {"created": 0, "updated": 0, "deleted": 2}),
        (
            {"start_on": date(2026, 10, 5), "count": 2, "frequency": "monthly"},
            {"created": 1, "updated": 1, "deleted": 0},
        ),
    ]
    for schedule, result in calls:
        assert _ensure(**schedule) == result
        assert _theirs(db) == [LEGACY, *OTHER_TEAM]
    assert _windows(db) == [
        (1, "Sprint 1", "2026-10-05", "2026-11-04"),
        (2, "Sprint 2", "2026-11-05", "2026-12-04"),
    ]
    assert db.rows("user_stories")[0]["sprint_id"] == "legacy"
