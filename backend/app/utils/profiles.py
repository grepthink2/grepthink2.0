"""Helpers for reading profile rows (first_name / last_name schema)."""

from typing import Optional

PROFILE_SELECT = "id, email, first_name, last_name"


def profile_display_name(profile: Optional[dict]) -> str:
    """Human-friendly label: 'First Last', else email, else empty string."""
    if not profile:
        return ""
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    return full or (profile.get("email") or "")
