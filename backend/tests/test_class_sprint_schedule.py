"""A class's sprint schedule (spec D20): a class is created with it, and a new team gets its sprints.

A class carries ``sprint_count`` (1-20), ``sprint_frequency`` (weekly, biweekly or monthly) and
``sprints_start_on``, the first sprint's first day. ``POST /api/classes`` requires the count and the
frequency; the first day defaults to the class's first week of term (``start_date``). The schedule
must fit the class's dates: a first sprint that starts before ``start_date``, or a last one that ends
after the last day of classes (``end_date``), is refused with a 422 whose detail is the sentence the
web client shows, before anything is read or written. A class with no last day takes a schedule of
any length. The route answers the class row itself, which carries the schedule.

A team created in a class with a schedule (``POST /api/projects``, by a student or the instructor)
gets the schedule's sprints at once: "Sprint 1" to "Sprint N", each numbered by its place in the
schedule (``sequence``), for two round trips more. A team in a class without one gets none. The
team is never lost to its sprints: when they cannot be made, it is created without them and a
warning that names only ids is logged; the instructor's next schedule change makes them. The route
answers the project row itself.

Through the route and the real controller on a FakeSupabase. The windows are worked out by hand:
five biweekly sprints from Mon Sep 21, 2026 run Sep 21-Oct 4, Oct 5-18, Oct 19-Nov 1, Nov 2-15 and
Nov 16-29; three from Mon Sep 28 run Sep 28-Oct 11, Oct 12-25 and Oct 26-Nov 8.
"""

from __future__ import annotations

import logging

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.classes import controller as classes
from app.core.errors import DatabaseUnavailableError
from app.projects import controller as projects
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
BANNER = "https://cdn.example/class-banner.svg"
#: First week of term Mon Sep 21, last day of classes Fri Dec 4, and five biweekly sprints, the
#: last of which ends Sun Nov 29.
BODY = {
    "name": "CSE 115A",
    "term": "Fall",
    "start_date": "2026-09-21",
    "end_date": "2026-12-04",
    "sprint_count": 5,
    "sprint_frequency": "biweekly",
}


@pytest.fixture
def db(monkeypatch):
    """No class yet; INSTR's account is an instructor's."""
    fake = FakeSupabase(classes=[], assignments=[])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "instructor")
    monkeypatch.setattr(classes, "generate_course_code", lambda: "FREE0001")
    monkeypatch.setattr(classes, "upload_class_banner", lambda client, class_id: BANNER)
    return fake


def _create(client: TestClient, body: dict):
    return client.post(
        "/api/classes", headers={"Authorization": f"Bearer {make_token(sub=INSTR)}"}, json=body
    )


def _without(*keys: str) -> dict:
    return {key: value for key, value in BODY.items() if key not in keys}


def _schedule(row: dict) -> tuple:
    return (row["sprint_count"], row["sprint_frequency"], row["sprints_start_on"])


# ------------------------------------------------------------ creating a class


@pytest.mark.parametrize(
    ("changes", "schedule"),
    [
        pytest.param({}, (5, "biweekly", "2026-09-21"), id="first-sprint-in-the-first-week"),
        pytest.param(
            {"sprints_start_on": None}, (5, "biweekly", "2026-09-21"), id="null-first-day"
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-21"},
            (5, "biweekly", "2026-09-21"),
            id="first-day-named-on-the-start",
        ),
        pytest.param(
            {"end_date": "2026-11-29"},
            (5, "biweekly", "2026-09-21"),
            id="last-sprint-ends-on-the-last-day",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-26"},  # Sprint 5 ends Fri Dec 4
            (5, "biweekly", "2026-09-26"),
            id="later-first-day-ending-on-the-last-day",
        ),
        pytest.param(
            {"sprint_count": 1, "sprint_frequency": "weekly"},
            (1, "weekly", "2026-09-21"),
            id="one-weekly-sprint",
        ),
    ],
)
def test_a_class_is_created_with_its_sprint_schedule(client, db, changes, schedule):
    res = _create(client, {**BODY, **changes})
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert _schedule(row) == schedule


def test_a_class_with_no_last_day_takes_a_schedule_of_any_length(client, db):
    # Twenty monthly sprints run to May 2028: nothing to end by.
    res = _create(
        client, {**_without("end_date"), "sprint_count": 20, "sprint_frequency": "monthly"}
    )
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert "end_date" not in row
    assert _schedule(row) == (20, "monthly", "2026-09-21")


def test_the_route_answers_the_class_row_itself(client, db):
    res = _create(client, BODY)
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    # The row, not {"message": ..., "class": ...} (STYLE_GUIDE.md, Response Format).
    assert res.json() == row
    assert _schedule(res.json()) == (5, "biweekly", "2026-09-21")
    # the course-code probe, the class insert, the banner update, the TSR insert
    assert db.executes <= 4


@pytest.mark.parametrize(
    "body",
    [
        pytest.param(_without("sprint_count"), id="no-count"),
        pytest.param(_without("sprint_frequency"), id="no-frequency"),
        pytest.param({**BODY, "sprint_count": 0}, id="no-sprints"),
        pytest.param({**BODY, "sprint_count": 21}, id="over-twenty"),
        pytest.param({**BODY, "sprint_frequency": "daily"}, id="unknown-frequency"),
    ],
)
def test_a_class_needs_a_sprint_count_and_frequency(client, db, body):
    res = _create(client, body)
    assert res.status_code == 422, res.text
    assert db.executes == 0


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        pytest.param(
            {"end_date": "2026-11-01"},
            "The sprints run past the last day of classes (2026-11-01)",
            id="last-day-in-sprint-3",
        ),
        pytest.param(
            {"end_date": "2026-11-28"},
            "The sprints run past the last day of classes (2026-11-28)",
            id="last-day-before-sprint-5-ends",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-27"},  # Sprint 5 would end Sat Dec 5
            "The sprints run past the last day of classes (2026-12-04)",
            id="later-first-day-ending-past-the-last-day",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-14"},
            "The first sprint starts before the class does",
            id="first-sprint-a-week-early",
        ),
    ],
)
def test_a_schedule_that_does_not_fit_the_class_is_refused_before_anything_is_written(
    client, db, changes, detail
):
    res = _create(client, {**BODY, **changes})
    assert (res.status_code, res.json()["detail"]) == (422, detail)
    assert db.executes == 0


# ------------------------------------------------------------ creating a team

STUDENT = "20000000-0000-0000-0000-000000000002"
#: INSTR's classes. SCHEDULED runs three biweekly sprints from Mon Sep 28, 2026; UNSCHEDULED has no
#: schedule (its three columns NULL, like every class made before schedules).
SCHEDULED = "30000000-0000-0000-0000-000000000003"
UNSCHEDULED = "30000000-0000-0000-0000-000000000004"
#: The team each class already has. Because of it, a student's creation also reads whether the
#: student is on it (a student is on one team per class).
OLD_TEAM = "40000000-0000-0000-0000-000000000005"
OTHER_OLD_TEAM = "40000000-0000-0000-0000-000000000006"
#: SCHEDULED's sprints: ``(sequence, name, starts_at, ends_at)``.
THREE_BIWEEKLY = [
    (1, "Sprint 1", "2026-09-28", "2026-10-11"),
    (2, "Sprint 2", "2026-10-12", "2026-10-25"),
    (3, "Sprint 3", "2026-10-26", "2026-11-08"),
]
#: OLD_TEAM's sprints, made when it was created.
OLD_SPRINTS = [
    {
        "id": f"old-{k}",
        "project_id": OLD_TEAM,
        "sequence": k,
        "name": name,
        "starts_at": starts_at,
        "ends_at": ends_at,
        "status": "planned",
    }
    for k, name, starts_at, ends_at in THREE_BIWEEKLY
]
#: Round trips to create a team in a class without a schedule. Anyone's: the class and the caller's
#: enrollment (one wave), then the insert. A student's also: the class's teams and the student's
#: memberships in them, the student's member row, the team's recount (a read and a write), and the
#: instructor's notification (the student's profile, the insert).
WITHOUT_SPRINTS = {"student": 10, "instructor": 3}
#: What a schedule adds: the new team's numbered sprints with their stories (none yet), one insert.
SPRINT_ROUND_TRIPS = 2


@pytest.fixture
def teams(monkeypatch):
    """INSTR's two classes, each with one team. STUDENT is enrolled in both and on no team."""
    fake = FakeSupabase(
        relations={("sprints", "user_stories"): ("id", "sprint_id", True)},
        classes=[
            {
                "id": SCHEDULED,
                "created_by": INSTR,
                "sprint_count": 3,
                "sprint_frequency": "biweekly",
                "sprints_start_on": "2026-09-28",
            },
            {
                "id": UNSCHEDULED,
                "created_by": INSTR,
                "sprint_count": None,
                "sprint_frequency": None,
                "sprints_start_on": None,
            },
        ],
        class_enrollments=[
            {"id": f"e-{cid}", "class_id": cid, "user_id": STUDENT, "enrollment_role": "student"}
            for cid in (SCHEDULED, UNSCHEDULED)
        ],
        projects=[
            {"id": OLD_TEAM, "class_id": SCHEDULED, "name": "Old team", "num_members": 0},
            {"id": OTHER_OLD_TEAM, "class_id": UNSCHEDULED, "name": "Old team", "num_members": 0},
        ],
        project_members=[],
        profiles=[{"id": STUDENT, "first_name": "Sam", "last_name": "Lee", "role": "student"}],
        notifications=[],
        sprints=OLD_SPRINTS,
        user_stories=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _create_team(client: TestClient, who: str, class_id: str):
    """``POST /api/projects`` for a team called Trailhead, as STUDENT or INSTR."""
    user = {"student": STUDENT, "instructor": INSTR}[who]
    return client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {make_token(sub=user)}"},
        json={"class_id": class_id, "name": "Trailhead", "description": "d", "team_size": 4},
    )


def _new_team(db) -> dict:
    [team] = [p for p in db.rows("projects") if p["name"] == "Trailhead"]
    return team


def _answered(team: dict) -> dict:
    """The team's row as its insert answered it: a student's team is recounted after the insert."""
    return {**team, "num_members": 0}


def _sprints_of(db, project_id: str) -> list[tuple]:
    """``(sequence, name, starts_at, ends_at)`` of a team's sprints, by sequence."""
    return sorted(
        (s["sequence"], s["name"], s["starts_at"], s["ends_at"])
        for s in db.rows("sprints")
        if s["project_id"] == project_id
    )


def _trace(db) -> list[str]:
    return [f"{q['table']}:{q['op']}" for q in db.queries]


def _sprint_trips(db) -> list[str]:
    return [trip for trip in _trace(db) if trip.startswith("sprints:")]


@pytest.mark.parametrize("who", ["student", "instructor"])
def test_a_new_team_gets_the_sprints_of_its_class(client, teams, who):
    res = _create_team(client, who, SCHEDULED)
    assert res.status_code == 200, res.text
    team = _new_team(teams)
    assert _sprints_of(teams, team["id"]) == THREE_BIWEEKLY
    assert _sprint_trips(teams) == ["sprints:select", "sprints:insert"]
    assert teams.executes == WITHOUT_SPRINTS[who] + SPRINT_ROUND_TRIPS, _trace(teams)
    # Another team's sprints, on the same numbers, are left as they were.
    assert [s for s in teams.rows("sprints") if s["project_id"] == OLD_TEAM] == OLD_SPRINTS
    # The row, not {"message": ..., "project": ...} (STYLE_GUIDE.md, Response Format).
    assert res.json() == _answered(team)


@pytest.mark.parametrize("who", ["student", "instructor"])
def test_a_new_team_in_a_class_without_a_schedule_gets_no_sprints(client, teams, who):
    res = _create_team(client, who, UNSCHEDULED)
    assert res.status_code == 200, res.text
    team = _new_team(teams)
    assert _sprints_of(teams, team["id"]) == []
    assert _sprint_trips(teams) == []
    assert teams.executes == WITHOUT_SPRINTS[who], _trace(teams)
    assert res.json() == _answered(team)


@pytest.mark.parametrize(
    "failure",
    [
        pytest.param(HTTPException(status_code=409, detail="refused"), id="refused"),
        pytest.param(DatabaseUnavailableError(operation="write", target="sprints"), id="outage"),
        pytest.param(RuntimeError("a bug"), id="bug"),
    ],
)
def test_a_team_whose_sprints_cannot_be_made_is_created_without_them(
    client, teams, monkeypatch, caplog, failure
):
    def fail(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr(projects, "ensure_project_sprints", fail)
    with caplog.at_level(logging.WARNING, logger="app.projects.controller"):
        res = _create_team(client, "student", SCHEDULED)
    assert res.status_code == 200, res.text
    team = _new_team(teams)
    # Everything else as when the sprints are made: the answer, the team's product owner, and the
    # instructor's notification.
    assert res.json() == _answered(team)
    assert [(m["project_id"], m["user_id"], m["role"]) for m in teams.rows("project_members")] == [
        (team["id"], STUDENT, "product owner")
    ]
    assert [n["user_id"] for n in teams.rows("notifications")] == [INSTR]
    assert _sprints_of(teams, team["id"]) == []
    [warning] = [r for r in caplog.records if r.name == "app.projects.controller"]
    assert warning.levelno == logging.WARNING
    # Ids only: never the team's name (AGENTS.md, Sentry).
    assert warning.getMessage() == (
        f"projects: sprint creation failed | project_id={team['id']} class_id={SCHEDULED}"
    )
    assert warning.exc_info[1] is failure
