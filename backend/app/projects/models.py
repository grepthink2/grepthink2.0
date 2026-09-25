"""
Project management request models
"""

from uuid import UUID

from pydantic import BaseModel, Field


class CreateProjectRequest(BaseModel):
    """Request model for creating a new project"""

    class_id: UUID
    name: str
    description: str = None
    team_size: int
    looking_for_roles: list[str] | None = None
    skills: list[str] | None = None
    # Sponsor information (teacher-created projects)
    sponsor_name: str | None = None
    sponsor_company: str | None = None
    sponsor_email: str | None = None
    sponsor_website: str | None = None
    sponsor_description: str | None = None


class UpdateProjectRequest(BaseModel):
    """Request model for updating a project. All fields are optional."""

    name: str | None = None
    team_size: int | None = None
    description: str | None = None
    image_url: str | None = None
    # Sponsor information
    sponsor_name: str | None = None
    sponsor_company: str | None = None
    sponsor_email: str | None = None
    sponsor_website: str | None = None
    sponsor_description: str | None = None


class JoinProjectRequest(BaseModel):
    """Request model for requesting to join a project"""

    project_id: UUID
    message: str | None = Field(default=None, max_length=500)


class AcceptJoinRequestRequest(BaseModel):
    """Request model for accepting a join request"""

    request_id: UUID
    user_id: UUID


class DismissJoinRequestRequest(BaseModel):
    """Request model for a requester dismissing their own denied request"""

    request_id: UUID


class ManageProjectMemberRequest(BaseModel):
    """Request model for adding a member to a project (class instructor only)."""

    user_id: UUID
    role: str | None = "member"


class AssignRoleRequest(BaseModel):
    """Request model for assigning product owner or scrum master to a project member."""

    user_id: UUID
