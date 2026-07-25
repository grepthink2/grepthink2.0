"""Teaching Assistant (TA) request models."""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel


class TaUserRequest(BaseModel):
    """Identify a class member to promote/demote as a TA."""
    user_id: UUID


class SetReviewWindowRequest(BaseModel):
    """Open or close a class's end-of-quarter review window."""
    open: bool


class SetReviewTaRequest(BaseModel):
    """Set a team's additional end-of-quarter reviewer.

    ``user_id`` is optional: a TA self-appoints by omitting it; an instructor
    supplies the TA to appoint (override).
    """
    user_id: Optional[UUID] = None


class SetReviewZoomRequest(BaseModel):
    """Set (null/blank clears) the class's shared final-review Zoom room."""
    zoom_url: Optional[str] = None


class FinalReviewScoreEntry(BaseModel):
    """One student's scores for a single scorer role.

    Home rows carry product/team/scrum; review/instructor rows carry overall.
    All scores are 1.0–5.0 and stored at 0.1 granularity (rounded).
    """
    student_id: UUID
    product: Optional[float] = None
    team: Optional[float] = None
    scrum: Optional[float] = None
    overall: Optional[float] = None
    notes: Optional[str] = None


class SaveFinalReviewScoresRequest(BaseModel):
    """Bulk-upsert one scorer role's rows for a team ('home'|'review'|'instructor')."""
    role: str
    scores: list[FinalReviewScoreEntry]


class SaveFinalReviewNotesRequest(BaseModel):
    """Replace the team's structured review-notes document (Review TA form)."""
    content: dict
    template_version: int = 1


class SetFinalReviewTimeRequest(BaseModel):
    """Set (null clears) a team's single final-review slot."""
    scheduled_at: Optional[datetime] = None
