"""
Assignment request/response models
"""
from typing import List, Literal, Optional
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
    assignment_type: Optional[Literal["tsr", "interest_form", "feedback"]] = None


class UpdateAssignmentRequest(BaseModel):
    """Request model for editing an existing assignment. All fields optional."""
    title: Optional[str] = None
    open_date: Optional[datetime.date] = None
    close_date: Optional[datetime.date] = None
    status: Optional[Literal["draft", "publish"]] = None
    assignment_type: Optional[Literal["tsr", "interest_form", "feedback"]] = None


class UpdateTSREntryRequest(BaseModel):
    """Request model for updating the editable fields of a TSR linked to an assignment."""
    percent_contribution: Optional[int] = None
    positive_feedback: Optional[str] = None
    constructive_feedback: Optional[str] = None
    scrum_master_tickets: Optional[str] = None
    scrum_master_assessment: Optional[str] = None
    scrum_master_notes: Optional[str] = None


class SubmitFeedbackRequest(BaseModel):
    """Request model for submitting (or updating) a student's feedback response."""
    q1_liked: str
    q2_frustrating: str
    q3_missing_feature: str
    q4_bugs: str
    q5_suggestions: str
