"""
TSR request models
"""

from uuid import UUID

from pydantic import BaseModel


class CreateTSRRequest(BaseModel):
    """
    Request model for submitting a TSR.

    evaluator_id is derived from the auth token.
    project_id and week identify which project/sprint this belongs to.
    assignment_id optionally links this TSR to a specific TSR-type assignment.
    Scrum Master fields are optional and are only populated by the project's
    scrum master.
    """

    evaluatee_id: UUID
    project_id: UUID
    week: int
    percent_contribution: int
    positive_feedback: str
    constructive_feedback: str
    scrum_master_tickets: str | None = None
    scrum_master_assessment: str | None = None
    scrum_master_notes: str | None = None
    assignment_id: UUID | None = None
