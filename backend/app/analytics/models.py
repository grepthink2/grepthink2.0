"""Response models for /api/analytics (the handoff brief's TypeScript contract, §5)."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.analytics.windows import Window


class ScopeClass(BaseModel):
    id: str
    name: str
    term: str | None = None
    start_date: dt.date | None = None
    label: str


class ScopeInstitution(BaseModel):
    id: str
    name: str
    slug: str
    timezone: str
    access: Literal["maintainer", "instructor"]
    classes: list[ScopeClass]


class ScopeResponse(BaseModel):
    institutions: list[ScopeInstitution]


class MetaInstitution(BaseModel):
    id: str
    name: str
    slug: str
    timezone: str


class MetaClass(BaseModel):
    id: str
    label: str


class MetaRange(BaseModel):
    """`from` and `class` are Python keywords: the fields carry an alias, and FastAPI serializes by alias."""

    model_config = ConfigDict(populate_by_name=True)

    preset: Window
    from_: dt.date = Field(alias="from")
    to: dt.date
    previous_from: dt.date | None
    previous_to: dt.date | None


class Meta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    institution: MetaInstitution
    class_: MetaClass | None = Field(default=None, alias="class")
    range: MetaRange
    generated_at: dt.datetime
    cached: bool
    k_anonymity: int
    rollup_as_of: dt.date | None


class Overview(BaseModel):
    active_classes: int | None
    teams: int | None
    students: int | None
    active_users_7d: int | None
    messages: int | None
    stories_created: int | None
    tasks_created: int | None
    story_points_created: int | None
    task_points_created: int | None
    on_time_rate: float | None
    deltas: dict[str, float | None]
    trends: dict[str, list[float]]


class WeeklyMessages(BaseModel):
    week_start: dt.date
    team_members: int
    dm: int


class Conversations(BaseModel):
    total: int | None
    team_members: int | None
    dm: int | None
    weekly: list[WeeklyMessages]
    excluded: list[str]


class SprintRow(BaseModel):
    ordinal: int
    label: str
    teams: int
    todo: int
    in_progress: int
    done: int
    points_todo: int
    points_in_progress: int
    points_done: int


class CharsRow(BaseModel):
    entity: Literal["task", "story"]
    ordinal: int | None
    label: str
    n: int
    median: int


class Scrum(BaseModel):
    live_as_of: dt.datetime
    stories_created: int | None
    tasks_created: int | None
    story_points_created: int | None
    task_points_created: int | None
    by_sprint: list[SprintRow]
    chars: list[CharsRow]


class Timeliness(BaseModel):
    on_time_rate: float | None
    expected: int
    late: int
    missing: int
    edited_late: int
    bucket_order: list[str]
    rows: list[dict]


class TrendPoint(BaseModel):
    week_start: dt.date
    value: float | None


class TrendPanel(BaseModel):
    key: str
    title: str
    unit: str
    current: list[TrendPoint]
    previous: list[TrendPoint] | None


class Trends(BaseModel):
    as_of: dt.date | None
    panels: list[TrendPanel]


class BreakdownRow(BaseModel):
    id: str
    name: str
    kind: Literal["row", "folded"]
    teams: int | None = None
    students: int | None = None
    members: int | None = None
    team_messages: int | None
    stories: int | None
    tasks: int | None
    points_done_rate: float | None
    on_time_rate: float | None
    missing: int
    href: str | None = None


class Breakdown(BaseModel):
    kind: Literal["class", "team"]
    rows: list[BreakdownRow]


class AnalyticsDashboardResponse(BaseModel):
    meta: Meta
    overview: Overview
    conversations: Conversations
    scrum: Scrum
    timeliness: Timeliness
    trends: Trends
    breakdown: Breakdown
    failures: list[str]
