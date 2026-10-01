"""Scheduled class invites: the email dispatcher's producer, from due jobs to outbox rows.

An instructor can queue an invite batch to go out later: ``app.classes.controller.queue_invite``
stores a ``pending_invites`` row with its ``send_at``. ``expand_due_invite_jobs`` is the
dispatcher's producer (``app.outbox.controller._producers``): it runs first in every tick and
turns each due job into one outbox row per recipient, which the same tick goes on to deliver.

* A custom job (``custom_subject`` and ``custom_body``) emails each address that subject and
  body, with the job's cc and bcc on every email (``custom_invite``). Nobody is enrolled.
* A standard job first enrolls the accounts among its addresses, as a bulk invite does
  (``app.classes.controller._plan_invites``), then gives every address the class invite
  (``class_invite``). A student listed under two addresses is emailed once: both emails would
  go to the account's address, under the same dedupe key.

A job is marked sent only once its rows are in, and only while it is unsent and not cancelled.
Each row's ``dedupe_key`` (``invite_job:<job id>:<address>``) makes that order safe: a tick that
dies between the two leaves the job due, and the next tick expands it again without queuing any
email twice. A job cancelled meanwhile has its unclaimed rows cancelled
(``cancel_pending_rows``, which ``cancel_invite`` uses too).

A job that fails (a database error, students who cannot be looked up or enrolled, a bug) is
tried again ``RETRY_SECONDS`` later, so the jobs due after it get their turn. One still failing
``GIVE_UP_AFTER`` after it was queued is cancelled instead, and its instructor told in the app.

Logs name the job, never an address.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core import authz
from app.core.db import MISSING_TABLE_CODES
from app.core.errors import DatabaseError
from app.notifications import controller as notifications
from app.outbox import controller as outbox

logger = logging.getLogger(__name__)

#: Due jobs read per tick.
JOB_BATCH = 20
#: How long a job that failed waits before it is tried again.
RETRY_SECONDS = 300
#: A job still failing this long after it was queued is given up.
GIVE_UP_AFTER = timedelta(hours=24)

_JOB_COLUMNS = (
    "id, class_id, instructor_id, emails, cc, bcc, custom_subject, custom_body, "
    "custom_body_html, created_at"
)


class _NotReady(Exception):
    """A standard job's students could not be looked up or enrolled this time."""


def expand_due_invite_jobs(client, deadline: float) -> int:
    """Turn the invite jobs whose ``send_at`` has passed into outbox rows.

    Reads up to ``JOB_BATCH`` due jobs, the longest due first, and starts none once the outbox's
    ``_monotonic`` clock reaches ``deadline``: the rest wait for the next tick. A job that fails
    is logged and tried again later (or given up, see the module docstring), and the jobs after
    it go on. Before the outbox migration (``OutboxUnavailable``) a job is marked sent first and
    then sent directly (``deliver_now``).

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
        except Exception as err:
            # Whatever went wrong, the jobs due after this one must not wait behind it.
            _log_failure(job, err)
            _retry_later_or_give_up(client, job)
    return expanded


def _expand(client, job: Mapping[str, Any]) -> bool:
    """Queue ``job``'s emails, then mark it sent. Whether it was (``False``: taken meanwhile).

    Raises what kept it from being expanded this time: ``_NotReady``, a database error, a bug.
    """
    job_id = str(job["id"])
    rows = _enroll_and_build_rows(client, job)

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


def _enroll_and_build_rows(client, job: Mapping[str, Any]) -> list[outbox.OutboxRow]:
    """The outbox rows for ``job``. For a standard job, first enroll the accounts among its
    addresses.

    Raises ``_NotReady`` when a standard job's students cannot be looked up or enrolled.
    """
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

    # Imported here, not at the top: the classes controller imports this module.
    from app.classes.controller import _INVITE_CLASS_COLUMNS, _invite_email_context, _plan_invites

    class_row = authz.load_class(client, job["class_id"], _INVITE_CLASS_COLUMNS)
    if class_row is None:
        logger.warning("invite_jobs: the class is gone, nothing to send | job=%s", job_id)
        return []
    plans = _plan_invites(client, str(class_row["id"]), str(class_row.get("created_by")), addresses)
    failed = next((plan for plan in plans if plan.status == "error"), None)
    if failed is not None:
        raise _NotReady(f"job {job_id}") from failed.error
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
    """After ``_mark_sent`` found the job taken: cancel its unclaimed rows, unless another
    dispatcher marked it sent. Never raises.

    The job was cancelled, deleted, or marked sent by a dispatcher expanding it at the same
    time. In the last case its rows are that dispatcher's emails too (the dedupe keys let one
    copy of each in), and they stay. So do they when the job cannot be read again, which is
    logged.
    """
    try:
        found = (
            client.table("pending_invites").select("cancelled").eq("id", job_id).limit(1).execute()
        ).data
        sent_by_another_dispatcher = bool(found) and not found[0].get("cancelled")
    except Exception:
        logger.error(
            "invite_jobs: could not read a job taken meanwhile, its emails stay queued | job=%s",
            job_id,
            exc_info=True,
        )
        return
    if sent_by_another_dispatcher:
        return
    if cancel_pending_rows(client, job_id):
        logger.info("invite_jobs: cancelled before it went out | job=%s", job_id)


def cancel_pending_rows(client, job_id: str) -> bool:
    """Cancel the outbox rows of the invite job ``job_id`` that no dispatcher has claimed yet.

    Rows being sent, or sent, are past stopping and left alone. Before the outbox migration
    there are no rows: the missing table is ignored. Never raises: any other failure is logged
    and answers ``False``.
    """
    try:
        client.table("email_outbox").update(
            {"status": "cancelled", "updated_at": outbox._now().isoformat()}
        ).eq("batch_id", str(job_id)).eq("status", "pending").execute()
    except DatabaseError as err:
        if err.pg_code in MISSING_TABLE_CODES:
            return True
        logger.error(
            "invite_jobs: could not cancel the queued emails | job=%s error=%s", job_id, err
        )
        return False
    except Exception:
        logger.exception("invite_jobs: could not cancel the queued emails | job=%s", job_id)
        return False
    return True


def _log_failure(job: Mapping[str, Any], err: Exception) -> None:
    """Why ``job`` could not be expanded: a known cause without a traceback, a bug with one."""
    if isinstance(err, _NotReady):
        logger.warning(
            "invite_jobs: students could not be looked up or enrolled | job=%s", job.get("id")
        )
    elif isinstance(err, DatabaseError):
        logger.error("invite_jobs: a database error | job=%s error=%s", job.get("id"), err)
    else:
        logger.error("invite_jobs: failed | job=%s", job.get("id"), exc_info=err)


def _retry_later_or_give_up(client, job: Mapping[str, Any]) -> None:
    """After a failure: try ``job`` again ``RETRY_SECONDS`` from now, which lets the jobs due
    after it go first, or give it up once it is ``GIVE_UP_AFTER`` old. Never raises."""
    job_id = str(job.get("id"))
    now = outbox._now()
    queued_at = _parse_time(job.get("created_at"))
    try:
        if queued_at is not None and now - queued_at > GIVE_UP_AFTER:
            _give_up(client, job)
            return
        client.table("pending_invites").update(
            {"send_at": (now + timedelta(seconds=RETRY_SECONDS)).isoformat()}
        ).eq("id", job_id).eq("sent", False).execute()
    except Exception:
        logger.error("invite_jobs: could not put the job back | job=%s", job_id, exc_info=True)


def _give_up(client, job: Mapping[str, Any]) -> None:
    """Cancel a job that kept failing, and its emails still queued, and tell its instructor.

    Nothing happens to a job sent or cancelled meanwhile.
    """
    job_id = str(job["id"])
    cancelled = (
        client.table("pending_invites")
        .update({"cancelled": True})
        .eq("id", job_id)
        .eq("sent", False)
        .eq("cancelled", False)
        .execute()
    ).data
    if not cancelled:
        return
    cancel_pending_rows(client, job_id)
    logger.error(
        "invite_jobs: gave up on a job that kept failing | job=%s queued_at=%s",
        job_id,
        job.get("created_at"),
    )
    count = len(_addresses(job.get("emails")))
    notifications.notify_email_undeliverable(
        user_id=_text(job.get("instructor_id")),
        to_email=f"{count} address" if count == 1 else f"{count} addresses",
        class_id=_text(job.get("class_id")),
        reason="the scheduled invite kept failing",
    )


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


def _parse_time(value: Any) -> datetime | None:
    """A timestamp as PostgREST sends it (or a datetime), made aware; ``None`` if unreadable."""
    if isinstance(value, datetime):
        moment = value
    elif isinstance(value, str) and value:
        try:
            moment = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None
    return moment if moment.tzinfo is not None else moment.replace(tzinfo=UTC)


def _text(value: Any) -> str | None:
    return None if value is None else str(value)
