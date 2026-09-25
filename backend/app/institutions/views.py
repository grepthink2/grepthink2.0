"""Institutions views."""

from fastapi import Request, Response

from app.institutions import controller
from app.limiter import limiter


@limiter.limit("60/minute")
def list_institutions(request: Request, response: Response):
    """Public: the schools GrepThink knows, for the Create Class picker and for the school-email
    check at signup, which runs before the user is signed in. Empty until the migration is applied.
    """
    response.headers["Cache-Control"] = "public, max-age=300"
    return {"institutions": controller.load_institutions() or []}
