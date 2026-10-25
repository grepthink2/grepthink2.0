"""What a connected app sends to add a batch to a scrum board (``fill_board``).

Only shapes and types here: lengths, scales, tags, members and sprints are checked by
:func:`app.mcp.controller.fill_board`, which reports every problem at once with its path
instead of stopping at the first.
"""

from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class NewTask(BaseModel):
    title: str
    description_md: str | None = None
    points: int | None = None
    estimate_hours: int | None = None
    assignee_id: str | None = None
    tags: list[str] = Field(default_factory=list)


class NewStory(BaseModel):
    title: str
    description_md: str | None = None
    points: int | None = None
    assignee_id: str | None = None
    #: A new sprint's ``ref`` from this batch, or an existing sprint's id; None = backlog.
    sprint: str | None = None
    tasks: list[NewTask] = Field(default_factory=list)


class NewSprint(BaseModel):
    #: A label of the app's choosing that stories in the same batch use to name this sprint.
    ref: str
    name: str
    starts_at: date
    ends_at: date


class FillBoardRequest(BaseModel):
    confirmed: bool
    sprints: list[NewSprint] = Field(default_factory=list)
    stories: list[NewStory] = Field(default_factory=list)
