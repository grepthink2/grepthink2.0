"""Pydantic request model for the contact form.

Field length bounds here are a fast pre-flight; the controller re-validates
(trimming + email format) as the authoritative check.
"""
from __future__ import annotations

from pydantic import BaseModel, Field


class ContactRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=3, max_length=320)
    message: str = Field(..., min_length=1, max_length=5000)
    # Honeypot: hidden in the UI. Humans leave it blank; bots tend to fill it.
    website: str = ""
