"""
Class management request models
"""
import datetime
from typing import Literal, Optional
from pydantic import BaseModel

ClassStatus = Literal['active', 'complete']


class CreateClassRequest(BaseModel):
    """Request model for creating a new class"""
    name: str
    description: Optional[str] = None
    term: str
    start_date: datetime.date
    tsr_count: Optional[int] = None


class InviteStudentRequest(BaseModel):
    """Request model for inviting a student to a class"""
    student_email: str


class JoinClassRequest(BaseModel):
    """Request model for joining a class with a course code"""
    course_code: str


class UpdateClassStatusRequest(BaseModel):
    """Request model for updating a class lifecycle status (instructor only)."""
    status: ClassStatus


class BulkInviteRequest(BaseModel):
    """Request model for bulk-enrolling students by email list"""
    emails: list[str]


class QueueInviteRequest(BaseModel):
    """Request model for queuing a delayed invite batch"""
    emails: list[str]
    custom_subject: Optional[str] = None
    custom_body: Optional[str] = None


class QueueInviteResponse(BaseModel):
    """Response after queuing an invite batch"""
    job_id: str
    send_at: str  # ISO 8601


class CancelInviteResponse(BaseModel):
    """Response after cancelling a queued invite batch"""
    cancelled: bool
