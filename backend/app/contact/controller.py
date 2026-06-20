"""Business logic for the public contact form.

Validates a submission and forwards it as an email to the support inbox via
the shared ``send_email`` utility.
"""
from __future__ import annotations

import html
import logging
import re
import smtplib

from fastapi import HTTPException

from app.utils.email import send_email

logger = logging.getLogger(__name__)

# Where contact form submissions are delivered.
CONTACT_RECIPIENT = "grepthink2.0@gmail.com"

# Deliberately permissive — we are not an authority on RFC 5322. This rejects
# the obviously-broken inputs; real validation is "can we reply to it".
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def submit_contact(*, name: str, email: str, message: str, website: str = "") -> None:
    """Validate a contact submission and email it to the support inbox.

    Args:
        name:    Submitter's name.
        email:   Submitter's email (used as Reply-To).
        message: Free-text message body.
        website: Honeypot field. If non-empty, the submission is treated as a
                 bot and silently dropped without sending.

    Raises:
        HTTPException(400): Validation failure (blank field / bad email).
        HTTPException(502): Email delivery failed.
    """
    # Honeypot: a filled hidden field means a bot. Pretend success so we don't
    # teach the bot what tripped it — just don't send anything.
    if website.strip():
        logger.info("contact: honeypot triggered — dropping submission silently")
        return

    name = name.strip()
    email = email.strip()
    message = message.strip()

    if not name:
        raise HTTPException(status_code=400, detail="Name is required")
    if not message:
        raise HTTPException(status_code=400, detail="Message is required")
    if not _EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="A valid email is required")

    subject = f"New contact message from {name}"
    body_text = (
        f"Name: {name}\n"
        f"Email: {email}\n\n"
        f"{message}\n"
    )
    body_html = (
        f"<p><strong>Name:</strong> {html.escape(name)}</p>"
        f"<p><strong>Email:</strong> {html.escape(email)}</p>"
        f"<p>{html.escape(message).replace(chr(10), '<br>')}</p>"
    )

    try:
        send_email(
            to=CONTACT_RECIPIENT,
            subject=subject,
            body_text=body_text,
            body_html=body_html,
            reply_to=email,
        )
    except (RuntimeError, smtplib.SMTPException) as exc:
        logger.error("contact: failed to send email | %s", exc)
        raise HTTPException(status_code=502, detail="Failed to send message") from exc
