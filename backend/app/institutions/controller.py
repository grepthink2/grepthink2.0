"""Institutions: the schools classes belong to.

Maintainers add the rows by hand (``supabase/README.md``, "Institutions"); the app only reads
them. The table is a handful of rows read on hot paths (every class list, every school-email
check), so the list is cached in process for five minutes: a newly added school shows up within
that long.

Until ``2026-09-25_institutions.sql`` is applied the table does not exist. ``load_institutions``
then answers ``None`` and every caller keeps the behaviour from before institutions: no schools,
and ``.edu`` is the only school email. AGENTS.md: code must work on the schema that is live.

``None`` means specifically "the table does not exist" (PostgREST's or Postgres's own
missing-table codes) — never "some read failed". Any other database failure keeps serving the
last known-good list instead, the same way ``app.auth.controller.get_user_role`` never caches a
failure as "no role": a dropped connection or a missing grant is an outage, and treating it as
"not migrated yet" would answer a whole class of requests wrong for up to a minute.
"""

from __future__ import annotations

import logging
import re
import threading
import time
from uuid import UUID

from app.core.db import get_client, retry_on_disconnect
from app.core.errors import DatabaseError, DatabaseUnavailableError

logger = logging.getLogger(__name__)

INSTITUTION_COLUMNS = "id, name, slug, email_domains"

#: How long a good list is served from memory. A school a maintainer adds appears within this long.
_TTL_SECONDS = 300.0
#: How long "the table does not exist" is remembered before the next attempt. Only the codes in
#: ``_MISSING_TABLE_CODES`` get this treatment.
_MISSING_TABLE_TTL_SECONDS = 60.0
#: How long a stale-but-good list is re-served after some other read failure, before retrying.
_STALE_TTL_SECONDS = 10.0

#: PostgREST's and Postgres's own "this table does not exist" codes — the only failures that
#: mean "the migration has not been applied yet". Anything else (a timeout, a dropped
#: connection, a missing grant, ...) is a real outage, not a schema state.
_MISSING_TABLE_CODES = frozenset({"PGRST205", "42P01"})

_lock = threading.Lock()
#: ``(expires_at, institutions or None)``; ``expires_at`` is on the ``time.monotonic()`` clock.
#: A failure that falls back to the last good list (see ``load_institutions``) re-arms this same
#: entry rather than clearing it, so that list survives until a fetch actually succeeds again.
_cache: tuple[float, list[dict] | None] | None = None


#: A usable email domain once normalized: two or more dot-separated labels of ASCII letters,
#: digits and hyphens. Anything else (a whole address pasted in, a space inside, a bare TLD
#: like ``com``) could never match an address, or would match far too many.
_HOSTNAME = re.compile(r"[a-z0-9-]+(?:\.[a-z0-9-]+)+")

#: A two-label public suffix: a registry category under a two-letter country code (``edu.tr``,
#: ``ac.uk``, ``co.jp``, ...). A maintainer could paste one meaning "our .edu.tr address", and
#: under the subdomain rule in ``is_school_email`` it would grant every school under it — every
#: Turkish university for ``edu.tr``, not just the one the maintainer meant.
_PUBLIC_SUFFIX = re.compile(r"(?:ac|co|com|edu|gov|net|org|sch|k12)\.[a-z]{2}")


def _normalized_domain(raw: object) -> str | None:
    """A domain the way ``is_school_email`` matches it, or ``None`` when it is not usable.

    Trimmed, lower-cased, and stripped of leading ``@`` and ``.`` characters in any order and of
    trailing dots (someone pastes ``@ucsc.edu``, ``.@ucsc.edu`` or ``ucsc.edu.`` into the
    maintainer's insert). ``None`` when what is left is not hostname-shaped (``_HOSTNAME``) or is
    a bare two-label public suffix (``_PUBLIC_SUFFIX``).
    """
    domain = str(raw).strip().lower().lstrip("@.").rstrip(".")
    if not _HOSTNAME.fullmatch(domain) or _PUBLIC_SUFFIX.fullmatch(domain):
        return None
    return domain


def _normalized(row: dict) -> dict:
    slug = row.get("slug") or ""
    domains = []
    for raw in row.get("email_domains") or []:
        domain = _normalized_domain(raw)
        if domain is None:
            # A maintainer's typo in the row. Logged so it can be fixed, because it grants
            # nothing: an entry nothing can match, or a public suffix that would match too much.
            logger.warning(
                "institutions: dropped email domain %r of %r: not one school's own domain",
                raw,
                slug,
            )
            continue
        domains.append(domain)
    return {
        "id": str(row["id"]),
        "name": row.get("name") or "",
        "slug": slug,
        "email_domains": domains,
    }


@retry_on_disconnect()
def _fetch_institutions() -> list[dict]:
    """One read of the institutions table, normalized. Retried once on a dropped connection."""
    rows = (
        get_client().table("institutions").select(INSTITUTION_COLUMNS).order("name").execute()
    ).data or []
    return [_normalized(row) for row in rows]


def load_institutions() -> list[dict] | None:
    """Every institution as ``{id, name, slug, email_domains}``.

    ``None`` only when the ``institutions`` table itself does not exist (the migration has not
    been applied yet). Any other failure — a timeout, a dropped connection (retried once), a
    missing grant — keeps serving the last known-good list instead, even one whose TTL already
    expired; with no previous list to fall back to, it re-raises the ``DatabaseError``, so the
    caller answers 503/500 like any other failed read instead of a wrong "no institutions".

    The returned list, and every dict in it, is shared with the cache and every other caller:
    treat it as read-only.
    """
    global _cache
    now = time.monotonic()
    with _lock:
        if _cache is not None and _cache[0] > now:
            return _cache[1]

    try:
        value = _fetch_institutions()
    except DatabaseError as exc:
        if exc.pg_code in _MISSING_TABLE_CODES:
            logger.warning("institutions: table not found, treating it as empty", exc_info=True)
            with _lock:
                _cache = (now + _MISSING_TABLE_TTL_SECONDS, None)
            return None
        with _lock:
            previous = _cache[1] if _cache is not None else None
        if previous is None:
            raise
        # Same split as ``app.core.errors._app_error``: a dropped connection is expected to
        # clear on its own, but anything else (a missing grant, a bad query) is a standing
        # misconfiguration that should page someone even though a stale list is still served.
        log = logger.warning if isinstance(exc, DatabaseUnavailableError) else logger.error
        log("institutions: read failed, serving the last known list", exc_info=True)
        with _lock:
            _cache = (now + _STALE_TTL_SECONDS, previous)
        return previous

    with _lock:
        _cache = (now + _TTL_SECONDS, value)
    return value


def clear_institutions_cache() -> None:
    """Forget the cached list, so the next read goes to the database."""
    global _cache
    with _lock:
        _cache = None


def institution_summaries(institutions: list[dict] | None) -> dict[str, dict]:
    """``{id: {id, name, slug}}`` for every institution: what a class row embeds.

    Takes a ``load_institutions()`` snapshot (``None`` counts as no institutions) rather than
    loading one itself, so a caller that already has one — as ``get_classes_for_user`` does, to
    decide whether ``institution_id`` is even selectable — is not charged a second cache lookup,
    or, mid-outage, a second failed read for an answer it already has.
    """
    return {
        i["id"]: {"id": i["id"], "name": i["name"], "slug": i["slug"]} for i in institutions or []
    }


def is_known_institution(institution_id) -> bool:
    """True when ``institution_id`` names an existing institution.

    Normalized through ``uuid.UUID`` first, so an upper-case (or otherwise re-cased) form of a
    known id still matches; anything that is not a UUID at all is false, not an error.

    Can raise ``DatabaseError`` (see ``load_institutions``) when the list can't be read and
    nothing is cached.
    """
    try:
        normalized = str(UUID(str(institution_id)))
    except (ValueError, TypeError):
        return False
    return normalized in {i["id"] for i in load_institutions() or []}


def email_domain(email: str | None) -> str:
    """The lower-cased part after the last ``@``, or ``""`` when there is none."""
    address = (email or "").strip().lower()
    return address.rsplit("@", 1)[1] if "@" in address else ""


def is_school_email(email: str | None) -> bool:
    """True for an address at a school.

    Its domain ends in ``.edu`` (so US schools that have not been added still count), or is one
    of an institution's ``email_domains``, or a subdomain of one: ``stu.istinye.edu.tr`` matches
    ``istinye.edu.tr``; ``evil-istinye.edu.tr`` does not.

    Can raise ``DatabaseError`` (see ``load_institutions``) when the list can't be read and
    nothing is cached. A caller on a hot path should run the free checks that make a lookup
    unnecessary — the role, an already-verified roster email — first (see
    ``app.utils.profiles.needs_roster_email``).
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
