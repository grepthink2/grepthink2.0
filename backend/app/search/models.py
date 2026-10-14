"""Pydantic models for the global search index."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

SearchItemType = Literal[
    "person", "project", "task", "story", "conversation", "class", "assignment"
]


class SearchItem(BaseModel):
    """One thing the palette can open. Only ``id``, ``type``, ``title``, ``href`` are always set."""

    id: str
    type: SearchItemType
    title: str
    href: str
    key: str | None = None
    subtitle: str | None = None
    keywords: list[str] | None = None
    project_id: str | None = None
    class_id: str | None = None
    status: Literal["todo", "in_progress", "done"] | None = None
    tags: list[str] | None = None
    points: int | None = None
    sprint: str | None = None
    due_at: str | None = None
    unread: int | None = None
    last_message_at: str | None = None
    same_project: bool | None = None
    updated_at: str | None = None


class SearchIndexResponse(BaseModel):
    items: list[SearchItem]
    generated_at: str
