"""Institutions: the schools classes belong to.

Maintainers add the rows by hand (``supabase/README.md``, "Institutions"); the app only reads
them. The table is a handful of rows read on hot paths (every class list, every school-email
check), so the list is cached in process for five minutes: a newly added school shows up within
that long.

Until ``2026-09-25_institutions.sql`` is applied the table does not exist. ``load_institutions``
then answers ``None`` and every caller keeps the behaviour from before institutions: no schools,
and ``.edu`` is the only school email. AGENTS.md: code must work on the schema that is live.
"""

from __future__ import annotations

import logging
import threading
import time

from app.core.db import get_client
from app.core.errors import DatabaseError

logger = logging.getLogger(__name__)

INSTITUTION_COLUMNS = "id, name, slug, email_domains"

#: How long the list is served from memory. A school a maintainer adds appears within this long.
_TTL_SECONDS = 300.0
#: How long "the table cannot be read" is remembered before the next attempt.
_UNAVAILABLE_TTL_SECONDS = 60.0

_lock = threading.Lock()
#: ``(expires_at, institutions or None)``; ``expires_at`` is on the ``time.monotonic()`` clock.
_cache: tuple[float, list[dict] | None] | None = None


def _normalized(row: dict) -> dict:
    domains = [str(d).strip().lower() for d in (row.get("email_domains") or []) if str(d).strip()]
    return {
        "id": str(row["id"]),
        "name": row.get("name") or "",
        "slug": row.get("slug") or "",
        "email_domains": domains,
    }


def load_institutions() -> list[dict] | None:
    """Every institution as ``{id, name, slug, email_domains}``, ordered by name.

    ``None`` when the table cannot be read (the migration is not applied yet, or the database
    failed). Callers treat that as "no institutions", and must not select
    ``classes.institution_id`` either: the column arrives with the table.
    """
    global _cache
    now = time.monotonic()
    with _lock:
        if _cache is not None and _cache[0] > now:
            return _cache[1]
    try:
        rows = (
            get_client().table("institutions").select(INSTITUTION_COLUMNS).order("name").execute()
        ).data or []
        value: list[dict] | None = [_normalized(row) for row in rows]
        ttl = _TTL_SECONDS
    except DatabaseError:
        logger.warning("institutions: table unreadable, treating it as empty", exc_info=True)
        value, ttl = None, _UNAVAILABLE_TTL_SECONDS
    with _lock:
        _cache = (now + ttl, value)
    return value


def clear_institutions_cache() -> None:
    """Forget the cached list, so the next read goes to the database."""
    global _cache
    with _lock:
        _cache = None


def institution_summaries() -> dict[str, dict]:
    """``{id: {id, name, slug}}`` for every institution: what a class row embeds."""
    return {
        i["id"]: {"id": i["id"], "name": i["name"], "slug": i["slug"]}
        for i in load_institutions() or []
    }


def is_known_institution(institution_id) -> bool:
    """True when ``institution_id`` names an existing institution."""
    return str(institution_id) in {i["id"] for i in load_institutions() or []}


def email_domain(email: str | None) -> str:
    """The lower-cased part after the last ``@``, or ``""`` when there is none."""
    address = (email or "").strip().lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


def is_school_email(email: str | None) -> bool:
    """True for an address at a school.

    Its domain ends in ``.edu`` (so US schools that have not been added still count), or is one
    of an institution's ``email_domains``, or a subdomain of one: ``stu.istinye.edu.tr`` matches
    ``istinye.edu.tr``; ``evil-istinye.edu.tr`` does not.
    """
    domain = email_domain(email)
    if not domain:
        return False
    if domain.endswith(".edu"):
        return True
    return any(
        domain == allowed or domain.endswith(f".{allowed}")
        for institution in load_institutions() or []
        for allowed in institution["email_domains"]
    )
