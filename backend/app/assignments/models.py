"""
Assignment request/response models
"""

import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CreateAssignmentRequest(BaseModel):
    """Request model for creating a new assignment (class instructor only)."""

    class_id: UUID
    title: str
    open_date: datetime.date
    close_date: datetime.date
    status: Literal["draft", "publish"] = "draft"
    assignment_type: Literal["tsr", "interest_form", "feedback"] | None = None


class UpdateAssignmentRequest(BaseModel):
    """Request model for editing an existing assignment. All fields optional.

    ``accept_until`` opens a late-submission window after the deadline (must be after ``due_at``);
    ``clear_accept_until`` closes it again. Once the deadline has passed, ``close_date`` can no
    longer be moved (400): the original deadline is kept and late work shows as late.
    """

    title: str | None = None
    open_date: datetime.date | None = None
    close_date: datetime.date | None = None
    status: Literal["draft", "publish"] | None = None
    assignment_type: Literal["tsr", "interest_form", "feedback"] | None = None
    accept_until: datetime.datetime | None = None
    clear_accept_until: bool = False


class UpdateTSREntryRequest(BaseModel):
    """Request model for updating the editable fields of a TSR linked to an assignment."""

    percent_contribution: int | None = None
    positive_feedback: str | None = None
    constructive_feedback: str | None = None
    scrum_master_tickets: str | None = None
    scrum_master_assessment: str | None = None
    scrum_master_notes: str | None = None


class SubmitFeedbackRequest(BaseModel):
    """Request model for submitting (or updating) a student's feedback response."""

    q1_liked: str
    q2_frustrating: str
    q3_missing_feature: str
    q4_bugs: str
    q5_suggestions: str
