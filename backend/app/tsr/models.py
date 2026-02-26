"""
TSR request models
"""
from typing import Optional
from pydantic import BaseModel
from uuid import UUID


class CreateTSRRequest(BaseModel):
    """
    Request model for submitting a TSR.

    evaluator_id is derived from the auth token.
    project_id and week identify which project/sprint this belongs to.
    assignment_id optionally links this TSR to a specific TSR-type assignment.
    scrum_master_notes is optional.
    """
    evaluatee_id: UUID
    project_id: UUID
    week: int
    percent_contribution: int
    positive_feedback: str
    constructive_feedback: str
    scrum_master_notes: Optional[str] = None
    assignment_id: Optional[UUID] = None
