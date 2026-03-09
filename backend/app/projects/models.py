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
    # Sponsor information (teacher-created projects)
    sponsor_name: Optional[str] = None
    sponsor_company: Optional[str] = None
    sponsor_email: Optional[str] = None
    sponsor_website: Optional[str] = None
    sponsor_description: Optional[str] = None


class UpdateProjectRequest(BaseModel):
    """Request model for updating a project. All fields are optional."""
    team_size: Optional[int] = None
    description: Optional[str] = None
    # Sponsor information
    sponsor_name: Optional[str] = None
    sponsor_company: Optional[str] = None
    sponsor_email: Optional[str] = None
    sponsor_website: Optional[str] = None
    sponsor_description: Optional[str] = None


class JoinProjectRequest(BaseModel):
    """Request model for requesting to join a project"""
    project_id: UUID


class AcceptJoinRequestRequest(BaseModel):
    """Request model for accepting a join request"""
    request_id: UUID
    user_id: UUID

class ManageProjectMemberRequest(BaseModel):
    """Request model for adding a member to a project (instructor only)."""
    user_id: UUID
    role: Optional[str] = "member"


class AssignRoleRequest(BaseModel):
    """Request model for assigning product owner or scrum master to a project member."""
    user_id: UUID

