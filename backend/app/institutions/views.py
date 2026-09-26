"""Institutions views."""

from fastapi import Request, Response

from app.institutions import controller
from app.limiter import limiter


def _public_institution(institution: dict) -> dict:
    """Only the fields the client should ever see, named explicitly.

    Keeps a field added later to the row (or to ``controller._normalized``) from silently
    becoming public just because it was in the cached dict.
    """
    return {
        "id": institution["id"],
        "name": institution["name"],
        "slug": institution["slug"],
        "email_domains": institution["email_domains"],
    }


@limiter.limit("60/minute")
def list_institutions(request: Request, response: Response):
    """Public: the schools GrepThink knows, for the Create Class picker and for the school-email
    check at signup, which runs before the user is signed in. Empty until the migration is
    applied — and not cached then (``no-store``), so a browser doesn't keep serving that empty
    answer for 5 minutes after the migration actually lands.
    """
    institutions = controller.load_institutions()
    response.headers["Cache-Control"] = (
        "public, max-age=300" if institutions is not None else "no-store"
    )
    return {"institutions": [_public_institution(i) for i in institutions or []]}
