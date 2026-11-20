"""Authorization matrix for the scrum board: member, staff, and everyone else.

404 only when the project does not exist; 403 when it exists and the caller has no
relationship to it (app/core/authz.py). Staff read and comment but never write, through
the board's own routes or the connector's fill. A refused call writes nothing.
"""

import pytest
from fastapi import HTTPException

from app.core import authz
from app.core.db import get_client
from app.mcp import controller as mcp
from app.mcp.models import FillBoardRequest
from app.scrum import controller
from tests.conftest import ISTINYE_INSTITUTION, header_for
from tests.scrum_support import (
    CLASS,
    INSTR,
    MEETING_TA,
    OUTSIDER,
    PID,
    STUDENT,
    TA,
    UID,
    scrum_db,
)

MISSING_PID = "00000000-0000-0000-0000-00000000dead"
SCHOOL = ISTINYE_INSTITUTION["id"]
# A board's writes include its RPCs (story keys, the connector's fill).
WRITES = {"insert", "update", "upsert", "delete", "rpc"}
REPO = {
    "id": "r1",
    "project_id": PID,
    "repo_url": "https://github.com/ucsc/grepthink2.0",
    "provider": "github",
    "access_token": "secret",
}
STORY = {"id": "st1", "project_id": PID, "key": "US-3", "title": "Search", "sprint_id": None}


def _writes(db) -> list[dict]:
    return [q for q in db.queries if q["op"] in WRITES]


def _access(user_id, project_id=PID):
    access, _school = controller._board_access(get_client(), project_id=project_id, user_id=user_id)
    return access


def test_member_is_member_in_one_round_trip(monkeypatch):
    db = scrum_db(monkeypatch)
    assert _access(UID) == "member"
    assert db.executes == 1


def test_member_with_a_null_role_is_still_a_member(monkeypatch):
    """project_members.role is nullable: the membership row, not its role, decides."""
    scrum_db(
        monkeypatch,
        project_members=[{"id": "pm-1", "project_id": PID, "user_id": UID, "role": None}],
    )
    assert _access(UID) == "member"


@pytest.mark.parametrize("staff", [INSTR, TA, MEETING_TA])
def test_instructor_class_ta_and_meeting_ta_are_staff(monkeypatch, staff):
    scrum_db(monkeypatch)
    assert _access(staff) == "staff"


@pytest.mark.parametrize("stranger", [STUDENT, OUTSIDER])
def test_anyone_else_gets_403_for_an_existing_project(monkeypatch, stranger):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        _access(stranger)
    assert (e.value.status_code, e.value.detail) == (403, authz.NOT_PROJECT_MEMBER)


def test_missing_project_is_404(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        _access(OUTSIDER, project_id=MISSING_PID)
    assert (e.value.status_code, e.value.detail) == (404, authz.PROJECT_NOT_FOUND)


@pytest.mark.parametrize("staff", [INSTR, TA, MEETING_TA])
def test_staff_cannot_write(monkeypatch, staff):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller._require_writer(get_client(), project_id=PID, user_id=staff)
    assert (e.value.status_code, e.value.detail) == (403, controller.MEMBERS_ONLY)


def test_member_can_write(monkeypatch):
    scrum_db(monkeypatch)
    controller._require_writer(get_client(), project_id=PID, user_id=UID)  # no raise


def _class_at(institution_id):
    return [{"id": CLASS, "created_by": INSTR, "institution_id": institution_id}]


@pytest.mark.parametrize(("caller", "access"), [(UID, "member"), (INSTR, "staff")])
def test_access_names_the_projects_school(monkeypatch, caller, access):
    """The day-bound parts of the board (burnup, AI quota) need the school's zone: it comes
    with the check every endpoint makes, so no endpoint reads the class for it."""
    scrum_db(monkeypatch, classes=_class_at(SCHOOL))
    got = controller._board_access(get_client(), project_id=PID, user_id=caller)
    assert got == (access, SCHOOL)


def test_a_members_access_still_costs_one_round_trip_with_the_school(monkeypatch):
    db = scrum_db(monkeypatch, classes=_class_at(SCHOOL))
    controller._board_access(get_client(), project_id=PID, user_id=UID)
    assert db.executes == 1


def test_a_class_with_no_school_has_no_institution(monkeypatch):
    scrum_db(monkeypatch, classes=_class_at(None))
    got = controller._board_access(get_client(), project_id=PID, user_id=UID)
    assert got == ("member", None)


def test_a_writer_check_answers_the_school(monkeypatch):
    scrum_db(monkeypatch, classes=_class_at(SCHOOL))
    assert controller._require_writer(get_client(), project_id=PID, user_id=UID) == SCHOOL


@pytest.mark.parametrize("staff", [INSTR, TA, MEETING_TA])
def test_staff_cannot_delete_a_story(monkeypatch, staff):
    db = scrum_db(
        monkeypatch,
        user_stories=[{"id": "st1", "project_id": PID, "key": "US-1", "sprint_id": None}],
    )
    with pytest.raises(HTTPException) as e:
        controller.delete_story(story_id="st1", user_id=staff)
    assert (e.value.status_code, e.value.detail) == (403, controller.MEMBERS_ONLY)
    assert [s["id"] for s in db.rows("user_stories")] == ["st1"]


# The board's other writes, each as staff would make it.
STAFF_WRITES = {
    "create_story": lambda user: controller.create_story(
        project_id=PID, user_id=user, fields={"title": "x"}
    ),
    "update_settings": lambda user: controller.update_settings(
        project_id=PID, user_id=user, estimate_scale="linear"
    ),
    "add_repo": lambda user: controller.add_repo(
        project_id=PID, user_id=user, repo_url=REPO["repo_url"], access_token=None
    ),
    "delete_repo": lambda user: controller.delete_repo(repo_id="r1", user_id=user),
    "fill_board": lambda user: mcp.fill_board(
        project_id=PID,
        user_id=user,
        client_id="client-claude",
        request=FillBoardRequest(confirmed=True, stories=[{"title": "Sign in"}]),
    ),
}


@pytest.mark.parametrize("call", sorted(STAFF_WRITES))
@pytest.mark.parametrize("staff", [INSTR, TA, MEETING_TA])
def test_staff_make_none_of_the_boards_writes(monkeypatch, call, staff):
    db = scrum_db(monkeypatch, scrum_repos=[dict(REPO)])
    with pytest.raises(HTTPException) as e:
        STAFF_WRITES[call](staff)
    assert (e.value.status_code, e.value.detail) == (403, controller.MEMBERS_ONLY)
    assert _writes(db) == []  # the repo, the stories and the settings are as they were


# What staff may read or comment on, as someone with no tie to the team would ask for it.
STRANGER_CALLS = {
    "list_repos": lambda user: controller.list_repos(project_id=PID, user_id=user),
    "create_comment": lambda user: controller.create_comment(
        parent_kind="story", parent_id="st1", user_id=user, body_md="hi"
    ),
}


@pytest.mark.parametrize("call", sorted(STRANGER_CALLS))
@pytest.mark.parametrize("stranger", [STUDENT, OUTSIDER])
def test_anyone_else_reads_no_repos_and_posts_no_comments(monkeypatch, call, stranger):
    db = scrum_db(monkeypatch, scrum_repos=[dict(REPO)], user_stories=[dict(STORY)])
    with pytest.raises(HTTPException) as e:
        STRANGER_CALLS[call](stranger)
    assert (e.value.status_code, e.value.detail) == (403, authz.NOT_PROJECT_MEMBER)
    assert _writes(db) == []


@pytest.mark.parametrize("route", ["board", "summary"])
@pytest.mark.parametrize(
    ("user", "project_id", "status", "detail"),
    [
        (OUTSIDER, PID, 403, authz.NOT_PROJECT_MEMBER),
        (STUDENT, PID, 403, authz.NOT_PROJECT_MEMBER),
        (OUTSIDER, MISSING_PID, 404, authz.PROJECT_NOT_FOUND),
    ],
    ids=["outsider", "classmate", "missing-project"],
)
def test_the_board_and_the_summary_refuse_through_their_routes(
    monkeypatch, client, route, user, project_id, status, detail
):
    db = scrum_db(monkeypatch)
    res = client.get(
        f"/api/projects/{project_id}/scrum/{route}", headers=header_for("x@ucsc.edu", sub=user)
    )
    assert (res.status_code, res.json()["detail"]) == (status, detail)
    assert db.store["events"] == []  # a refused load records no view
    assert _writes(db) == []
