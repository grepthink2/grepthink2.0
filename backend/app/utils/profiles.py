"""Helpers for reading profile rows (first_name / last_name schema)."""

PROFILE_SELECT = "id, email, first_name, last_name"


def profile_display_name(profile: dict | None) -> str:
    """Human-friendly label: 'First Last', else email, else empty string."""
    if not profile:
        return ""
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    return full or (profile.get("email") or "")


def needs_roster_email(profile: dict) -> bool:
    """True for a student with neither a verified roster email nor a school primary address.

    The one rule behind both the profile-completeness check and the profile-completion
    reminder, so they can't drift apart. Order matters: ``is_school_email`` can read the
    institutions table and raise ``DatabaseError`` on an outage, so the free checks — role,
    then whether a roster email is already on file — run first and short-circuit the common
    case (a student who already has one never reaches it).
    """
    # Imported here, not at the top: most controllers import this module, and a helper module
    # must not depend on a feature module (app.institutions) at import time.
    from app.institutions.controller import is_school_email

    role = profile.get("role")
    edu_email = (profile.get("edu_email") or "").strip()
    email = (profile.get("email") or "").strip().lower()
    return role == "student" and not edu_email and not is_school_email(email)
