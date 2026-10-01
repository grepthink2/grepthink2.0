"""Scheduled class invites: due ``pending_invites`` jobs become outbox rows.

An instructor can queue an invite batch to go out later: ``app.classes.controller.queue_invite``
stores a ``pending_invites`` row with its ``send_at``. ``expand_due_invite_jobs`` runs first in
every dispatcher tick (``app.outbox.controller._producers``) and turns each due job into one
outbox row per recipient, which the same tick goes on to deliver.

* A custom job (``custom_subject`` and ``custom_body``) emails each address that subject and
  body, with the job's cc and bcc on every email (``custom_invite``). Nobody is enrolled.
* A standard job runs the bulk invite's plan (``app.classes.controller._plan_invites``): the
  accounts among the addresses are enrolled, and every address gets the class invite
  (``class_invite``). A student listed under two addresses is emailed once: both emails would
  go to the account's address, under the same dedupe key.

A job is marked sent only once its rows are in, and only while it is unsent and not cancelled.
Each row's ``dedupe_key`` (``invite_job:<job id>:<address>``) makes that order safe: a tick that
dies between the two leaves the job due, and the next tick expands it again without queuing any
email twice. A job cancelled meanwhile has its rows cancelled instead.

Logs name the job, never an address.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from typing import Any

from app.core import authz
from app.core.errors import DatabaseError
from app.outbox import controller as outbox

logger = logging.getLogger(__name__)

#: Due jobs read per tick.
JOB_BATCH = 20

_JOB_COLUMNS = (
    "id, class_id, instructor_id, emails, cc, bcc, custom_subject, custom_body, custom_body_html"
)


def expand_due_invite_jobs(client, deadline: float) -> int:
    """Turn the invite jobs whose ``send_at`` has passed into outbox rows.

    Reads up to ``JOB_BATCH`` due jobs, the longest due first, and starts none once the outbox's
    ``_monotonic`` clock reaches ``deadline``: the rest wait for the next tick. A job that meets a
    database error, or whose students cannot be looked up or enrolled, stays due for the next
    tick, and the jobs after it go on. Before the outbox migration (``OutboxUnavailable``) a job
    is marked sent first and then sent directly (``deliver_now``).

    Returns:
        How many jobs were turned into rows (or sent directly).
    """
    if outbox._monotonic() >= deadline:
        return 0
    jobs = (
        client.table("pending_invites")
        .select(_JOB_COLUMNS)
        .lte("send_at", outbox._now().isoformat())
        .eq("cancelled", False)
        .eq("sent", False)
        .order("send_at")
        .limit(JOB_BATCH)
        .execute()
    ).data or []

    expanded = 0
    for job in jobs:
        if outbox._monotonic() >= deadline:
            break
        try:
            if _expand(client, job):
                expanded += 1
        except DatabaseError as err:
            logger.error(
                "invite_jobs: left for the next tick | job=%s error=%s", job.get("id"), err
            )
        except Exception:
            # A bug in one job must not hold up the jobs due after it, tick after tick.
            logger.exception("invite_jobs: left for the next tick | job=%s", job.get("id"))
    return expanded


def _expand(client, job: Mapping[str, Any]) -> bool:
    """Queue ``job``'s emails, then mark it sent. Whether it was (``False``: it waits or is gone)."""
    job_id = str(job["id"])
    rows = _rows_for(client, job)
    if rows is None:
        return False

    try:
        outbox.enqueue(client, rows)
    except outbox.OutboxUnavailable:
        # Nothing would hold the emails, so the job is marked sent before they go: a dispatcher
        # expanding it at the same time, or the next tick, finds it taken and sends nothing.
        if not _mark_sent(client, job_id):
            return False
        outcomes = outbox.deliver_now(rows)
        unsent = sum(1 for outcome in outcomes.values() if outcome != "sent")
        if unsent:
            logger.error(
                "invite_jobs: emails not sent directly | job=%s unsent=%d of=%d",
                job_id,
                unsent,
                len(rows),
            )
        return True

    if _mark_sent(client, job_id):
        logger.info("invite_jobs: queued | job=%s emails=%d", job_id, len(rows))
        return True
    _withdraw(client, job_id)
    return False


def _rows_for(client, job: Mapping[str, Any]) -> list[outbox.OutboxRow] | None:
    """The outbox rows for ``job``, or ``None`` when it has to wait for the next tick."""
    job_id = str(job["id"])
    addresses = _addresses(job.get("emails"))
    common = {
        "class_id": job.get("class_id"),
        "batch_id": job_id,
        "created_by": job.get("instructor_id"),
    }

    if job.get("custom_subject") and job.get("custom_body"):
        payload = {
            "subject": job["custom_subject"],
            "body_text": job["custom_body"],
            "body_html": job.get("custom_body_html"),
            "cc": list(job.get("cc") or []),
            "bcc": list(job.get("bcc") or []),
        }
        return [
            outbox.OutboxRow(
                kind="custom_invite",
                to_email=address,
                payload=payload,
                dedupe_key=_dedupe_key(job_id, address),
                **common,
            )
            for address in addresses
        ]

    # Imported here, not at the top: the classes controller imports the outbox controller, so a
    # top-level import would tie loading the outbox package to loading the classes module.
    from app.classes.controller import _INVITE_CLASS_COLUMNS, _invite_email_context, _plan_invites

    class_row = authz.load_class(client, job["class_id"], _INVITE_CLASS_COLUMNS)
    if class_row is None:
        logger.warning("invite_jobs: the class is gone, nothing to send | job=%s", job_id)
        return []
    plans = _plan_invites(client, str(class_row["id"]), str(class_row.get("created_by")), addresses)
    if any(plan.status == "error" for plan in plans):
        logger.warning(
            "invite_jobs: students could not be looked up or enrolled, left for the next tick "
            "| job=%s",
            job_id,
        )
        return None
    context = _invite_email_context(class_row)
    return [
        outbox.OutboxRow(
            kind="class_invite",
            to_email=plan.deliver_to,
            payload={**context, "registered": plan.registered},
            user_id=plan.user_id,
            dedupe_key=_dedupe_key(job_id, plan.deliver_to),
            **common,
        )
        for plan in plans
        if plan.deliver_to
    ]


def _mark_sent(client, job_id: str) -> bool:
    """Mark the job sent unless it was sent or cancelled meanwhile. Whether this call marked it."""
    marked = (
        client.table("pending_invites")
        .update({"sent": True})
        .eq("id", job_id)
        .eq("sent", False)
        .eq("cancelled", False)
        .execute()
    ).data
    return bool(marked)


def _withdraw(client, job_id: str) -> None:
    """After ``_mark_sent`` found the job taken: cancel its pending rows if it was cancelled.

    It may instead have been marked sent by a dispatcher expanding it at the same time. Then
    those rows are its emails (the dedupe keys let one copy of each in), and they stay. Never
    raises: the job is no longer due either way, so a failure here is only logged.
    """
    try:
        found = (
            client.table("pending_invites").select("cancelled").eq("id", job_id).limit(1).execute()
        ).data
        if found and not found[0].get("cancelled"):
            return
        client.table("email_outbox").update(
            {"status": "cancelled", "updated_at": outbox._now().isoformat()}
        ).eq("batch_id", job_id).eq("status", "pending").execute()
    except DatabaseError as err:
        logger.error(
            "invite_jobs: could not withdraw the emails of a job taken meanwhile | job=%s error=%s",
            job_id,
            err,
        )
        return
    logger.info("invite_jobs: cancelled before it went out | job=%s", job_id)


def _addresses(emails: Iterable[Any] | None) -> list[str]:
    """The job's addresses trimmed and lower-cased, without blanks or repeats, in order."""
    return list(
        dict.fromkeys(
            email.strip().lower()
            for email in emails or ()
            if isinstance(email, str) and email.strip()
        )
    )


def _dedupe_key(job_id: str, address: str) -> str:
    return f"invite_job:{job_id}:{address}"
