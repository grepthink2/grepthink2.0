"""HTTP handler for the contact form. Thin layer over controller.py."""
from __future__ import annotations

from fastapi import Request, Response, status

from app.contact import controller
from app.contact.models import ContactRequest
from app.limiter import limiter


@limiter.limit("10/minute")
def submit_contact(request: Request, body: ContactRequest) -> Response:
    controller.submit_contact(
        name=body.name,
        email=body.email,
        message=body.message,
        website=body.website,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
