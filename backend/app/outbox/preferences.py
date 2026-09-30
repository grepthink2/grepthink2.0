"""Email categories, who opted out of them, addresses not to mail, and unsubscribe links.

Some email can be switched off and some cannot. Deadline reminders and message digests belong
to a *category* a person turns off in their settings or from a link in the email itself.
Transactional email (class invites, verification codes) has no category, so no preference
applies to it. An address that bounced, was rejected or reported us as spam is *suppressed*: the
outbox does not email it.

Until ``2026-09-30_email_preferences.sql`` is applied the two tables do not exist, and this code
works without them (AGENTS.md: never depend on unapplied SQL). Reads answer the defaults, every
category on and no address suppressed; ``set_preferences`` answers 503; ``suppress`` lets the
error out, so the webhook that calls it answers 503 and Maileroo retries. Only PostgREST's and
Postgres's own missing-table codes (``MISSING_TABLE_CODES``) are read that way. An outage or a
missing grant is raised: reading it as "not suppressed" would mail an address that bounced.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime

from fastapi import HTTPException

from app.config import settings
from app.core.db import MISSING_TABLE_CODES
from app.core.errors import DatabaseError
from app.utils.urls import frontend_url, public_api_url

#: category -> (label, description), in the order they are listed. A category is named here and
#: nowhere in the database, so adding one needs no migration. The name goes into unsubscribe
#: tokens and links unquoted: lower-case letters and underscores only.
CATEGORIES: dict[str, tuple[str, str]] = {
    "reminders": ("Deadline reminders", "Emails before a TSR or another deadline closes."),
    "digests": (
        "Unread message digests",
        "A daily email when messages have been waiting over an hour.",
    ),
}

#: Why an address is suppressed: the values ``email_suppressions_reason_check`` allows.
SUPPRESSION_REASONS = frozenset({"bounced", "rejected", "complained"})


# -- preferences -----------------------------------------------------------------------------


def get_preferences(client, user_id: str) -> dict[str, bool]:
    """Every category mapped to whether ``user_id`` wants it. A category with no row is on.

    One read. Rows of categories this code no longer has are ignored.
    """
    prefs = dict.fromkeys(CATEGORIES, True)
    try:
        rows = (
            client.table("email_preferences")
            .select("category, enabled")
            .eq("user_id", user_id)
            .execute()
        ).data or []
    except DatabaseError as exc:
        if exc.pg_code in MISSING_TABLE_CODES:
            return prefs
        raise
    for row in rows:
        if row.get("category") in prefs:
            prefs[row["category"]] = bool(row.get("enabled"))
    return prefs


def set_preferences(client, user_id: str, updates: Mapping[str, bool]) -> dict[str, bool]:
    """Save ``updates`` (category -> wanted) and return every category's choice.

    One read, then one upsert for all the rows. Raises 400 for a category this code does not
    have or a value that is not a boolean (checked before anything is read or written), and 503
    while the table does not exist yet.
    """
    for category in updates:
        if category not in CATEGORIES:
            raise HTTPException(status_code=400, detail=f"Unknown email category: {category}")
    if not all(isinstance(enabled, bool) for enabled in updates.values()):
        raise HTTPException(status_code=400, detail="Preferences must be true or false")

    current = get_preferences(client, user_id)
    if not updates:
        return current

    now = datetime.now(UTC).isoformat()
    rows = [
        {"user_id": user_id, "category": category, "enabled": enabled, "updated_at": now}
        for category, enabled in updates.items()
    ]
    try:
        client.table("email_preferences").upsert(rows, on_conflict="user_id,category").execute()
    except DatabaseError as exc:
        if exc.pg_code in MISSING_TABLE_CODES:
            raise HTTPException(
                status_code=503, detail="Email preferences are not available yet"
            ) from exc
        raise
    return {**current, **updates}


def is_enabled(client, user_id: str | None, category: str | None) -> bool:
    """Whether an email of ``category`` may go to ``user_id``.

    ``True`` without asking the database when there is no category (transactional email), no
    account to hold a preference, or a category this code does not know. Otherwise one read of
    that user's row: no row, or no table yet, means on.
    """
    if not user_id or category not in CATEGORIES:
        return True
    try:
        rows = (
            client.table("email_preferences")
            .select("enabled")
            .eq("user_id", user_id)
            .eq("category", category)
            .execute()
        ).data or []
    except DatabaseError as exc:
        if exc.pg_code in MISSING_TABLE_CODES:
            return True
        raise
    return bool(rows[0].get("enabled")) if rows else True


def preferences_payload(prefs: Mapping[str, bool]) -> list[dict]:
    """``prefs`` as the list an API answers with: every category, in order, with its text."""
    return [
        {
            "category": category,
            "label": label,
            "description": description,
            "enabled": prefs.get(category, True),
        }
        for category, (label, description) in CATEGORIES.items()
    ]


def category_label(category: str) -> str | None:
    """The name people see for ``category``, or ``None`` for one this code does not have."""
    entry = CATEGORIES.get(category)
    return entry[0] if entry else None


# -- suppressions ----------------------------------------------------------------------------


def _address(email: str) -> str:
    """``email`` the way ``email_suppressions`` stores it: trimmed and lower-cased."""
    return email.strip().lower()


def suppression_reason(client, email: str) -> str | None:
    """Why ``email`` must not be mailed (one of ``SUPPRESSION_REASONS``), or ``None``.

    One read. ``None`` while the table does not exist yet.
    """
    try:
        rows = (
            client.table("email_suppressions")
            .select("reason")
            .eq("email", _address(email))
            .execute()
        ).data or []
    except DatabaseError as exc:
        if exc.pg_code in MISSING_TABLE_CODES:
            return None
        raise
    return rows[0].get("reason") if rows else None


#: Addresses per read in ``suppression_reasons``. They travel in the query string, which has a
#: length limit; 100 addresses stay well inside it.
_SUPPRESSION_LOOKUP_CHUNK = 100


def suppression_reasons(client, emails: Iterable[str]) -> dict[str, str]:
    """Each suppressed address among ``emails`` (trimmed, lower-cased) mapped to why.

    One read for up to 100 distinct addresses (one more per further 100), and none when there
    is no address. ``{}`` while the table does not exist yet; any other failure is raised, as
    in ``suppression_reason``.
    """
    addresses = sorted(
        {_address(email) for email in emails if isinstance(email, str) and email.strip()}
    )
    reasons: dict[str, str] = {}
    for start in range(0, len(addresses), _SUPPRESSION_LOOKUP_CHUNK):
        try:
            rows = (
                client.table("email_suppressions")
                .select("email, reason")
                .in_("email", addresses[start : start + _SUPPRESSION_LOOKUP_CHUNK])
                .execute()
            ).data or []
        except DatabaseError as exc:
            if exc.pg_code in MISSING_TABLE_CODES:
                return {}
            raise
        for row in rows:
            if row.get("email") and row.get("reason"):
                reasons[_address(row["email"])] = row["reason"]
    return reasons


def suppress(client, email: str, reason: str, detail: str | None = None) -> None:
    """Record that ``email`` must not be mailed, replacing any earlier reason and detail.

    Raises ``ValueError`` for a reason the table would refuse. A database failure, a missing
    table included, propagates: the webhook that calls this answers 503 so Maileroo retries.
    """
    if reason not in SUPPRESSION_REASONS:
        raise ValueError(f"Unknown suppression reason: {reason!r}")
    client.table("email_suppressions").upsert(
        {"email": _address(email), "reason": reason, "detail": detail}, on_conflict="email"
    ).execute()


# -- unsubscribe tokens ----------------------------------------------------------------------
#
# ``<user id>.<category>.<signature>``, the signature being the unpadded URL-safe base64 of
# HMAC-SHA256 over ``unsubscribe:v1:<user id>:<category>`` and the user id a lower-case,
# hyphenated UUID. A token names one user and one category, and nothing is stored. It sits in
# emails for as long as people keep them, so the format and the key are not changed lightly:
# either one breaks every link already sent.

#: Mixed into the key derived from ``SUPABASE_JWT_SECRET``, so the unsubscribe key is not the
#: JWT secret itself and nothing signed with one can be replayed as the other.
_KEY_DERIVATION_LABEL = b"grepthink/email-unsubscribe/v1"


def _signing_key() -> bytes | None:
    """``EMAIL_UNSUBSCRIBE_SECRET``, else a key derived from ``SUPABASE_JWT_SECRET``, else ``None``.

    Read on every call, not at import, so a changed setting takes effect at once.
    """
    if settings.EMAIL_UNSUBSCRIBE_SECRET:
        return settings.EMAIL_UNSUBSCRIBE_SECRET.encode()
    if settings.SUPABASE_JWT_SECRET:
        return hmac.new(
            settings.SUPABASE_JWT_SECRET.encode(), _KEY_DERIVATION_LABEL, hashlib.sha256
        ).digest()
    return None


def _signature(key: bytes, user_id: str, category: str) -> str:
    digest = hmac.new(key, f"unsubscribe:v1:{user_id}:{category}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _canonical_uuid(value: object) -> str | None:
    """The lower-case, hyphenated UUID that ``value`` spells, or ``None`` if it is not one.

    ``value`` is a string or a ``uuid.UUID`` (any typed id that prints as a UUID will do).
    """
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def make_unsubscribe_token(user_id: str | uuid.UUID, category: str) -> str | None:
    """A signed token that switches ``category`` off for ``user_id``, or ``None`` if none can be made.

    ``user_id`` is a string or a ``uuid.UUID``. ``None`` for a category this code does not have,
    a ``user_id`` that is not a UUID (either would make a token ``read_unsubscribe_token``
    refuses), and when no key is configured. The user id is written in its canonical spelling,
    which is also what the signature covers.
    """
    key = _signing_key()
    user = _canonical_uuid(user_id)
    if key is None or user is None or category not in CATEGORIES:
        return None
    return f"{user}.{category}.{_signature(key, user, category)}"


def read_unsubscribe_token(token: str) -> tuple[str, str] | None:
    """The ``(user_id, category)`` a token was made for, or ``None`` if it is not a genuine one.

    Never raises: the token comes straight out of a URL. ``None`` for anything malformed, signed
    with another key, made for another user or category, or for a category this code no longer
    has. The user id must be spelled the way ``make_unsubscribe_token`` writes it (lower-case,
    hyphenated, ASCII): ``uuid.UUID`` also reads it upper-cased, in braces, without hyphens or
    in non-ASCII digits, but no such token was ever made.
    """
    key = _signing_key()
    if key is None or not isinstance(token, str):
        return None
    parts = token.split(".")
    if len(parts) != 3:
        return None
    user, category, signature = parts
    # compare_digest raises on non-ASCII text, and no signature we made contains any.
    if _canonical_uuid(user) != user or category not in CATEGORIES or not signature.isascii():
        return None
    if not hmac.compare_digest(signature, _signature(key, user, category)):
        return None
    return user, category


def unsubscribe_links(user_id: str | uuid.UUID, category: str) -> tuple[str | None, str | None]:
    """``(page_url, one_click_url)`` that switch ``category`` off for ``user_id``.

    ``page_url`` is the frontend page a person opens from the email. ``one_click_url`` is the API
    endpoint for the ``List-Unsubscribe`` header, ``None`` while ``PUBLIC_API_URL`` is unset (the
    email then carries only the page link). ``(None, None)`` when no token can be made.
    """
    token = make_unsubscribe_token(user_id, category)
    if token is None:
        return None, None
    api = public_api_url()
    return (
        f"{frontend_url()}/unsubscribe?token={token}",
        f"{api}/api/email/unsubscribe?token={token}" if api else None,
    )
