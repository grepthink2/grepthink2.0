"""Maileroo webhooks: what became of an email after Maileroo took it.

Maileroo POSTs one event per request to ``POST /api/email/webhooks/maileroo`` (a list of events
is accepted too). ``x-maileroo-signature`` is the hex HMAC-SHA256 of the raw body, keyed with the
shared ``MAILEROO_WEBHOOK_SECRET``. An event that does not get a 200 is sent again, 8 times over
about 14 hours (5 minutes after the first try, then up to 6 hours apart), and then dropped. So a
database failure is raised here, the webhook answers 503, and the event comes again: handling an
event a second time changes nothing the first time did not, and notifies nobody again.

* ``failed`` (a permanent failure: a bounce): the outbox rows sent under the event's
  ``message_reference_id`` become ``bounced``, whoever queued one hears in the app if its kind
  says so, and the address is suppressed (``bounced``), so the outbox does not email it again.
* ``rejected`` (Maileroo would not send it: "malformed email or previously bounced recipient"):
  the rows are bounced and their creator told as well. A rejection is about the email as a
  whole, so the address is suppressed (``rejected``) only when the email had one recipient and
  the reason names that recipient (``_RECIPIENT_REFUSED``: a suppression list, an unknown
  mailbox). Otherwise nobody is suppressed, the creator reads that the mail server rejected the
  email, and the rejection is logged.
* ``complained`` (reported as spam): the address is suppressed (``complained``).
* ``delivered``: the rows' ``delivered_at`` is recorded, once, unless they bounced.
* Anything else (``accepted``, ``deferred``, ``opened``, ``clicked``) is ignored.

An event names its addresses in ``event_data.to``: one, or a list in a rejection (whose reason is
``reject_reason`` rather than ``reason``), possibly with display names. A row is the event's when
the event names the row's recipient, or names no address at all: an event about a copy of an
email (a cc or bcc address) leaves the recipient's row alone. An event that names no address is
about the recipients of its rows. Before ``2026-09-30_email_outbox.sql`` there are no rows, and a
suppression is still recorded.

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
from email.utils import parseaddr
from typing import Any

from postgrest.types import CountMethod, ReturnMethod

from app.core.db import MISSING_TABLE_CODES
from app.core.errors import DatabaseError
from app.outbox import controller as outbox
from app.outbox.kinds import Kind, get_kind
from app.outbox.preferences import normalize_email, suppress

logger = logging.getLogger(__name__)

#: A rejection reason that names the recipient, not the email or its sender: only then is the
#: address suppressed. Maileroo's own reads "One or more of the recipients are on the suppression
#: list". "Message blocked as spam content" or "Sender address is invalid" suppress nobody.
_RECIPIENT_REFUSED = re.compile(
    r"suppression list"
    r"|previously bounced"
    r"|(?<!sender )(?<!from )(?<!ip )(?<!sending )(?<!reply-to )"
    r"\b(?:recipient|mailbox|address)\b[^.]{0,40}"
    r"\b(?:blocked|invalid|unknown|does not exist|not found)\b"
    r"|\b(?:invalid|unknown|nonexistent|non-existent) (?:recipient|user|mailbox|address)\b",
    re.IGNORECASE,
)

#: What the creator of an undelivered email reads: "couldn't be delivered (<this>)".
_BOUNCED = "the address bounced"
_ADDRESS_REJECTED = "the address was rejected"
_EMAIL_REJECTED = "the mail server rejected the email"

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
    addresses = _addresses(data.get("to"))

    if event_type in ("failed", "rejected"):
        bounced = _undelivered(client, event_type, ref, addresses, data)
        logger.info("maileroo_webhook: bounced | event=%s ref=%s rows=%d", event_type, ref, bounced)
        return "bounced"
    if event_type == "complained":
        for address in addresses or _recipients(_rows_sent_as(client, ref)):
            suppress(client, address, "complained", _reason(data, event_type))
        logger.info("maileroo_webhook: suppressed | event=%s ref=%s", event_type, ref)
        return "suppressed"
    if event_type == "delivered":
        stamped = _delivered(client, ref, addresses, event.get("event_time"))
        logger.info(
            "maileroo_webhook: delivered | event=%s ref=%s rows=%d", event_type, ref, stamped
        )
        return "delivered"
    logger.debug("maileroo_webhook: ignored | event=%s ref=%s", event_type, ref)
    return "ignored"


def _undelivered(
    client, event_type: str, ref: str | None, addresses: list[str], data: Mapping[str, Any]
) -> int:
    """A ``failed`` or ``rejected`` event: bounce its rows, tell their creators, suppress.

    What is suppressed, and what the creators read, is ``_verdict``'s. The addresses suppressed
    are the event's, else the recipients of its rows. Returns how many rows this call bounced.
    """
    reason = _reason(data, event_type)
    sent = _rows_sent_as(client, ref)
    rows = _rows_about(sent, addresses)
    suppress_as, because = _verdict(event_type, ref, addresses, sent, data)
    bounced = 0
    for row in rows:
        if row.get("status") == "bounced" or not _bounce(client, row, reason):
            continue  # a replay, or a concurrent delivery of this event, got there first
        bounced += 1
        outbox._notify_creator(_kind_of(row), row, because)
    if suppress_as is not None:
        for address in addresses or _recipients(rows):
            suppress(client, address, suppress_as, reason)
    return bounced


def _verdict(
    event_type: str,
    ref: str | None,
    addresses: list[str],
    sent: Sequence[Mapping[str, Any]],
    data: Mapping[str, Any],
) -> tuple[str | None, str]:
    """``(suppression reason or None, what the creator reads)`` for an undelivered event.

    A bounce names the address that failed. A rejection is of the whole email: the address is
    suppressed only when the email had one recipient (no other address in the event, no cc or
    bcc on its row) and the reason names that recipient. Which of several recipients made Maileroo
    refuse the email cannot be told, and the email itself may have been at fault.
    """
    if event_type == "failed":
        return "bounced", _BOUNCED
    if len(addresses) > 1 or any(_has_copies(row) for row in sent):
        logger.warning(
            "maileroo_webhook: rejected an email with several recipients, nobody suppressed | "
            "event=%s ref=%s",
            event_type,
            ref,
        )
        return None, _EMAIL_REJECTED
    if not _RECIPIENT_REFUSED.search(_full_reason(data)):
        logger.warning(
            "maileroo_webhook: rejected for a reason that is not the recipient, address not "
            "suppressed | event=%s ref=%s",
            event_type,
            ref,
        )
        return None, _EMAIL_REJECTED
    return "rejected", _ADDRESS_REJECTED


def _rows_sent_as(client, ref: str | None) -> list[dict]:
    """The outbox rows sent under ``ref``: none without one, or before the outbox migration."""
    if not ref:
        return []
    try:
        result = (
            client.table("email_outbox")
            .select("id, kind, to_email, class_id, created_by, status, payload")
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
    return _changed(result)


def _delivered(client, ref: str | None, addresses: list[str], event_time: Any) -> int:
    """Record when the event's rows were delivered, unless that is known or they bounced.

    Returns how many rows this call stamped.
    """
    stamped = 0
    for row in _rows_about(_rows_sent_as(client, ref), addresses):
        if row.get("status") == "bounced":
            continue
        result = (
            client.table("email_outbox")
            .update(
                {
                    "delivered_at": _event_time(event_time).isoformat(),
                    "updated_at": _now().isoformat(),
                },
                count=CountMethod.exact,
                returning=ReturnMethod.minimal,
            )
            .eq("id", str(row["id"]))
            .is_("delivered_at", "null")
            .neq("status", "bounced")
            .execute()
        )
        stamped += _changed(result)
    return stamped


def _changed(result: Any) -> bool:
    """Whether an update changed its row. PostgREST reports the count in Content-Range; without
    one, the write is assumed to have applied."""
    return bool(result.count if result.count is not None else 1)


# -- reading an event ------------------------------------------------------------------------


def _reference(value: Any) -> str | None:
    """The event's ``message_reference_id``, or ``None`` when it has none."""
    return (value.strip() or None) if isinstance(value, str) else None


def _addresses(value: Any) -> list[str]:
    """The addresses ``event_data.to`` names (one, or a list), normalized, in order, once each.

    "Student <s@x.edu>" names ``s@x.edu``; something that names no address is left out.
    """
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list | tuple):
        return []
    found = (normalize_email(parseaddr(item)[1]) for item in value if isinstance(item, str))
    return list(dict.fromkeys(address for address in found if "@" in address))


def _reason(data: Mapping[str, Any], event_type: str) -> str:
    """Why, in Maileroo's words (``reason``, or ``reject_reason``), else the event type; cut to
    the length that is stored."""
    return str(data.get("reason") or data.get("reject_reason") or event_type)[:_REASON_LIMIT]


def _full_reason(data: Mapping[str, Any]) -> str:
    """The whole reason, for reading (``_RECIPIENT_REFUSED``); "" when there is none."""
    return str(data.get("reason") or data.get("reject_reason") or "")


def _event_time(value: Any) -> datetime:
    """When the event happened (Maileroo sends Unix seconds), or now when that cannot be read."""
    if isinstance(value, int | float) and not isinstance(value, bool):
        try:
            return datetime.fromtimestamp(value, UTC)
        except (OverflowError, OSError, ValueError):
            pass
    return _now()


# -- reading the rows ------------------------------------------------------------------------


def _rows_about(rows: Sequence[Mapping[str, Any]], addresses: list[str]) -> list[Mapping[str, Any]]:
    """The rows an event is about: those whose recipient it names, or all when it names none."""
    return [row for row in rows if not addresses or _recipient(row) in addresses]


def _recipient(row: Mapping[str, Any]) -> str:
    """The row's address, normalized ("" when it has none)."""
    address = row.get("to_email")
    return normalize_email(address) if isinstance(address, str) else ""


def _recipients(rows: Sequence[Mapping[str, Any]]) -> list[str]:
    """The rows' addresses, normalized, in order, once each."""
    return list(dict.fromkeys(address for address in map(_recipient, rows) if address))


def _has_copies(row: Mapping[str, Any]) -> bool:
    """Whether the row's email went to cc or bcc addresses too (a custom invite's copies)."""
    payload = row.get("payload")
    if not isinstance(payload, Mapping):
        return False
    return any(
        isinstance(copies, list | tuple)
        and any(isinstance(address, str) and address.strip() for address in copies)
        for copies in (payload.get("cc"), payload.get("bcc"))
    )


def _kind_of(row: Mapping[str, Any]) -> Kind | None:
    name = row.get("kind")
    return get_kind(name) if isinstance(name, str) else None
