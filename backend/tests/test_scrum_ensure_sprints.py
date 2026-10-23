"""A team's sprints follow its class's sprint schedule (spec D20): ``ensure_project_sprints``.

Sprint k of the schedule is the team's sprint whose ``sequence`` is k, named "Sprint k", over the
schedule's k-th window. One read takes the team's sequenced sprints with their stories. Then a call
deletes the ones beyond the count in one delete while no story is in them, inserts the missing ones
in one insert, and rewrites in one upsert each one whose name or dates differ, in place (its
stories stay in it). When a story is in a sprint beyond the count, the call answers 409
``SPRINTS_IN_USE`` naming the team and the lowest such sprint, and writes nothing. A sprint made
any other way (``sequence`` NULL, as every sprint made before schedules) is never touched, and
neither is another team's. A team's count either grows or shrinks, so a call costs at most three
round trips.

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


def _record_upserts(monkeypatch, db) -> list[tuple[list[dict], dict]]:
    """Each ``sprints`` upsert's rows and options, as the controller sends them."""
    upserts: list[tuple[list[dict], dict]] = []
    table = db.table

    def recording_table(name):
        query = table(name)
        if name == "sprints":
            upsert = query.upsert

            def recording_upsert(rows, **options):
                upserts.append((rows, options))
                return upsert(rows, **options)

            query.upsert = recording_upsert
        return query

    monkeypatch.setattr(db, "table", recording_table)
    return upserts


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
    assert db.executes == 2  # the sprints with their stories, the delete
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
    assert db.executes == 1  # the sprints with their stories
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


def test_new_dates_rewrite_every_sprint_in_place_in_one_upsert(monkeypatch):
    db = _seed(monkeypatch, sprints=SCHEDULED, stories=[_story("B", "s2")])
    upserts = _record_upserts(monkeypatch, db)
    assert _ensure(frequency="weekly") == {"created": 0, "updated": 3, "deleted": 0}
    [(rows, options)] = upserts
    assert options == {"on_conflict": "id"}
    # Each row carries every NOT NULL column that has no default, and no status: the stored
    # status is left as it is.
    columns = {"id", "project_id", "sequence", "name", "starts_at", "ends_at"}
    assert [set(row) for row in rows] == [columns] * 3
    assert sorted(
        (r["sequence"], r["id"], r["project_id"], r["name"], r["starts_at"], r["ends_at"])
        for r in rows
    ) == [
        (1, "s1", PID, "Sprint 1", "2026-09-28", "2026-10-04"),
        (2, "s2", PID, "Sprint 2", "2026-10-05", "2026-10-11"),
        (3, "s3", PID, "Sprint 3", "2026-10-12", "2026-10-18"),
    ]
    assert [(r["id"], r["name"], r["starts_at"], r["ends_at"]) for r in _ours(db)] == [
        ("s1", "Sprint 1", "2026-09-28", "2026-10-04"),
        ("s2", "Sprint 2", "2026-10-05", "2026-10-11"),
        ("s3", "Sprint 3", "2026-10-12", "2026-10-18"),
    ]
    assert db.rows("user_stories")[0]["sprint_id"] == "s2"  # the story stays in its sprint
    assert _writes(db) == ["upsert"]
    assert db.executes == 2  # the sprints with their stories, the upsert
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_a_higher_count_with_new_dates_costs_three_round_trips(monkeypatch):
    db = _seed(monkeypatch, sprints=SCHEDULED)
    assert _ensure(count=5, frequency="weekly") == {"created": 2, "updated": 3, "deleted": 0}
    assert _windows(db) == [
        (1, "Sprint 1", "2026-09-28", "2026-10-04"),
        (2, "Sprint 2", "2026-10-05", "2026-10-11"),
        (3, "Sprint 3", "2026-10-12", "2026-10-18"),
        (4, "Sprint 4", "2026-10-19", "2026-10-25"),
        (5, "Sprint 5", "2026-10-26", "2026-11-01"),
    ]
    assert _writes(db) == ["insert", "upsert"]
    assert db.executes == 3  # the sprints with their stories, the insert, the upsert
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_a_lower_count_with_new_dates_costs_three_round_trips(monkeypatch):
    db = _seed(monkeypatch, sprints=SCHEDULED, stories=[_story("A", "s1")])
    assert _ensure(count=2, frequency="weekly") == {"created": 0, "updated": 2, "deleted": 1}
    assert [(r["id"], r["name"], r["starts_at"], r["ends_at"]) for r in _ours(db)] == [
        ("s1", "Sprint 1", "2026-09-28", "2026-10-04"),
        ("s2", "Sprint 2", "2026-10-05", "2026-10-11"),
    ]
    assert _writes(db) == ["delete", "upsert"]
    assert db.executes == 3  # the sprints with their stories, the delete, the upsert
    assert _theirs(db) == [LEGACY, *OTHER_TEAM]


def test_a_gap_below_the_count_costs_one_write_of_each_kind(monkeypatch):
    """Sprint 1 is right, Sprint 2 was renamed, Sprint 3 is missing, and Sprints 4 and 5 are
    empty: one delete, one insert and one upsert, four round trips. Only a team edited by hand
    looks like this: the schedule's own writes leave a team's sequences running from 1 with no
    gap, so its count either grows or shrinks."""
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
    assert _writes(db) == ["delete", "insert", "upsert"]
    assert db.executes == 4  # the sprints with their stories, then the three writes
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
