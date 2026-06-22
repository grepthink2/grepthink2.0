"""
TA Management views — parameter handling and responses.
"""
from typing import Optional
from uuid import UUID

from fastapi import Depends, Query

from app.dependencies import require_user
from app.auth.controller import get_user_role
from app.attendance import controller
from app.attendance.models import (
    AssignProjectTARequest,
    MarkAllPresentRequest,
    SetClassTARequest,
    UpdateProjectMeetingRequest,
    UpsertAttendanceRequest,
)


# ---- Class TA designation ----

def set_class_ta(class_id: UUID, data: SetClassTARequest, user_id: str = Depends(require_user)):
    return controller.set_class_ta(class_id, user_id, str(data.user_id), data.is_ta)


def list_class_tas(class_id: UUID, user_id: str = Depends(require_user)):
    role = get_user_role(user_id)
    tas = controller.list_class_tas(class_id, user_id, role)
    return {"tas": tas}


# ---- Project TA assignment + meeting metadata ----

def assign_project_ta(project_id: UUID, data: AssignProjectTARequest, user_id: str = Depends(require_user)):
    ta_id = str(data.ta_id) if data.ta_id is not None else None
    return controller.assign_project_ta(project_id, user_id, ta_id)


def update_project_meeting(project_id: UUID, data: UpdateProjectMeetingRequest, user_id: str = Depends(require_user)):
    project = controller.update_project_meeting(
        project_id, user_id,
        zoom_url=data.zoom_url,
        meeting_day=data.meeting_day,
        meeting_time=data.meeting_time,
    )
    return {"message": "Meeting updated successfully", "project": project}


# ---- Schedule ----

def get_ta_schedule(
    class_id: UUID,
    week: Optional[int] = Query(None, description="Term week number (1..N)"),
    user_id: str = Depends(require_user),
):
    role = get_user_role(user_id)
    return controller.get_ta_schedule(class_id, user_id, role, week, scope="all")


def get_my_assigned_teams(
    class_id: UUID,
    week: Optional[int] = Query(None),
    user_id: str = Depends(require_user),
):
    role = get_user_role(user_id)
    return controller.get_ta_schedule(class_id, user_id, role, week, scope="mine")


def get_my_team_schedule(
    class_id: UUID,
    week: Optional[int] = Query(None),
    user_id: str = Depends(require_user),
):
    role = get_user_role(user_id)
    return controller.get_ta_schedule(class_id, user_id, role, week, scope="my-team")


# ---- Attendance ----

def get_team_attendance(
    project_id: UUID,
    week: int = Query(..., description="Term week number (1..N)"),
    user_id: str = Depends(require_user),
):
    return controller.get_team_attendance(project_id, user_id, week)


def upsert_attendance(project_id: UUID, data: UpsertAttendanceRequest, user_id: str = Depends(require_user)):
    record = controller.upsert_attendance(
        project_id, user_id, str(data.person_id), data.week_number, data.status,
    )
    return {"message": "Attendance marked", "record": record}


def mark_all_present(project_id: UUID, data: MarkAllPresentRequest, user_id: str = Depends(require_user)):
    records = controller.mark_all_present(project_id, user_id, data.week_number)
    return {"message": "All marked present", "records": records}
