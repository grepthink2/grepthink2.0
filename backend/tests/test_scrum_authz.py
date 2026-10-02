"""Authorization matrix for the scrum board: member, staff, and everyone else.

404 only when the project does not exist; 403 when it exists and the caller has no
relationship to it (app/core/authz.py). Staff read and comment but never write.
"""

import pytest
from fastapi import HTTPException

from app.core import authz
from app.core.db import get_client
from app.scrum import controller
from tests.scrum_support import (
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


def _access(user_id, project_id=PID):
    return controller._board_access(get_client(), project_id=project_id, user_id=user_id)


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
