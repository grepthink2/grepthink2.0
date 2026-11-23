"""What a connected app sends to add a batch to a scrum board (``fill_board``).

Only shapes and types here: lengths, scales, tags, members and sprints are checked by
:func:`app.mcp.controller.fill_board`, which reports every problem at once with its path
instead of stopping at the first.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class NewTask(BaseModel):
    title: str
    description_md: str | None = None
    points: int | None = Field(None, description="One of the board's allowed_points.")
    estimate_hours: int | None = Field(
        None, description="Whole hours, within the board's hours_range."
    )
    assignee_id: str | None = Field(None, description="A user_id from the board's members.")
    tags: list[str] = Field(default_factory=list, description="From the board's tags.")
    status: Literal["todo", "in_progress", "done"] = Field(
        "todo",
        description="Where the task starts on the board. Anything but todo is only for a team's move-in.",
    )
    done_on: date | None = Field(
        None, description="The day a done task was finished, at the school."
    )


class NewStory(BaseModel):
    title: str
    description_md: str | None = None
    points: int | None = Field(
        None, description="One of the board's allowed_points; the sum of its tasks' points."
    )
    assignee_id: str | None = Field(None, description="A user_id from the board's members.")
    sprint: str | None = Field(
        None,
        description="A new sprint's ref from this batch, or an existing sprint's id. Omit for the backlog.",
    )
    tasks: list[NewTask] = Field(default_factory=list)


class NewSprint(BaseModel):
    ref: str = Field(
        description="A label of your choosing that stories in the same batch use to name this sprint."
    )
    name: str
    starts_at: date
    ends_at: date


class FillBoardRequest(BaseModel):
    confirmed: bool
    sprints: list[NewSprint] = Field(default_factory=list)
    stories: list[NewStory] = Field(default_factory=list)


class AuthorizationAnswer(BaseModel):
    """The student's answer on the consent page."""

    approve: bool
