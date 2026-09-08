"""Scheduled class-invite emails.

Instructors can queue an invite batch for a later time (``pending_invites``
rows, see ``app.classes.controller.queue_invite``). This poller wakes up every
``settings.PENDING_INVITES_POLL_SECONDS`` seconds, claims every row whose
``send_at`` has passed, and delivers it — either a custom-composed email or the
standard bulk-invite flow.

Deployment caveat: the poller lives in the API process. On serverless hosts
(Vercel) instances are short-lived, so queued invites may be delivered late or
not at all until this moves to a scheduler (Vercel Cron / ``pg_cron``).
"""

from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from app.core.db import get_client

logger = logging.getLogger(__name__)

_CLAIM_COLUMNS = (
    "id, class_id, instructor_id, emails, cc, bcc, custom_subject, custom_body, custom_body_html"
)


def _due_rows(client) -> list[dict]:
    now_iso = datetime.now(UTC).isoformat()
    res = (
        client.table("pending_invites")
        .select(_CLAIM_COLUMNS)
        .lte("send_at", now_iso)
        .eq("cancelled", False)
        .eq("sent", False)
        .execute()
    )
    return res.data or []


async def _deliver(client, row: dict) -> None:
    # Imported lazily: the classes controller imports a lot of the app and we
    # do not want the poller module to be part of that import graph.
    from app.classes.controller import bulk_invite_students
    from app.utils.email import send_email, wrap_editor_html_for_email

    # Mark sent first to prevent double delivery if the process dies mid-send.
    client.table("pending_invites").update({"sent": True}).eq("id", row["id"]).execute()
    try:
        if row.get("custom_subject") and row.get("custom_body"):
            raw_html = row.get("custom_body_html")
            body_html = wrap_editor_html_for_email(raw_html) if raw_html else None
            for email in row["emails"]:
                try:
                    await asyncio.to_thread(
                        send_email,
                        to=email,
                        subject=row["custom_subject"],
                        body_text=row["custom_body"],
                        body_html=body_html,
                        cc=row.get("cc") or [],
                        bcc=row.get("bcc") or [],
                    )
                except Exception:
                    logger.exception(
                        "pending_invite custom email failed: job=%s to=%s", row["id"], email
                    )
        else:
            await asyncio.to_thread(
                bulk_invite_students, row["class_id"], row["emails"], row["instructor_id"]
            )
        logger.info("pending_invite sent: job=%s", row["id"])
    except Exception:
        logger.exception("pending_invite failed: job=%s", row["id"])


async def process_once() -> int:
    """Deliver every due invite job. Returns the number of jobs processed."""
    client = get_client()
    rows = _due_rows(client)
    for row in rows:
        await _deliver(client, row)
    return len(rows)


async def run_forever(interval_seconds: float) -> None:
    """Poll until cancelled. Errors are logged and never stop the loop."""
    while True:
        await asyncio.sleep(interval_seconds)
        try:
            await process_once()
        except Exception:
            logger.exception("pending_invite poll error")
