"""Pydantic models for the website's issue form."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class IssueReportRequest(BaseModel):
    # Bounds apply after trimming, so a blank title answers 422 like a missing one.
    model_config = ConfigDict(str_strip_whitespace=True)

    # GitHub's own rule (1-39 characters) is checked in the controller, which can answer with a
    # message the form shows; this bound only stops absurd input early.
    github_user: str = Field(..., min_length=1, max_length=100)
    email: str = Field(..., min_length=3, max_length=320)
    title: str = Field(..., min_length=1, max_length=120)
    description: str = Field(..., min_length=1, max_length=10_000)
    # Honeypot: hidden in the UI. Humans leave it blank; bots tend to fill it.
    website: str = ""


class IssueReportResponse(BaseModel):
    """Null number and URL: the report reached the maintainer by email but is not on GitHub."""

    issue_number: int | None
    issue_url: str | None
