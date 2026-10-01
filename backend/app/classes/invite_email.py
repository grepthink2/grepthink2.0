"""What a class roster invitation says.

Invitations are sent through the outbox (``app.outbox``, kind ``class_invite``), which renders
them with ``render_class_invite`` when they go out. There is deliberately no helper here that
sends one directly: an invite sent around the outbox gets no retry, no suppression check and no
record.
"""

from __future__ import annotations

import html

from app.outbox.rendered import Rendered
from app.utils.urls import frontend_url


def render_class_invite(
    *,
    class_name: str,
    course_code: str,
    instructor_name: str,
    registered: bool,
) -> Rendered:
    """The roster invite for an existing (``registered``) or prospective student.

    Links point at ``frontend_url()`` as it is when this runs (when the outbox sends it).
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

    return Rendered(subject=subject, text=body_text, html=body_html)
