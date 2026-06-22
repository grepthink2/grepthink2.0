"""Transactional emails for class roster invitations."""
from __future__ import annotations

import html
import logging
import smtplib

from app.config import settings
from app.utils.email import send_email

logger = logging.getLogger(__name__)


def frontend_url() -> str:
    """Public app base URL for links in invitation emails."""
    explicit = (settings.FRONTEND_URL or "").strip().rstrip("/")
    if explicit:
        return explicit
    if settings.CORS_ORIGINS:
        return settings.CORS_ORIGINS[0].rstrip("/")
    return "http://localhost:5173"


def send_class_invite_email(
    *,
    to: str,
    class_name: str,
    course_code: str,
    instructor_name: str,
    registered: bool,
) -> None:
    """Send a roster invite email to an existing or prospective student.

    Raises:
        RuntimeError: SMTP is not configured.
        smtplib.SMTPException: Delivery failed.
    """
    app_url = frontend_url()
    signup_url = f"{app_url}/studentsignup"
    safe_class = html.escape(class_name)
    safe_code = html.escape(course_code)
    safe_instructor = html.escape(instructor_name or "your instructor")

    if registered:
        subject = f"You've been added to {class_name} on GrepThink"
        body_text = (
            f"Hi,\n\n"
            f"{instructor_name or 'Your instructor'} added you to {class_name} on GrepThink.\n\n"
            f"Sign in to view your class: {app_url}\n\n"
            f"Course access code: {course_code}\n\n"
            f"If you were not expecting this, you can ignore this email."
        )
        body_html = f"""
<html>
  <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin-bottom:8px">You've been added to {safe_class}</h2>
    <p>{safe_instructor} added you to <strong>{safe_class}</strong> on GrepThink.</p>
    <p><a href="{app_url}">Sign in to GrepThink</a> to view your class.</p>
    <p>Course access code: <strong>{safe_code}</strong></p>
    <p style="color:#666;font-size:0.875rem">
      If you were not expecting this, you can ignore this email.
    </p>
  </body>
</html>
"""
    else:
        subject = f"Join {class_name} on GrepThink"
        body_text = (
            f"Hi,\n\n"
            f"{instructor_name or 'Your instructor'} invited you to join {class_name} on GrepThink.\n\n"
            f"1. Create your student account: {signup_url}\n"
            f"2. After signing up, join the class with this access code: {course_code}\n\n"
            f"If you were not expecting this, you can ignore this email."
        )
        body_html = f"""
<html>
  <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin-bottom:8px">You're invited to {safe_class}</h2>
    <p>{safe_instructor} invited you to join <strong>{safe_class}</strong> on GrepThink.</p>
    <ol>
      <li><a href="{signup_url}">Create your student account</a></li>
      <li>After signing up, join the class with access code <strong>{safe_code}</strong></li>
    </ol>
    <p style="color:#666;font-size:0.875rem">
      If you were not expecting this, you can ignore this email.
    </p>
  </body>
</html>
"""

    send_email(
        to=to,
        subject=subject,
        body_text=body_text,
        body_html=body_html,
    )
    logger.info(
        "class_invite_email: sent | to=%s class=%r registered=%s",
        to, class_name, registered,
    )


def send_class_invite_email_or_raise(*, to: str, **kwargs) -> None:
    """Send invite email; translate SMTP failures into HTTP-friendly errors."""
    from fastapi import HTTPException

    try:
        send_class_invite_email(to=to, **kwargs)
    except RuntimeError as exc:
        logger.warning("class_invite_email: SMTP not configured | to=%s", to)
        raise HTTPException(
            status_code=503,
            detail=(
                "Email delivery is not configured on this server. "
                "Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in .env."
            ),
        ) from exc
    except smtplib.SMTPException as exc:
        logger.error("class_invite_email: delivery failed | to=%s err=%s", to, exc)
        raise HTTPException(
            status_code=502,
            detail="Failed to send invitation email",
        ) from exc
