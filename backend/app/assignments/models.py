"""
Assignment request/response models
"""
from typing import Literal, Optional
from pydantic import BaseModel
from uuid import UUID
import datetime


class CreateAssignmentRequest(BaseModel):
    """Request model for creating a new assignment (instructor only)."""
    class_id: UUID
    title: str
    open_date: datetime.date
    close_date: datetime.date
    status: Literal["draft", "publish"] = "draft"
    assignment_type: Optional[str] = None


class UpdateAssignmentRequest(BaseModel):
    """Request model for editing an existing assignment. All fields optional."""
    title: Optional[str] = None
    open_date: Optional[datetime.date] = None
    close_date: Optional[datetime.date] = None
    status: Optional[Literal["draft", "publish"]] = None
    assignment_type: Optional[str] = None
