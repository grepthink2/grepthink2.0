"""The board's stories for a document's story pickers: every live story of the team's board in board
order, each with its sprint, its criteria and whether it is completed. Read by members and staff as the
board is; anyone else gets the board's 403 (test_documents_authz.py). Nothing is written and no event is
recorded."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core import authz
from app.documents import controller
from tests.conftest import header_for
from tests.documents_support import (
    AFTER_SPRINT_2,
    INSTR,
    MEETING_TA,
    MEMBER,
    OTHER_PID,
    PID,
    S1,
    S2,
    ST1,
    ST2,
    ST3,
    ST4,
    ST5,
    STUDENT,
    TA,
    UID,
    board_tables,
    documents_db,
    pin_today,
    story,
    writes,
)

#: A legacy archived story that still names Sprint 1: the board lists it in its backlog.
ARCHIVED = "5c000000-0000-4000-8000-0000000000aa"


@pytest.fixture
def db(monkeypatch):
    pin_today(monkeypatch, AFTER_SPRINT_2)
    tables = board_tables()
    tables["user_stories"].append(story(ARCHIVED, "US-9", S1, archived=True, criteria=("Old",)))
    fake = documents_db(monkeypatch, **tables)
    fake.reset_counter()
    return fake


def refused(call) -> tuple[int, str]:
    with pytest.raises(HTTPException) as e:
        call()
    return e.value.status_code, e.value.detail


def test_every_live_story_in_board_order_with_its_sprint_criteria_and_completion(db):
    stories = controller.list_project_stories(PID, UID)["stories"]

    assert stories == [
        {
            "id": ST1,
            "key": "US-1",
            "title": "Story US-1",
            "acceptance_criteria": ["Finds a trail by name"],
            "sprint_id": S1,
            "sprint_name": "Sprint 1",
            "completed": True,
        },
        {
            "id": ST2,
            "key": "US-2",
            "title": "Story US-2",
            "acceptance_criteria": [],
            "sprint_id": S1,
            "sprint_name": "Sprint 1",
            "completed": False,  # one task left
        },
        {
            "id": ST3,
            "key": "US-3",
            "title": "Story US-3",
            "acceptance_criteria": ["Saves a trail", "Lists saved trails"],
            "sprint_id": S2,
            "sprint_name": "Sprint 2",
            "completed": True,
        },
        {
            "id": ST4,
            "key": "US-4",
            "title": "Story US-4",
            "acceptance_criteria": [],
            "sprint_id": S2,
            "sprint_name": "Sprint 2",
            "completed": False,  # no task at all
        },
        {
            "id": ST5,
            "key": "US-5",
            "title": "Story US-5",
            "acceptance_criteria": ["Works offline"],
            "sprint_id": None,
            "sprint_name": None,
            "completed": False,
        },
    ]


def test_a_legacy_archived_story_and_another_teams_stories_are_left_out(db):
    ids = [s["id"] for s in controller.list_project_stories(PID, UID)["stories"]]
    assert ARCHIVED not in ids
    assert ids == [ST1, ST2, ST3, ST4, ST5]


def test_the_order_follows_the_teams_ranks(db):
    for row in db.rows("user_stories"):
        if row["id"] == ST2:
            row["rank"] = 0  # ahead of US-1 in Sprint 1
    ids = [s["id"] for s in controller.list_project_stories(PID, UID)["stories"]]
    assert ids[:2] == [ST2, ST1]


@pytest.mark.parametrize("user", [UID, MEMBER, INSTR, TA, MEETING_TA])
def test_members_and_staff_read_it_and_nothing_is_written(db, user):
    assert len(controller.list_project_stories(PID, user)["stories"]) == 5
    assert writes(db) == []
    assert db.rows("events") == []


def test_another_projects_id_answers_for_that_project_alone(db):
    """A member of this team asking for the other team's stories is a stranger there; that team's own
    member reads that team's stories only."""
    assert refused(lambda: controller.list_project_stories(OTHER_PID, UID)) == (
        403,
        authz.NOT_PROJECT_MEMBER,
    )
    assert [s["key"] for s in controller.list_project_stories(OTHER_PID, STUDENT)["stories"]] == [
        "US-1"
    ]


def test_its_round_trips(db):
    controller.list_project_stories(PID, UID)
    # The membership; then the sprints, the stories and the tasks together.
    assert db.executes <= 4
    db.reset_counter()
    controller.list_project_stories(PID, INSTR)
    # The instructor: the membership and the project with its class; then the three reads.
    assert db.executes <= 5
    db.reset_counter()
    controller.list_project_stories(PID, TA)
    # A class TA: their enrollment too.
    assert db.executes <= 6


def test_the_route_answers_through_http(db, client):
    response = client.get(
        f"/api/projects/{PID}/documents/stories", headers=header_for("t@ucsc.edu", sub=UID)
    )
    assert response.status_code == 200
    body = response.json()
    assert [s["key"] for s in body["stories"]] == ["US-1", "US-2", "US-3", "US-4", "US-5"]
    assert body["stories"][4] == {
        "id": ST5,
        "key": "US-5",
        "title": "Story US-5",
        "acceptance_criteria": ["Works offline"],
        "sprint_id": None,
        "sprint_name": None,
        "completed": False,
    }
