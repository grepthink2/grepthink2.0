"""Telling a team's TAs that the team finalized a document: in the app, and by email through the outbox.

The recipients are the team's meeting TA (``projects.assigned_ta_id``) and its Review TA
(``project_review_tas``), each once, and never the person who finalized. Each recipient with an email
address gets one ``document_finalized`` email per finalized revision: the outbox's dedupe key names the
document, the revision and the recipient, so a retried finalize sends nothing twice.

Nothing here can fail a finalize, which has already been saved: a failure is logged at WARNING with ids
and the error's type only (a database error's message can quote a row, names and addresses included).
"""

from __future__ import annotations

import html
import logging
from collections.abc import Mapping
from typing import Any

from app.core.db import fan_out
from app.notifications.controller import notify_document_finalized
from app.outbox.rendered import Rendered
from app.utils.urls import frontend_url

logger = logging.getLogger(__name__)

#: The outbox kind (``app.outbox.kinds``): transactional, so no preference switches it off.
EMAIL_KIND = "document_finalized"


def recipients(project: dict, review_ta_ids: list[str], finalizer_id: str) -> list[str]:
    """The meeting TA, then the Review TAs, each once, without the finalizer."""
    out: list[str] = []
    for uid in [project.get("assigned_ta_id"), *review_ta_ids]:
        if not uid or str(uid).lower() == str(finalizer_id).lower():
            continue
        if str(uid).lower() not in {o.lower() for o in out}:
            out.append(str(uid))
    return out


def document_link(project_id: str, document_id: str) -> str:
    return f"{frontend_url()}/app/projects/{project_id}/documents/{document_id}"


def notify_finalized(
    client,
    *,
    project: dict,
    document_id: str,
    document_title: str,
    revision: int,
    finalizer_id: str,
) -> None:
    """Notify the team's TAs that ``document_id`` was finalized at ``revision``. ``project`` carries
    ``id``, ``name``, ``class_id`` and ``assigned_ta_id``. Never raises.

    Round trips: the Review TAs, the recipients' addresses, then the notifications and the emails
    side by side; nothing past the first when nobody is to be told.
    """
    # Imported here, not at the top: the outbox's kinds import this module for the email's text.
    from app.outbox import controller as outbox

    try:
        review = (
            client.table("project_review_tas")
            .select("user_id")
            .eq("project_id", str(project["id"]))
            .execute()
        ).data or []
        ids = recipients(project, [r["user_id"] for r in review], finalizer_id)
        if not ids:
            return
        people = (client.table("profiles").select("id, email").in_("id", ids).execute()).data or []
        payload = {
            "project_name": project.get("name") or "",
            "document_title": document_title,
            "link": document_link(project["id"], document_id),
        }
        emails = [
            outbox.OutboxRow(
                kind=EMAIL_KIND,
                to_email=person["email"],
                payload=payload,
                user_id=str(person["id"]),
                class_id=project.get("class_id"),
                created_by=str(finalizer_id),
                dedupe_key=f"{EMAIL_KIND}:{document_id}:{revision}:{person['id']}",
            )
            for person in people
            if (person.get("email") or "").strip()
        ]
        jobs = {
            "in_app": lambda: notify_document_finalized(
                recipient_ids=ids,
                project_name=payload["project_name"],
                document_title=document_title,
                document_id=str(document_id),
            )
        }
        if emails:
            jobs["email"] = lambda: outbox.enqueue(client, emails, return_rows=False)
        fan_out(jobs)
    except Exception as exc:
        logger.warning(
            "documents: finalize notice failed | document=%s revision=%s error=%s",
            document_id,
            revision,
            type(exc).__name__,
        )


def render_document_finalized(payload: Mapping[str, Any], context: Any = None) -> Rendered:
    """The email: ``project_name``, ``document_title`` and ``link`` from the payload."""
    project = " ".join(str(payload["project_name"]).split())
    title = " ".join(str(payload["document_title"]).split())
    link = str(payload["link"])
    subject = f"{project} finalized its {title}"
    text = f"Hi,\n\n{project} finalized its {title} on GrepThink.\n\nRead it: {link}\n"
    body_html = f"""
<html>
  <body style="font-family:sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:24px">
    <h2 style="margin-bottom:8px">{html.escape(subject)}</h2>
    <p>{html.escape(project)} finalized its <strong>{html.escape(title)}</strong> on GrepThink.</p>
    <p><a href="{html.escape(link, quote=True)}">Read it on GrepThink</a></p>
  </body>
</html>
"""
    return Rendered(subject=subject, text=text, html=body_html)
