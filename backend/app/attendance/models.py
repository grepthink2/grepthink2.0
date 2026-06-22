"""
TA Management request models — class-TA designation, project-TA assignment,
project meeting/Zoom metadata, and per-week attendance.
"""
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel


class SetClassTARequest(BaseModel):
    """Designate (is_ta=True) or undesignate (is_ta=False) an enrolled student
    as a TA for the class. Instructor only."""
    user_id: UUID
    is_ta: bool = True


class AssignProjectTARequest(BaseModel):
    """Assign a class TA to a project, or clear the assignment with ta_id=None.
    Instructor only."""
    ta_id: Optional[UUID] = None


class UpsertAttendanceRequest(BaseModel):
    """Mark one person present/late/absent for a (project, week)."""
    person_id: UUID
    week_number: int
    status: Literal["present", "late", "absent"]


class MarkAllPresentRequest(BaseModel):
    """Mark every team member present for a (project, week)."""
    week_number: int


class UpdateProjectMeetingRequest(BaseModel):
    """Update a project's Zoom link / recurring meeting slot.

    Any field left as ``None`` is unchanged. Send an empty string to clear a
    field (e.g. ``zoom_url=""`` removes the link).
    """
    zoom_url: Optional[str] = None
    meeting_day: Optional[str] = None
    meeting_time: Optional[str] = None
