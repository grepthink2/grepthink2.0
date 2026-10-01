"""HTTP handlers for the email routes: dispatch, the Maileroo webhook, unsubscribe, preferences.

Only the preferences need a signed-in user. The other routes are public and rate-limited, each
with its own credential: the dispatch secret (``pg_cron``), the webhook signature (Maileroo) or
the signed token in an unsubscribe link (whoever got the email).
"""

from __future__ import annotations

import hmac
import json
import logging

from fastapi import Depends, HTTPException, Request
from slowapi.util import get_remote_address
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.core.db import FOREIGN_KEY_VIOLATION, MISSING_TABLE_CODES, get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.dependencies import require_user
from app.limiter import limiter
from app.outbox import controller as outbox
from app.outbox import webhooks
from app.outbox.models import EmailPreferencesUpdate
from app.outbox.preferences import (
    category_label,
    get_preferences,
    preferences_payload,
    read_unsubscribe_token,
    set_preferences,
)

logger = logging.getLogger(__name__)

INVALID_UNSUBSCRIBE_LINK = "This unsubscribe link isn't valid."

#: The rate-limit bucket of dispatch calls that carry the right token (``_dispatch_rate_key``).
AUTHORIZED_DISPATCH_KEY = "email-dispatch-authorized"
#: The largest webhook body read, in bytes: Maileroo's events are a kilobyte or two.
MAX_WEBHOOK_BODY = 262_144


# -- the dispatcher and the webhook (internal) -------------------------------------------------


def _is_bearer(header: str | None, secret: str) -> bool:
    """Whether ``header`` is exactly ``Bearer <secret>``, compared in constant time.

    ``compare_digest`` raises on text that is not ASCII, so a header (or a secret) that is not
    ASCII never matches instead.
    """
    expected = f"Bearer {secret}"
    return bool(
        header and header.isascii() and expected.isascii() and hmac.compare_digest(header, expected)
    )


def _dispatch_rate_key(request: Request) -> str:
    """The rate-limit bucket of a dispatch call: calls with the right token have one of their own.

    The others share their address's bucket. On Vercel that address is the proxy's, so without a
    bucket of its own the schedule could be starved by anyone calling 30 times a minute.
    """
    secret = settings.EMAIL_DISPATCH_SECRET
    if secret and _is_bearer(request.headers.get("authorization"), secret):
        return AUTHORIZED_DISPATCH_KEY
    return get_remote_address(request)


@limiter.limit("30/minute", key_func=_dispatch_rate_key)
def dispatch(request: Request):
    """One dispatcher run (``outbox.dispatch_tick``), for the ``pg_cron`` schedule.

    Needs ``Authorization: Bearer <EMAIL_DISPATCH_SECRET>`` (401 otherwise, logged without the
    header). While that secret is unset the route is off (404) and the API dispatches from inside
    its own process instead (``app.jobs.email_dispatch``). Answers the run's counts.
    """
    secret = settings.EMAIL_DISPATCH_SECRET
    if not secret:
        raise HTTPException(status_code=404, detail="Not Found")
    if not _is_bearer(request.headers.get("authorization"), secret):
        logger.warning("dispatch: rejected a call with a wrong or missing token")
        raise HTTPException(status_code=401, detail="Invalid dispatch token")
    return outbox.dispatch_tick(budget_seconds=settings.EMAIL_DISPATCH_BUDGET_SECONDS)


@limiter.limit("600/minute")
async def maileroo_webhook(request: Request):
    """Maileroo's delivery events (bounces, rejections, complaints, deliveries): ``webhooks``.

    The body is one event or a list of them, signed with ``MAILEROO_WEBHOOK_SECRET`` in
    ``x-maileroo-signature`` (401 when missing or wrong; 400 when the body is not JSON; 413 over
    ``MAX_WEBHOOK_BODY`` bytes). Maileroo sends an event that does not get a 200 again, 8 times
    over about 14 hours, and handling an event again is harmless: so the answer is 503 while the
    secret is unset or while an event cannot be recorded.
    """
    secret = settings.MAILEROO_WEBHOOK_SECRET
    if not secret:
        raise HTTPException(status_code=503, detail="Webhook not configured")
    body = await _read_body(request)
    if not webhooks.verify_signature(secret, body, request.headers.get("x-maileroo-signature")):
        raise HTTPException(status_code=401, detail="Invalid signature")
    try:
        payload = json.loads(body)
    except ValueError:  # not JSON, or not text at all
        raise HTTPException(status_code=400, detail="The body is not JSON") from None
    events = payload if isinstance(payload, list) else [payload]
    try:
        await run_in_threadpool(_handle_events, events)
    except DatabaseError as err:
        # Expected before the migration (no suppressions table) or in an outage; anything else
        # (a missing grant, say) needs a developer.
        expected = isinstance(err, DatabaseUnavailableError) or err.pg_code in MISSING_TABLE_CODES
        log = logger.warning if expected else logger.error
        log(
            "maileroo_webhook: could not record the event, Maileroo will retry | pg_code=%s",
            err.pg_code,
            exc_info=err,
        )
        raise HTTPException(status_code=503, detail="Could not record the event") from err
    return {"ok": True}


async def _read_body(request: Request) -> bytes:
    """The request body, or 413 when it is over ``MAX_WEBHOOK_BODY`` bytes.

    A ``Content-Length`` over the limit is refused before anything is read; without one, the
    body is read in chunks and the reading stops as soon as it passes the limit.
    """
    try:
        declared = int(request.headers.get("content-length", ""))
    except ValueError:
        declared = None
    if declared is not None and declared > MAX_WEBHOOK_BODY:
        raise HTTPException(status_code=413, detail="The body is too large")
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_WEBHOOK_BODY:
            raise HTTPException(status_code=413, detail="The body is too large")
    return bytes(body)


def _handle_events(events: list) -> list[str]:
    client = get_client()
    return [webhooks.handle_event(client, event) for event in events]


# -- unsubscribe links (public) ----------------------------------------------------------------


@limiter.limit("30/minute")
def unsubscribe_info(request: Request, token: str = ""):
    """What an unsubscribe link is for, for the page it opens. Changes nothing.

    ``{"valid": true, "category", "label"}``, or ``{"valid": false}`` for a token that is
    missing, malformed or not signed by us.
    """
    found = read_unsubscribe_token(token)
    if found is None:
        return {"valid": False}
    _, category = found
    return {"valid": True, "category": category, "label": category_label(category)}


@limiter.limit("30/minute")
def unsubscribe(request: Request, token: str = ""):
    """Switch off the category an unsubscribe link names, for the account it names.

    From the page (after the reader confirms), and the RFC 8058 one-click target of the
    ``List-Unsubscribe`` header, whose form body (``List-Unsubscribe=One-Click``) is ignored.
    400 for a token that is not valid; 503 before the preferences migration.
    """
    found = read_unsubscribe_token(token)
    if found is None:
        raise HTTPException(status_code=400, detail=INVALID_UNSUBSCRIBE_LINK)
    user_id, category = found
    try:
        set_preferences(get_client(), user_id, {category: False})
    except DatabaseError as err:
        # 23503: the account (the profile its preference row references) is gone, and nothing
        # is emailed to it any more, so the link has done its job.
        if err.pg_code != FOREIGN_KEY_VIOLATION:
            raise
    return {"unsubscribed": True, "category": category, "label": category_label(category)}


# -- preferences (signed in) -------------------------------------------------------------------


def get_email_preferences(user_id: str = Depends(require_user)):
    """The caller's email categories: ``{"preferences": [{category, label, description, enabled}]}``."""
    return {"preferences": preferences_payload(get_preferences(get_client(), user_id))}


def update_email_preferences(data: EmailPreferencesUpdate, user_id: str = Depends(require_user)):
    """Save the categories in the body (category -> on/off) and answer the full list.

    400 for an unknown category or a value that is not a boolean; 503 before the migration.
    """
    saved = set_preferences(get_client(), user_id, data.preferences)
    return {"preferences": preferences_payload(saved)}
