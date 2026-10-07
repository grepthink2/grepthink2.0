"""Analytics: who sees which institution, and the one dashboard payload (spec §6.1).

Authorization is decided here, in Python: the service role bypasses RLS. A maintainer (e-mail in
``ANALYTICS_ADMIN_EMAILS``) sees every institution; an instructor sees the institutions of the
classes they created; everyone else has an empty scope.
"""

from __future__ import annotations

import datetime as dt
import unicodedata
from zoneinfo import ZoneInfo

from app.config import settings
from app.core.db import get_client

ANALYTICS_FORBIDDEN = "Analytics is available to instructors and maintainers"
CLASS_NOT_IN_INSTITUTION = "class does not belong to this institution"

INSTITUTION_COLUMNS = "id, name, slug, timezone"
CLASS_COLUMNS = "id, name, term, start_date, created_at, institution_id"


def now_utc() -> dt.datetime:
    """The only clock in this module (patched in tests)."""
    return dt.datetime.now(dt.UTC)


def today_in(tz: str) -> dt.date:
    return now_utc().astimezone(ZoneInfo(tz)).date()


def class_label(row: dict) -> str:
    term = (row.get("term") or "").strip()
    return f"{row['name']} · {term}" if term else row["name"]


def is_maintainer(email: str | None) -> bool:
    # ASCII only: str.lower() maps a few non-ASCII letters (the Kelvin sign) onto ASCII ones
    return bool(email) and email.isascii() and email.lower() in settings.ANALYTICS_ADMIN_EMAILS


def _name_key(name: str) -> str:
    """A sort key that does not depend on the database's collation: accents stripped and case ignored,
    so "İstinye University" sorts under I and "École" under E (a letter with no plain form, such as Ł,
    keeps its own place)."""
    decomposed = unicodedata.normalize("NFKD", name)
    return "".join(ch for ch in decomposed if not unicodedata.combining(ch)).casefold()


def _scope_rows(rows: list[dict], access: str) -> list[dict]:
    """Scope rows by name, then slug (unique), so equal names keep a fixed order."""
    ordered = sorted(rows, key=lambda row: (_name_key(row["name"]), row["slug"]))
    return [{**row, "id": str(row["id"]), "access": access} for row in ordered]


def scope_for_user(user_id: str, email: str | None) -> list[dict]:
    """Institutions the caller may see, by name (sorted here, not by the database); ``[]`` = no access."""
    client = get_client()
    if is_maintainer(email):
        rows = client.table("institutions").select(INSTITUTION_COLUMNS).execute().data or []
        return _scope_rows(rows, "maintainer")
    # one round trip: the classes the caller created, each with its institution embedded over the FK
    taught = (
        client.table("classes")
        .select(f"institution_id, institutions({INSTITUTION_COLUMNS})")
        .eq("created_by", user_id)
        .execute()
        .data
        or []
    )
    institutions: dict[str, dict] = {}
    for row in taught:
        institution = row.get("institutions")
        if institution and institution.get("id"):  # a class with no institution grants nothing
            institutions.setdefault(str(institution["id"]), institution)
    return _scope_rows(list(institutions.values()), "instructor")


def _class_key(row: dict) -> tuple[str, str, str]:
    """Name (collation-independent), then start date, then id: same-name classes keep a fixed order."""
    return (_name_key(row["name"]), row.get("start_date") or "", str(row["id"]))


def get_scope(user_id: str, email: str | None) -> dict:
    """``GET /api/analytics/scope``: the institutions in scope with every class of each."""
    scope = scope_for_user(user_id, email)
    if not scope:
        return {"institutions": []}
    client = get_client()
    ids = [s["id"] for s in scope]
    classes = (
        client.table("classes").select(CLASS_COLUMNS).in_("institution_id", ids).execute().data
        or []
    )
    by_inst: dict[str, list[dict]] = {i: [] for i in ids}
    for c in sorted(classes, key=_class_key):
        by_inst[str(c["institution_id"])].append(
            {
                "id": str(c["id"]),
                "name": c["name"],
                "term": c.get("term"),
                "start_date": c.get("start_date"),
                "label": class_label(c),
            }
        )
    return {"institutions": [{**s, "classes": by_inst[s["id"]]} for s in scope]}
