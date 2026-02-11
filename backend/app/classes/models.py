"""
Class management request models
"""
from pydantic import BaseModel


class CreateClassRequest(BaseModel):
    """Request model for creating a new class"""
    name: str
    description: str = None


class InviteStudentRequest(BaseModel):
    """Request model for inviting a student to a class"""
    student_email: str


class JoinClassRequest(BaseModel):
    """Request model for joining a class with a course code"""
    course_code: str
