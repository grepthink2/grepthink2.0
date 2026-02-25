"""
Project management request models
"""
from typing import List, Optional
from pydantic import BaseModel
from uuid import UUID


class CreateProjectRequest(BaseModel):
    """Request model for creating a new project"""
    class_id: UUID
    name: str
    description: str = None
    team_size: int
    looking_for_roles: Optional[List[str]] = None
    skills: Optional[List[str]] = None


class UpdateProjectRequest(BaseModel):
    """Request model for updating a project (e.g. team_size)"""
    team_size: int


class JoinProjectRequest(BaseModel):
    """Request model for requesting to join a project"""
    project_id: UUID


class AcceptJoinRequestRequest(BaseModel):
    """Request model for accepting a join request"""
    request_id: UUID
    user_id: UUID

class CreateTSRRequest(BaseModel):
    """Request model for submitting a TSR.

    evaluator_id is derived from the auth token; project_id comes from the URL.
    scrum_master_notes is optional.
    week is a 1-based sprint/week number used to group TSRs over time.
    """
    evaluatee_id: UUID
    week: int
    percent_contribution: int
    positive_feedback: str
    constructive_feedback: str
    scrum_master_notes: Optional[str] = None