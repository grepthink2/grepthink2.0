"""Pydantic models for the scrum board feature.

Char limits mirror the DB CHECKs; authorization and cross-row validation are
authoritative in the controller — Pydantic here is a fast pre-flight.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

BoardStatus = Literal["todo", "in_progress", "done"]
EstimateScale = Literal["linear", "exponential", "fibonacci"]
TASK_TAGS = (
    "backend",
    "frontend",
    "ui/ux",
    "infra",
    "design",
    "research",
    "bug",
    "chore",
    "optimization",
    "docs",
)
ESTIMATE_SCALES: dict[str, list[int]] = {
    "linear": [1, 2, 3, 4, 5, 6],
    "exponential": [1, 2, 4, 8, 16, 32],
    "fibonacci": [1, 2, 3, 5, 8, 13],
}

# ----- Requests -----


class UpdateSettingsRequest(BaseModel):
    estimate_scale: EstimateScale


class CreateSprintRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    starts_at: date
    ends_at: date


class UpdateSprintRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=80)
    starts_at: date | None = None
    ends_at: date | None = None
    status: Literal["planned", "active", "completed"] | None = None


class CreateStoryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: str | None = Field(None, max_length=20000)
    points: int | None = Field(None, gt=0)
    time_estimate: str | None = Field(None, max_length=20)
    assignee_id: str | None = None
    sprint_id: str | None = None


class UpdateStoryRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description_md: str | None = Field(None, max_length=20000)
    points: int | None = Field(None, gt=0)
    time_estimate: str | None = Field(None, max_length=20)
    assignee_id: str | None = None
    sprint_id: str | None = None  # explicit null in JSON ⇒ move to backlog
    archived: bool | None = None  # True sets archived_at, False clears it


class CreateTaskRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description_md: str | None = Field(None, max_length=20000)
    points: int | None = Field(None, gt=0)
    time_estimate: str | None = Field(None, max_length=20)
    assignee_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class UpdateTaskRequest(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description_md: str | None = Field(None, max_length=20000)
    points: int | None = Field(None, gt=0)
    time_estimate: str | None = Field(None, max_length=20)
    assignee_id: str | None = None
    tags: list[str] | None = None
    pr_url: str | None = Field(None, max_length=500)  # explicit null ⇒ unlink


class MoveTaskRequest(BaseModel):
    to_status: BoardStatus


class CreateCommentRequest(BaseModel):
    body_md: str = Field(..., min_length=1, max_length=4000)


class AiDraftRequest(BaseModel):
    kind: Literal["story", "tasks"]
    prompt: str = Field(..., min_length=1, max_length=2000)
    story_id: str | None = None  # context for kind='tasks'


# ----- Subobjects -----


class ScrumMember(BaseModel):
    user_id: str
    name: str
    image_url: str | None = None
    project_role: str | None = None


class SprintOut(BaseModel):
    id: str
    name: str
    starts_at: date
    ends_at: date
    status: str


class TaskOut(BaseModel):
    id: str
    story_id: str
    key: str
    title: str
    description_md: str | None = None
    points: int | None = None
    time_estimate: str | None = None
    status: BoardStatus
    reporter_id: str
    assignee_id: str | None = None
    tags: list[str] = Field(default_factory=list)
    pr_url: str | None = None
    pr_provider: str | None = None
    pr_state: str | None = None
    moved_by: str | None = None
    moved_by_name: str | None = None
    moved_at: str | None = None
    comment_count: int = 0


class StoryOut(BaseModel):
    id: str
    sprint_id: str | None = None
    key: str
    title: str
    description_md: str | None = None
    points: int | None = None
    time_estimate: str | None = None
    reporter_id: str
    assignee_id: str | None = None
    archived_at: str | None = None
    comment_count: int = 0
    tasks: list[TaskOut] = Field(default_factory=list)


class BurnupSeries(BaseModel):
    labels: list[str]
    scope: list[int]
    completed: list[int]
    subtitle: str | None = None


class CommentOut(BaseModel):
    id: str
    author_id: str
    author_name: str
    body_md: str
    created_at: str


class AiDraftTask(BaseModel):
    title: str
    tags: list[str] = Field(default_factory=list)
    points: int | None = None
    time_estimate: str | None = None


class AiDraft(BaseModel):
    title: str | None = None
    description_md: str | None = None
    points: int | None = None
    time_estimate: str | None = None
    tasks: list[AiDraftTask] = Field(default_factory=list)


# ----- Responses -----


class BoardProject(BaseModel):
    id: str
    name: str
    estimate_scale: EstimateScale


class BurnupOut(BaseModel):
    sprint: BurnupSeries | None = None
    cumulative: BurnupSeries


class BoardResponse(BaseModel):
    project: BoardProject
    ai_enabled: bool
    sprints: list[SprintOut]
    sprint_id: str | None = None
    stories: list[StoryOut]
    backlog: list[StoryOut]
    burnup: BurnupOut
    members: list[ScrumMember]
    access: Literal["member", "staff"]


class SprintResponse(BaseModel):
    message: str
    sprint: SprintOut


class StoryResponse(BaseModel):
    message: str
    story: StoryOut


class TaskResponse(BaseModel):
    message: str
    task: TaskOut


class CommentsListResponse(BaseModel):
    comments: list[CommentOut]


class CommentResponse(BaseModel):
    message: str
    comment: CommentOut


class PrRefreshResponse(BaseModel):
    updated: dict[str, str]  # task_id -> new pr_state


class AiDraftResponse(BaseModel):
    draft: AiDraft


class ScrumRepoOut(BaseModel):
    id: str
    repo_url: str
    provider: Literal["github", "gitlab"]
    has_token: bool = False  # tokens are write-only; never echoed back


class AddScrumRepoRequest(BaseModel):
    repo_url: str = Field(..., min_length=1, max_length=500)
    access_token: str | None = Field(None, max_length=200)


class ScrumReposListResponse(BaseModel):
    repos: list[ScrumRepoOut]


class ScrumRepoResponse(BaseModel):
    message: str
    repo: ScrumRepoOut
