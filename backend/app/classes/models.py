"""
Class management request models
"""
import datetime
from typing import Optional
from pydantic import BaseModel


class CreateClassRequest(BaseModel):
    """Request model for creating a new class"""
    name: str
    description: Optional[str] = None
    term: str
    start_date: datetime.date


class InviteStudentRequest(BaseModel):
    """Request model for inviting a student to a class"""
    student_email: str


class JoinClassRequest(BaseModel):
    """Request model for joining a class with a course code"""
    course_code: str


class BulkInviteRequest(BaseModel):
    """Request model for bulk-enrolling students by email list"""
    emails: list[str]
