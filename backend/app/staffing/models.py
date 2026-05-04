"""
Staffing / Interest-Form request and response models.

The staffing surface has three flavors of write:

  * ``SubmitInterestRequest`` — a single per-(user, class, project) ranked
    preference. Used by the partial-save endpoint and by the spreadsheet-
    style flow where students enter rows one at a time.
  * ``SubmitInterestFormRequest`` — the full interest-form submission as a
    single atomic upsert: general background fields, all ranked projects,
    and the work-with / don't-work-with peer lists.
  * ``AssignUserRequest`` / ``UnassignUserRequest`` — instructor staffing
    actions against ``project_members``.

Validation here is intentionally lightweight; the controller re-checks
business rules (interest_value range, class enrollment, etc.) so a
malformed payload always fails with a clear 4xx.
"""
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SubmitInterestRequest(BaseModel):
    """Submit / update a single ranked preference for the current user."""
    class_id: UUID
    project_id: UUID
    interest_value: int = Field(..., ge=1, le=5)
    interest_reason: Optional[str] = None


class RankedProject(BaseModel):
    """A single ranked-project entry inside the full interest-form submission."""
    project_id: UUID
    interest_value: int = Field(..., ge=1, le=5)
    interest_reason: Optional[str] = None


class SubmitInterestFormRequest(BaseModel):
    """
    Full interest-form submission.

    Upserts the general background fields, replaces the user's
    ``interest_form`` rows for this class, and replaces the user's
    ``interest_team_preferences`` rows for this class.
    """
    taking_115c: Optional[bool] = None
    previous_project_name: Optional[str] = None
    previous_project_link: Optional[str] = None
    notes: Optional[str] = None
    ranked_projects: List[RankedProject] = Field(default_factory=list)
    work_with: List[UUID] = Field(default_factory=list)
    dont_work_with: List[UUID] = Field(default_factory=list)
    submitted: bool = True


class AssignUserRequest(BaseModel):
    """Instructor request to assign a student to a project in the class."""
    user_id: UUID
    project_id: UUID


class UnassignUserRequest(BaseModel):
    """Instructor request to remove a student's project assignment in the class."""
    user_id: UUID


# Used internally by views; kept here for clarity / OpenAPI completeness.
TeamPreferenceKind = Literal["work_with", "dont_work_with"]
