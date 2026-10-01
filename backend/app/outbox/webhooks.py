"""Maileroo webhooks: what became of an email after Maileroo took it.

Maileroo POSTs one event per request to ``POST /api/email/webhooks/maileroo`` (a list of events
is accepted too). ``x-maileroo-signature`` is the hex HMAC-SHA256 of the raw body, keyed with the
shared ``MAILEROO_WEBHOOK_SECRET``. Maileroo retries anything but a 200, so a database failure
is raised here, the webhook answers 503, and the event comes again: handling an event a second
time changes nothing the first time did not, and notifies nobody again.

* ``failed`` (a permanent failure: a bounce) and ``rejected`` (Maileroo would not send it): the
  outbox rows sent under the event's ``message_reference_id`` become ``bounced``, and whoever
  queued one hears in the app if its kind says so. A ``failed`` address is suppressed
  (``bounced``), so the outbox does not email it again. A rejection may be about the message
  rather than the address, so its address is suppressed (``rejected``) only when the reason says
  the recipient was refused (on a suppression list, unknown, blocked, ...); otherwise the
  rejection is logged and the address left alone.
* ``complained`` (reported as spam): the address is suppressed (``complained``).
* ``delivered``: the rows' ``delivered_at`` is recorded, once.
* Anything else (``accepted``, ``deferred``, ``opened``, ``clicked``) is ignored.

An event names its addresses in ``event_data.to``: one address, or a list in a rejection, whose
reason is ``reject_reason`` rather than ``reason``. Before ``2026-09-30_email_outbox.sql`` there
are no rows to mark, and the suppression is still recorded.

Logs name the event type and the reference, never an address or a reason: a bounce reason
quotes the address.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import re
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from typing import Any

from postgrest.types import CountMethod, ReturnMethod

from app.core.db import MISSING_TABLE_CODES
from app.core.errors import DatabaseError
from app.outbox import controller as outbox
from app.outbox.kinds import Kind, get_kind
from app.outbox.preferences import normalize_email, suppress

logger = logging.getLogger(__name__)

#: The suppression reason each undelivered event type records.
_SUPPRESSED_AS = {"failed": "bounced", "rejected": "rejected"}
#: A rejection is about the message as a whole ("malformed email or previously bounced
#: recipient", Maileroo says). It suppresses the address only when its reason says the recipient
#: was refused: "One or more of the recipients are on the suppression list", say.
_RECIPIENT_REFUSED = re.compile(
    r"bounce|suppress|block|invalid recipient|does not exist|unknown user", re.IGNORECASE
)
#: What the creator of an undelivered email reads: "couldn't be delivered (<this>)".
_UNDELIVERED_BECAUSE = {"failed": "the address bounced", "rejected": "the address was rejected"}
#: ``last_error`` and a suppression's ``detail`` are cut to this many characters.
_REASON_LIMIT = 500


def _now() -> datetime:
    """The current time in UTC. Tests replace it."""
    return datetime.now(UTC)


def verify_signature(secret: str, body: bytes, signature: str | None) -> bool:
    """Whether ``signature`` is the hex HMAC-SHA256 of the raw ``body`` keyed with ``secret``.

    Compared in constant time, ignoring surrounding whitespace and the case of the hex digits.
    ``False`` without a secret or a signature, and for a signature that is not ASCII (no digest
    is, and ``compare_digest`` would raise on it).
    """
    if not secret or not signature:
        return False
    supplied = signature.strip()
    if not supplied.isascii():
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(supplied.lower(), expected)


def handle_event(client, event: Mapping[str, Any]) -> str:
    """Record what one Maileroo event says.

    Returns what it did, for the log and the tests: "bounced", "suppressed", "delivered" or
    "ignored". Idempotent (see the module docstring). Raises ``DatabaseError`` when it cannot
    record the event, except that an outbox table that does not exist yet only skips the rows.
    Anything that is not an event object, or whose ``event_data`` is not an object, is ignored.
    """
    if not isinstance(event, Mapping):
        logger.warning("maileroo_webhook: ignored an event that is not an object")
        return "ignored"
    event_type = event.get("event_type")
    data = event.get("event_data") or {}
    ref = _reference(event.get("message_reference_id"))
    if not isinstance(event_type, str) or not isinstance(data, Mapping):
        logger.warning("maileroo_webhook: ignored a malformed event | ref=%s", ref)
        return "ignored"
    event_type = event_type.strip().lower()

    if event_type in _SUPPRESSED_AS:
        bounced = _undelivered(client, event_type, ref, data)
        logger.info("maileroo_webhook: bounced | event=%s ref=%s rows=%d", event_type, ref, bounced)
        return "bounced"
    if event_type == "complained":
        for address in _addresses(data.get("to")):
            suppress(client, address, "complained", _reason(data, event_type))
        logger.info("maileroo_webhook: suppressed | event=%s ref=%s", event_type, ref)
        return "suppressed"
    if event_type == "delivered":
        _delivered(client, ref, event.get("event_time"))
        logger.info("maileroo_webhook: delivered | event=%s ref=%s", event_type, ref)
        return "delivered"
    logger.debug("maileroo_webhook: ignored | event=%s ref=%s", event_type, ref)
    return "ignored"


def _undelivered(client, event_type: str, ref: str | None, data: Mapping[str, Any]) -> int:
    """A ``failed`` or ``rejected`` event: bounce its rows, then suppress its addresses.

    A row is bounced only when the event names its recipient (or names no address at all): an
    event about a copy of the email (a cc or bcc address) suppresses that address and leaves the
    recipient's row alone. The address suppressed is the event's, else the rows' recipients; a
    rejection whose reason does not say the recipient was refused (``_RECIPIENT_REFUSED``)
    suppresses nothing. Returns how many rows this call bounced.
    """
    addresses = _addresses(data.get("to"))
    reason = _reason(data, event_type)
    rows = _rows_sent_as(client, ref)
    bounced = 0
    for row in rows:
        if addresses and _recipient(row) not in addresses:
            continue
        if row.get("status") == "bounced" or not _bounce(client, row, reason):
            continue  # a replay, or a concurrent delivery of this event, got there first
        bounced += 1
        outbox._notify_creator(_kind_of(row), row, _UNDELIVERED_BECAUSE[event_type])
    if event_type == "rejected" and not _refuses_the_recipient(data):
        # Something about the message, not the address: the address may be fine.
        logger.warning(
            "maileroo_webhook: rejected for a reason that is not the recipient, address not "
            "suppressed | event=%s ref=%s",
            event_type,
            ref,
        )
        return bounced
    for address in addresses or _recipients(rows):
        suppress(client, address, _SUPPRESSED_AS[event_type], reason)
    return bounced


def _rows_sent_as(client, ref: str | None) -> list[dict]:
    """The outbox rows sent under ``ref``: none without one, or before the outbox migration."""
    if not ref:
        return []
    try:
        result = (
            client.table("email_outbox")
            .select("id, kind, to_email, class_id, created_by, status")
            .eq("provider_reference_id", ref)
            .execute()
        )
    except DatabaseError as exc:
        if exc.pg_code in MISSING_TABLE_CODES:
            return []
        raise
    return list(result.data or [])


def _bounce(client, row: Mapping[str, Any], reason: str) -> bool:
    """Mark ``row`` bounced unless it already is. Whether this call changed it."""
    result = (
        client.table("email_outbox")
        .update(
            {"status": "bounced", "last_error": reason, "updated_at": _now().isoformat()},
            count=CountMethod.exact,
            returning=ReturnMethod.minimal,
        )
        .eq("id", str(row["id"]))
        .neq("status", "bounced")
        .execute()
    )
    # PostgREST reports the count in Content-Range. Without one, assume the write applied.
    return bool(result.count if result.count is not None else 1)


def _delivered(client, ref: str | None, event_time: Any) -> None:
    """Record when the rows sent under ``ref`` were delivered, unless that is known already."""
    if not ref:
        return
    try:
        client.table("email_outbox").update(
            {
                "delivered_at": _event_time(event_time).isoformat(),
                "updated_at": _now().isoformat(),
            },
            returning=ReturnMethod.minimal,
        ).eq("provider_reference_id", ref).is_("delivered_at", "null").execute()
    except DatabaseError as exc:
        if exc.pg_code not in MISSING_TABLE_CODES:
            raise


# -- reading an event ------------------------------------------------------------------------


def _reference(value: Any) -> str | None:
    """The event's ``message_reference_id``, or ``None`` when it has none."""
    return (value.strip() or None) if isinstance(value, str) else None


def _addresses(value: Any) -> list[str]:
    """The addresses ``event_data.to`` names (one, or a list), normalized, in order, once each."""
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list | tuple):
        return []
    found = (normalize_email(item) for item in value if isinstance(item, str))
    return list(dict.fromkeys(address for address in found if "@" in address))


def _reason(data: Mapping[str, Any], event_type: str) -> str:
    """Why, in Maileroo's words (``reason``, or ``reject_reason``), else the event type."""
    return str(data.get("reason") or data.get("reject_reason") or event_type)[:_REASON_LIMIT]


def _refuses_the_recipient(data: Mapping[str, Any]) -> bool:
    """Whether a rejection's reason (all of it) says the recipient was refused, not the message."""
    text = str(data.get("reason") or data.get("reject_reason") or "")
    return _RECIPIENT_REFUSED.search(text) is not None


def _event_time(value: Any) -> datetime:
    """When the event happened (Maileroo sends Unix seconds), or now when that cannot be read."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        try:
            return datetime.fromtimestamp(value, UTC)
        except (OverflowError, OSError, ValueError):
            pass
    return _now()


def _recipient(row: Mapping[str, Any]) -> str:
    """The row's address, normalized ("" when it has none)."""
    address = row.get("to_email")
    return normalize_email(address) if isinstance(address, str) else ""


def _recipients(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """The rows' addresses, normalized, in order, once each."""
    return list(dict.fromkeys(address for address in map(_recipient, rows) if address))


def _kind_of(row: Mapping[str, Any]) -> Kind | None:
    name = row.get("kind")
    return get_kind(name) if isinstance(name, str) else None
