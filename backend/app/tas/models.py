"""Teaching Assistant (TA) request models."""
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
