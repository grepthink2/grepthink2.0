"""A class's sprint schedule (spec D20): a class is created with it, a new team gets its sprints, and
when the instructor changes it every team's sprints follow.

A class carries ``sprint_count`` (1-20), ``sprint_frequency`` (weekly, biweekly or monthly) and
``sprints_start_on``, the first sprint's first day. ``POST /api/classes`` requires the count and the
frequency; the first day defaults to the class's first week of term (``start_date``). The schedule
must fit the class's dates: a first sprint that starts before ``start_date``, or a last one that ends
after the Sunday of the week (Monday to Sunday) that holds the last day of classes (``end_date``),
is refused with a 422 whose detail is the sentence the web client shows, before anything is read or
written. So is a first sprint that starts after the latest last day of classes the class allows (a
year after its first week of term), or so late that the schedule's dates would pass the end of the
calendar, whatever the class's dates. A term that runs Monday to Friday keeps the sprints that end
on the Sunday after its last day, and a class with no last day takes a schedule of any length. The
route answers the class row itself, which carries the schedule.

A team created in a class with a schedule (``POST /api/projects``, by a student or the instructor)
gets the schedule's sprints at once: "Sprint 1" to "Sprint N", each numbered by its place in the
schedule (``sequence``), for two round trips more. A team in a class without one gets none. The
team is never lost to its sprints: when they cannot be made, it is created without them and a line
that names only ids is logged, a warning for a refusal or a database failure and an error for a
bug; the instructor's next schedule change makes them. The route answers the project row itself.

The instructor sets or changes the schedule later (``PATCH /api/classes/{class_id}/sprints``, all
three fields required, the same fit rules), and every team's sprints follow it: the missing ones are
made, the ones whose dates change are rewritten in place, so their stories stay in them, and the ones
beyond the new count are deleted. A story in a sprint the change would delete, archived or not,
refuses the change (409) before anything is written, naming the first such team by name and its
lowest such sprint. The route answers the class row, how many teams it has and how many sprints were
created, updated and deleted. A team whose sprints already follow the schedule costs one read and
writes nothing, so sending the same schedule again changes no sprint.

Through the route and the real controller on a FakeSupabase. The windows are worked out by hand:
five biweekly sprints from Mon Sep 21, 2026 run Sep 21-Oct 4, Oct 5-18, Oct 19-Nov 1, Nov 2-15 and
Nov 16-29; three from Mon Sep 28 run Sep 28-Oct 11, Oct 12-25 and Oct 26-Nov 8; four weekly ones from
Mon Sep 28 run Sep 28-Oct 4, Oct 5-11, Oct 12-18 and Oct 19-25.
"""

from __future__ import annotations

import logging
from typing import get_args

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.classes import controller as classes
from app.classes.models import SprintFrequency
from app.core.errors import DatabaseUnavailableError
from app.projects import controller as projects
from app.scrum.schedule import FREQUENCIES
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
            {"sprints_start_on": "2026-09-28"},  # Sprint 5 ends Sun Dec 6
            (5, "biweekly", "2026-09-28"),
            id="last-sprint-ends-on-the-sunday-after-the-last-day",
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
        # The detail names the last day as the web client shows it beside "Sprint 5 ends Nov 29".
        pytest.param(
            {"end_date": "2026-11-01"},
            "The sprints run past the last day of classes (Nov 1, 2026)",
            id="last-day-in-sprint-3",
        ),
        pytest.param(
            # The Sunday before the week Sprint 5 ends in (Mon Nov 23 to Sun Nov 29).
            {"end_date": "2026-11-22"},
            "The sprints run past the last day of classes (Nov 22, 2026)",
            id="last-day-a-week-before-sprint-5-ends",
        ),
        pytest.param(
            {"sprints_start_on": "2026-09-29"},  # Sprint 5 would end Mon Dec 7
            "The sprints run past the last day of classes (Dec 4, 2026)",
            id="last-sprint-ending-a-day-past-the-sunday-after-the-last-day",
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


#: A ten-week term from Mon Jan 4 to Fri Mar 12, 2027. Five biweekly sprints and ten weekly ones
#: from its first day both end on Sun Mar 14.
TEN_WEEKS = {**BODY, "term": "Winter", "start_date": "2027-01-04", "end_date": "2027-03-12"}
TEN_WEEK_SCHEDULES = pytest.mark.parametrize(
    ("count", "frequency"), [(5, "biweekly"), (10, "weekly")], ids=["5-biweekly", "10-weekly"]
)
#: The term's last day of classes: its Friday, or the Sunday that ends its last week.
LAST_DAYS = pytest.mark.parametrize("last_day", ["2027-03-12", "2027-03-14"], ids=["fri", "sun"])
#: Each last day as a refusal names it.
NAMED = {"2027-03-12": "Mar 12, 2027", "2027-03-14": "Mar 14, 2027"}


@TEN_WEEK_SCHEDULES
@LAST_DAYS
def test_a_term_from_monday_to_friday_takes_the_sprints_that_end_on_its_last_sunday(
    client, db, count, frequency, last_day
):
    body = {**TEN_WEEKS, "end_date": last_day, "sprint_count": count, "sprint_frequency": frequency}
    res = _create(client, body)
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert _schedule(row) == (count, frequency, "2027-01-04")


@TEN_WEEK_SCHEDULES
@LAST_DAYS
def test_a_term_from_monday_to_friday_refuses_sprints_that_end_a_day_past_its_last_sunday(
    client, db, count, frequency, last_day
):
    # From Tue Jan 5, the same sprints end on Mon Mar 15.
    body = {
        **TEN_WEEKS,
        "end_date": last_day,
        "sprint_count": count,
        "sprint_frequency": frequency,
        "sprints_start_on": "2027-01-05",
    }
    res = _create(client, body)
    assert (res.status_code, res.json()["detail"]) == (
        422,
        f"The sprints run past the last day of classes ({NAMED[last_day]})",
    )
    assert db.executes == 0


#: The 422 for a first sprint after the latest last day of classes the class allows (the end of week
#: 53 of term), or so late that the schedule's dates would pass the end of the calendar.
START_TOO_LATE = "The first sprint must start within a year of the first week of term"


@pytest.mark.parametrize(
    "changes",
    [
        # Its last sprint would end past Dec 31, 9999: this was a 500.
        pytest.param({"sprints_start_on": "9999-12-25"}, id="far-future-with-a-last-day"),
        # Nothing to end by, so nothing was computed and the day was stored: every team made in the
        # class would then fail to get its sprints.
        pytest.param(
            {"sprints_start_on": "9999-12-25", "end_date": None}, id="far-future-with-no-last-day"
        ),
        # Week 53 of a term from Mon Sep 21, 2026 ends Sun Sep 26, 2027.
        pytest.param(
            {"sprints_start_on": "2027-09-27", "end_date": None}, id="the-day-after-week-53"
        ),
        # A term in the year 9999 allows a last day as late as Dec 31, 9999, but its five biweekly
        # sprints can't start after Oct 22: the calendar ends ten weeks on. Same sentence: a day that
        # late can only be a typo.
        pytest.param(
            {"start_date": "9999-01-04", "end_date": None, "sprints_start_on": "9999-12-25"},
            id="past-the-end-of-the-calendar",
        ),
    ],
)
def test_a_first_sprint_after_the_latest_last_day_of_classes_is_refused(client, db, changes):
    res = _create(client, {**BODY, **changes})
    assert (res.status_code, res.json()["detail"]) == (422, START_TOO_LATE)
    assert db.executes == 0


def test_a_class_with_no_last_day_may_start_its_sprints_at_the_end_of_week_53(client, db):
    res = _create(client, {**_without("end_date"), "sprints_start_on": "2027-09-26"})
    assert res.status_code == 200, res.text
    [row] = db.rows("classes")
    assert _schedule(row) == (5, "biweekly", "2027-09-26")


def test_the_requests_offer_exactly_the_frequencies_the_schedule_knows():
    assert set(get_args(SprintFrequency)) == set(FREQUENCIES)


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
    ("failure", "level"),
    [
        # A refusal or a database failure is logged as a warning ...
        pytest.param(
            HTTPException(status_code=409, detail="refused"), logging.WARNING, id="refused"
        ),
        pytest.param(
            DatabaseUnavailableError(operation="write", target="sprints"),
            logging.WARNING,
            id="outage",
        ),
        # ... and anything else is a bug, logged as an error with its traceback, so that Sentry
        # records an event instead of a breadcrumb.
        pytest.param(RuntimeError("a bug"), logging.ERROR, id="bug"),
    ],
)
def test_a_team_whose_sprints_cannot_be_made_is_created_without_them(
    client, teams, monkeypatch, caplog, failure, level
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
    [record] = [r for r in caplog.records if r.name == "app.projects.controller"]
    assert record.levelno == level
    # Ids only: never the team's name (AGENTS.md, Sentry).
    assert record.getMessage() == (
        f"projects: sprint creation failed | project_id={team['id']} class_id={SCHEDULED}"
    )
    assert record.exc_info[1] is failure


# ------------------------------------------------------------ changing the schedule

#: INSTR's class whose schedule the changes below set: first week of term Mon Sep 21, 2026, last day
#: of classes Fri Dec 4, and no schedule yet, so its teams were made without sprints.
TERM = "30000000-0000-0000-0000-000000000007"
OTHER_TERM = "30000000-0000-0000-0000-000000000008"
#: TERM's two teams, stored out of name order and with ids in the opposite order to their names: a
#: check that names "the first team" by row or by id names the wrong one.
BRAVO = "40000000-0000-0000-0000-00000000000a"
ALPHA = "40000000-0000-0000-0000-00000000000b"
TEAMS = (ALPHA, BRAVO)
#: A team in OTHER_TERM, first by name, with a story in its Sprint 5: no change to TERM reads it.
ELSEWHERE = "40000000-0000-0000-0000-00000000000c"
ELSEWHERE_SPRINT = {
    "id": "elsewhere-5",
    "project_id": ELSEWHERE,
    "sequence": 5,
    "name": "Sprint 5",
    "starts_at": "2026-10-19",
    "ends_at": "2026-10-25",
    "status": "planned",
}
#: Made through ``POST /api/projects/{id}/scrum/sprints`` before schedules: no sequence, so no
#: schedule change touches it.
LEGACY_SPRINT = {
    "id": "alpha-legacy",
    "project_id": ALPHA,
    "sequence": None,
    "name": "Kickoff",
    "starts_at": "2026-09-14",
    "ends_at": "2026-09-20",
    "status": "completed",
}

FOUR_WEEKLY = {"sprint_count": 4, "sprint_frequency": "weekly", "sprints_start_on": "2026-09-28"}
#: ``(sequence, name, starts_at, ends_at)`` of FOUR_WEEKLY's sprints.
FOUR_WEEKLY_SPRINTS = [
    (1, "Sprint 1", "2026-09-28", "2026-10-04"),
    (2, "Sprint 2", "2026-10-05", "2026-10-11"),
    (3, "Sprint 3", "2026-10-12", "2026-10-18"),
    (4, "Sprint 4", "2026-10-19", "2026-10-25"),
]
#: The schedule some tests give TERM first: six weekly sprints a week earlier, ending Sun Nov 1.
SIX_WEEKLY = {"sprint_count": 6, "sprint_frequency": "weekly", "sprints_start_on": "2026-09-21"}
SIX_WEEKLY_SPRINTS = [
    (1, "Sprint 1", "2026-09-21", "2026-09-27"),
    (2, "Sprint 2", "2026-09-28", "2026-10-04"),
    (3, "Sprint 3", "2026-10-05", "2026-10-11"),
    (4, "Sprint 4", "2026-10-12", "2026-10-18"),
    (5, "Sprint 5", "2026-10-19", "2026-10-25"),
    (6, "Sprint 6", "2026-10-26", "2026-11-01"),
]
#: Round trips before anything is written: the owner check (the class's dates) beside the class's
#: teams, then the teams' sprints beyond the new count with their stories.
CHECKS = ["classes:select", "projects:select", "sprints:select"]


@pytest.fixture
def term(monkeypatch):
    """TERM with its two teams, neither with a numbered sprint; ELSEWHERE in OTHER_TERM."""
    fake = FakeSupabase(
        relations={("sprints", "user_stories"): ("id", "sprint_id", True)},
        classes=[
            {
                "id": TERM,
                "created_by": INSTR,
                "name": "CSE 115A",
                "term": "Fall",
                "start_date": "2026-09-21",
                "end_date": "2026-12-04",
                "sprint_count": None,
                "sprint_frequency": None,
                "sprints_start_on": None,
            },
            {"id": OTHER_TERM, "created_by": INSTR, "name": "CSE 115B", **SIX_WEEKLY},
        ],
        projects=[
            {"id": BRAVO, "class_id": TERM, "name": "Bravo"},
            {"id": ALPHA, "class_id": TERM, "name": "Alpha"},
            {"id": ELSEWHERE, "class_id": OTHER_TERM, "name": "Aardvark"},
        ],
        sprints=[dict(LEGACY_SPRINT), dict(ELSEWHERE_SPRINT)],
        user_stories=[
            {"id": "elsewhere-story", "project_id": ELSEWHERE, "sprint_id": "elsewhere-5"}
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _change(client: TestClient, body: dict, who: str = INSTR, class_id: str = TERM):
    """``PATCH /api/classes/{class_id}/sprints`` as ``who``."""
    return client.patch(
        f"/api/classes/{class_id}/sprints",
        headers={"Authorization": f"Bearer {make_token(sub=who)}"},
        json=body,
    )


def _term(db) -> dict:
    return next(row for row in db.rows("classes") if row["id"] == TERM)


def _numbered(db, team: str) -> list[tuple]:
    """``(sequence, name, starts_at, ends_at)`` of a team's sprints that have a sequence."""
    return sorted(
        (s["sequence"], s["name"], s["starts_at"], s["ends_at"])
        for s in db.rows("sprints")
        if s["project_id"] == team and s.get("sequence") is not None
    )


def _running(db, schedule: dict, sprints: list[tuple]) -> None:
    """TERM runs ``schedule``, and each of its teams has its ``sprints``, ids ``<team>-<k>``."""
    _term(db).update(schedule)
    db.rows("sprints").extend(
        {
            "id": f"{team}-{k}",
            "project_id": team,
            "sequence": k,
            "name": name,
            "starts_at": starts_at,
            "ends_at": ends_at,
            "status": "planned",
        }
        for team in TEAMS
        for k, name, starts_at, ends_at in sprints
    )


def _story(db, team: str, k: int, *, archived: bool = False) -> None:
    """A story in the team's Sprint k (by ``_running``'s ids)."""
    db.rows("user_stories").append(
        {
            "id": f"story-{team}-{k}",
            "project_id": team,
            "sprint_id": f"{team}-{k}",
            "archived_at": "2026-10-01T00:00:00+00:00" if archived else None,
        }
    )


def _writes(db) -> list[str]:
    return sorted(trip for trip in _trace(db) if not trip.endswith(":select"))


def test_the_instructor_sets_the_schedule_and_every_team_gets_its_sprints(client, term):
    res = _change(client, FOUR_WEEKLY)
    assert res.status_code == 200, res.text
    assert _schedule(_term(term)) == (4, "weekly", "2026-09-28")
    # The class row and what changed, with no "message" (STYLE_GUIDE.md, Response Format).
    assert res.json() == {
        "class": _term(term),
        "teams": 2,
        "created": 8,
        "updated": 0,
        "deleted": 0,
    }
    for team in TEAMS:
        assert _numbered(term, team) == FOUR_WEEKLY_SPRINTS
    # The sprint made before schedules, and the other class's team, as they were.
    assert LEGACY_SPRINT in term.rows("sprints")
    assert ELSEWHERE_SPRINT in term.rows("sprints")
    # The checks, the class, then per team its numbered sprints (none yet) and one insert.
    assert sorted(_trace(term)) == sorted(
        [*CHECKS, "classes:update", *["sprints:select", "sprints:insert"] * 2]
    )


def test_teams_made_before_the_schedule_get_it_and_the_same_schedule_again_writes_no_sprint(
    client, term
):
    # Both teams were made before the class had a schedule: the first change makes all their sprints.
    assert _change(client, FOUR_WEEKLY).json()["created"] == 8
    sprints = [dict(s) for s in term.rows("sprints")]
    term.reset_counter()

    res = _change(client, FOUR_WEEKLY)
    assert res.status_code == 200, res.text
    assert res.json() == {
        "class": _term(term),
        "teams": 2,
        "created": 0,
        "updated": 0,
        "deleted": 0,
    }
    assert term.rows("sprints") == sprints
    # Each team costs one read; the class row is the only write.
    assert _writes(term) == ["classes:update"]
    assert term.executes == len(CHECKS) + 1 + 2, _trace(term)


def test_a_changed_schedule_rewrites_the_sprints_in_place_and_deletes_the_empty_extras(
    client, term
):
    _running(term, SIX_WEEKLY, SIX_WEEKLY_SPRINTS)
    _story(term, ALPHA, 2)
    res = _change(client, FOUR_WEEKLY)
    assert res.status_code == 200, res.text
    # Sprints 1-4 move a week later in both teams; their Sprints 5 and 6 hold no story.
    assert res.json() == {
        "class": _term(term),
        "teams": 2,
        "created": 0,
        "updated": 8,
        "deleted": 4,
    }
    for team in TEAMS:
        assert _numbered(term, team) == FOUR_WEEKLY_SPRINTS
        # The same rows, rewritten.
        ids = {s["id"] for s in term.rows("sprints") if s["project_id"] == team}
        assert ids - {LEGACY_SPRINT["id"]} == {f"{team}-{k}" for k in range(1, 5)}
    [story] = [s for s in term.rows("user_stories") if s["project_id"] == ALPHA]
    assert story["sprint_id"] == f"{ALPHA}-2"
    assert LEGACY_SPRINT in term.rows("sprints")
    # Per team: its numbered sprints, one delete and one upsert.
    assert sorted(_trace(term)) == sorted(
        [*CHECKS, "classes:update", *["sprints:select", "sprints:delete", "sprints:upsert"] * 2]
    )


IN_USE = (
    "{team} already uses Sprint {k}; lower the count after they move their stories or delete "
    "that plan"
)


@pytest.mark.parametrize(
    ("stories", "detail"),
    [
        pytest.param(
            [(BRAVO, 5, False)], IN_USE.format(team="Bravo", k=5), id="a-story-in-sprint-5"
        ),
        pytest.param(
            [(BRAVO, 6, False), (BRAVO, 5, False)],
            IN_USE.format(team="Bravo", k=5),
            id="its-lowest-such-sprint",
        ),
        pytest.param(
            [(BRAVO, 5, False), (ALPHA, 6, False)],
            IN_USE.format(team="Alpha", k=6),
            id="the-first-such-team-by-name",
        ),
        pytest.param(
            [(BRAVO, 6, True)], IN_USE.format(team="Bravo", k=6), id="an-archived-story-counts"
        ),
    ],
)
def test_a_story_in_a_sprint_the_change_would_delete_refuses_it_before_anything_is_written(
    client, term, stories, detail
):
    _running(term, SIX_WEEKLY, SIX_WEEKLY_SPRINTS)
    for team, k, archived in stories:
        _story(term, team, k, archived=archived)
    classes_before = [dict(c) for c in term.rows("classes")]
    sprints_before = [dict(s) for s in term.rows("sprints")]

    res = _change(client, FOUR_WEEKLY)
    assert (res.status_code, res.json()["detail"]) == (409, detail)
    assert term.rows("classes") == classes_before
    assert term.rows("sprints") == sprints_before
    assert sorted(_trace(term)) == CHECKS


@pytest.mark.parametrize(
    ("changes", "detail"),
    [
        pytest.param(
            {"sprints_start_on": "2026-09-14"},
            "The first sprint starts before the class does",
            id="a-week-before-the-first-week",
        ),
        pytest.param(
            {"sprint_count": 11},  # Sprint 11 would end Sun Dec 13, a week past Sun Dec 6
            "The sprints run past the last day of classes (Dec 4, 2026)",
            id="past-the-sunday-after-the-last-day",
        ),
        pytest.param({"sprints_start_on": "9999-12-25"}, START_TOO_LATE, id="far-future"),
    ],
)
def test_a_change_that_does_not_fit_the_class_is_refused_before_anything_is_written(
    client, term, changes, detail
):
    res = _change(client, {**FOUR_WEEKLY, **changes})
    assert (res.status_code, res.json()["detail"]) == (422, detail)
    assert _schedule(_term(term)) == (None, None, None)
    # The owner check (with the class's dates) beside the teams, nothing more.
    assert sorted(_trace(term)) == ["classes:select", "projects:select"]


def test_a_change_may_end_on_the_sunday_after_the_last_day(client, term):
    # TERM's last day of classes is Fri Dec 4; ten weekly sprints from Mon Sep 28 end on Sun Dec 6.
    res = _change(client, {**FOUR_WEEKLY, "sprint_count": 10})
    assert res.status_code == 200, res.text
    assert _schedule(_term(term)) == (10, "weekly", "2026-09-28")
    for team in TEAMS:
        assert _numbered(term, team)[-1] == (10, "Sprint 10", "2026-11-30", "2026-12-06")


def test_a_class_with_no_dates_refuses_a_first_day_past_the_end_of_the_calendar(client, term):
    # No first week of term to count a year from, and no last day: the calendar still ends.
    _term(term).update(start_date=None, end_date=None)
    res = _change(client, {**FOUR_WEEKLY, "sprints_start_on": "9999-12-25"})
    assert (res.status_code, res.json()["detail"]) == (422, START_TOO_LATE)
    assert _writes(term) == []


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({**FOUR_WEEKLY, "sprint_count": 0}, id="no-sprints"),
        pytest.param({**FOUR_WEEKLY, "sprint_count": 21}, id="over-twenty"),
        pytest.param({**FOUR_WEEKLY, "sprint_frequency": "daily"}, id="unknown-frequency"),
        pytest.param({**FOUR_WEEKLY, "sprints_start_on": None}, id="null-first-day"),
        pytest.param(
            {k: v for k, v in FOUR_WEEKLY.items() if k != "sprints_start_on"}, id="no-first-day"
        ),
    ],
)
def test_a_change_names_all_three_values(client, term, body):
    res = _change(client, body)
    assert res.status_code == 422, res.text
    assert term.executes == 0


def test_only_the_class_instructor_changes_the_schedule(client, term):
    res = _change(client, FOUR_WEEKLY, who=STUDENT)
    assert (res.status_code, res.json()["detail"]) == (403, "Only the class instructor can do this")
    assert _writes(term) == []


def test_a_class_with_no_teams_takes_a_schedule_in_three_round_trips(client, term):
    term.rows("projects")[:] = [p for p in term.rows("projects") if p["class_id"] != TERM]
    res = _change(client, FOUR_WEEKLY)
    assert res.status_code == 200, res.text
    assert res.json() == {
        "class": _term(term),
        "teams": 0,
        "created": 0,
        "updated": 0,
        "deleted": 0,
    }
    assert sorted(_trace(term)) == ["classes:select", "classes:update", "projects:select"]


@pytest.mark.parametrize(
    ("failure", "status", "detail"),
    [
        pytest.param(
            DatabaseUnavailableError(operation="write", target="sprints"),
            503,
            None,
            id="outage",
        ),
        pytest.param(RuntimeError("a bug"), 500, "Failed to update the sprint schedule", id="bug"),
    ],
)
def test_a_team_whose_sprints_fail_to_follow_fails_the_change_and_sending_it_again_finishes_it(
    client, term, monkeypatch, caplog, failure, status, detail
):
    follow = classes.ensure_project_sprints

    def fail_for_bravo(db, *, project_id, project_name, schedule):
        if project_id == BRAVO:
            raise failure
        return follow(db, project_id=project_id, project_name=project_name, schedule=schedule)

    monkeypatch.setattr(classes, "ensure_project_sprints", fail_for_bravo)
    with caplog.at_level(logging.ERROR, logger="app.classes.controller"):
        res = _change(client, FOUR_WEEKLY)
    assert res.status_code == status, res.text
    if detail is not None:
        assert res.json()["detail"] == detail
        # Ids only: never a team's name (AGENTS.md, Sentry).
        [error] = [r for r in caplog.records if r.name == "app.classes.controller"]
        assert error.getMessage() == f"Error updating class sprint schedule | class_id={TERM}"
    # The class row went first, so it holds the new schedule; Alpha's sprints follow it.
    assert _schedule(_term(term)) == (4, "weekly", "2026-09-28")
    assert _numbered(term, ALPHA) == FOUR_WEEKLY_SPRINTS
    assert _numbered(term, BRAVO) == []

    monkeypatch.setattr(classes, "ensure_project_sprints", follow)
    res = _change(client, FOUR_WEEKLY)
    assert res.status_code == 200, res.text
    assert res.json() == {
        "class": _term(term),
        "teams": 2,
        "created": 4,
        "updated": 0,
        "deleted": 0,
    }
    assert _numbered(term, BRAVO) == FOUR_WEEKLY_SPRINTS


def test_a_class_with_no_last_day_takes_a_schedule_then_refuses_a_last_day_a_week_before_it_ends(
    client, term
):
    _term(term)["end_date"] = None
    assert _change(client, FOUR_WEEKLY).status_code == 200

    def set_last_day(day: str):
        return client.patch(
            f"/api/classes/{TERM}/end-date",
            headers={"Authorization": f"Bearer {make_token(sub=INSTR)}"},
            json={"end_date": day},
        )

    # Sprint 4 ends on Sun Oct 25: a last day must be in that week (from Mon Oct 19) or later.
    res = set_last_day("2026-10-18")
    assert (res.status_code, res.json()["detail"]) == (
        409,
        "Sprint 4 ends Oct 25, 2026; change the sprint schedule first",
    )
    assert _term(term)["end_date"] is None
    res = set_last_day("2026-10-19")
    assert res.status_code == 200, res.text
    # The class row itself, not {"message": ..., "class": ...} (STYLE_GUIDE.md, Response Format).
    assert res.json() == _term(term)
    assert _term(term)["end_date"] == "2026-10-19"
