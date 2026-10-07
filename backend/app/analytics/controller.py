"""Analytics: who sees which institution, and the one dashboard payload (spec §6.1).

Authorization is decided here, in Python: the service role bypasses RLS. A maintainer (e-mail in
``ANALYTICS_ADMIN_EMAILS``) sees every institution; an instructor sees the institutions of the
classes they created; everyone else has an empty scope.
"""

from __future__ import annotations

import copy
import datetime as dt
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.analytics import privacy, windows
from app.analytics.cache import PayloadCache
from app.analytics.trends import build_panels, build_sparklines, delta, dense_weeks
from app.config import settings
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseError

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


# ------------------------------------------------------------------ dashboard ----

SECTION_RPCS: dict[str, str] = {
    "scope_counts": "analytics_scope_counts",
    "conversations": "analytics_conversations",
    "scrum": "analytics_scrum",
    "trends": "analytics_trends",
}
# Which cards lose data when a section's RPC fails (brief §5 `failures`). The overview tiles and the
# breakdown columns draw on conversations and scrum too, so those cards are named as well; the
# affected figures arrive as null, never as a fabricated 0.
SECTION_FAILURES: dict[str, tuple[str, ...]] = {
    "scope_counts": ("overview", "breakdown"),
    "conversations": ("conversations", "overview", "breakdown"),
    "scrum": ("scrum", "overview", "breakdown"),
    "trends": ("trends",),
}
EXCLUDED_CONVERSATIONS = [
    "team ↔ TA channels",
    "team ↔ instructor channels",
    "direct messages between staff and a student of a class they share",
]
EMPTY_TIMELINESS = {  # sub-project C fills this in; the page renders no timeliness card until then
    "on_time_rate": None,
    "expected": 0,
    "late": 0,
    "missing": 0,
    "edited_late": 0,
    "bucket_order": ["early", "on_time", "late", "missing", "not_due"],
    "rows": [],
}
INSTITUTION_NOT_FOUND = "institution does not exist"

_cache = PayloadCache(ttl_seconds=60.0, max_entries=128)


def clear_dashboard_cache() -> None:
    _cache.clear()


def get_dashboard(
    user_id: str,
    email: str | None,
    *,
    institution_id: str,
    class_id: str | None,
    window: windows.Window,
    custom_from: dt.date | None,
    custom_to: dt.date | None,
    fresh: bool,
) -> dict:
    """``GET /api/analytics/dashboard``: one composed payload for an institution, class and range.

    403 outside the caller's scope (404 when a maintainer names an institution that does not exist),
    400 for a class of another institution, ``WindowError`` for a bad range (the view answers 422). A
    failing section RPC never fails the request: its cards are listed in ``failures``, their figures
    are null, and the payload is not cached, so the next call retries.
    """
    scope = scope_for_user(user_id, email)
    institution = next((i for i in scope if i["id"] == institution_id), None)
    if institution is None:
        # a maintainer's scope is every institution, so for them a miss means the id does not exist
        if is_maintainer(email):
            raise HTTPException(status_code=404, detail=INSTITUTION_NOT_FOUND)
        raise HTTPException(status_code=403, detail=ANALYTICS_FORBIDDEN)
    # spec D12: keyed by the request and looked up right after the access check, so a hit costs the
    # one read that re-checks access; an entry exists only for a class and range that once passed
    key = (institution_id, class_id, window, custom_from, custom_to)
    if not fresh:
        cached = _cache.get(key)
        if cached is not None:
            cached["meta"]["cached"] = True
            return cached
    client = get_client()
    classes = (
        client.table("classes")
        .select(CLASS_COLUMNS)
        .eq("institution_id", institution_id)
        .execute()
        .data
        or []
    )
    selected = None
    if class_id is not None:
        selected = next((c for c in classes if str(c["id"]) == class_id), None)
        if selected is None:
            raise HTTPException(status_code=400, detail=CLASS_NOT_IN_INSTITUTION)
    tz = institution["timezone"]
    today = today_in(tz)
    class_start = None
    if selected is not None:
        class_start = windows.parse_date(selected.get("start_date")) or windows.local_date(
            selected.get("created_at"), tz
        )
    all_from = min(
        (windows.local_date(c.get("created_at"), tz) or today for c in classes), default=today
    )
    bounds = windows.range_bounds(
        window,
        today,
        class_start=class_start,
        custom_from=custom_from,
        custom_to=custom_to,
        all_from=all_from,
    )
    params = {
        "p_institution": institution_id,
        "p_class": class_id,
        "p_from": bounds.start.isoformat(),
        "p_to": bounds.end.isoformat(),
        "p_prev_from": bounds.prev_start.isoformat() if bounds.prev_start else None,
        "p_prev_to": bounds.prev_end.isoformat() if bounds.prev_end else None,
        "p_tz": tz,
    }
    failed: set[str] = set()

    def section(name: str):
        def run():
            try:
                return client.rpc(SECTION_RPCS[name], params).execute().data
            except DatabaseError:
                failed.add(name)
                return None

        return run

    results = fan_out({name: section(name) for name in SECTION_RPCS})
    payload = _compose(institution, selected, bounds, results, failed)
    if not failed:  # a degraded payload is never served from the cache
        _cache.put(key, payload)
    return payload


def _count(source: dict | None, key: str) -> int | None:
    """A count from a section's JSON; None when that section's RPC failed, never a fabricated 0."""
    return None if source is None else source.get(key, 0)


def _compose(
    institution: dict,
    selected: dict | None,
    bounds: windows.RangeBounds,
    results: dict,
    failed: set[str],
) -> dict:
    counts, conv, scrum = (
        results.get("scope_counts"),
        results.get("conversations"),
        results.get("scrum"),
    )
    counts_d, conv_d, scrum_d = (
        counts or {},
        conv or {},
        scrum or {},
    )  # for optional keys; counts go through _count
    trend_rows = results.get("trends") or {}
    generated_at = now_utc().isoformat()
    as_of = windows.parse_date(trend_rows.get("as_of"))
    # the sparklines end at the range's end: a custom range in the past shows the weeks up to it (as many
    # as the rollup holds, up to twelve)
    sparklines = build_sparklines(
        trend_rows.get("weekly") or [], min(as_of, bounds.end) if as_of else None
    )
    prev_messages = None
    if conv_d.get("prev_team_members") is not None and conv_d.get("prev_dm") is not None:
        prev_messages = conv_d["prev_team_members"] + conv_d["prev_dm"]
    overview = {
        "active_classes": _count(counts, "classes"),
        "teams": _count(counts, "teams"),
        "students": _count(counts, "students"),
        "active_users_7d": counts_d.get("active_users_7d"),
        "messages": _count(conv, "total"),
        "stories_created": _count(scrum, "stories_created"),
        "tasks_created": _count(scrum, "tasks_created"),
        "story_points_created": _count(scrum, "story_points_created"),
        "task_points_created": _count(scrum, "task_points_created"),
        "on_time_rate": None,
        "deltas": {
            "messages": delta(conv_d.get("total"), prev_messages),
            "stories_created": delta(
                scrum_d.get("stories_created"), scrum_d.get("prev_stories_created")
            ),
            "tasks_created": delta(scrum_d.get("tasks_created"), scrum_d.get("prev_tasks_created")),
            "active_users_7d": delta(
                counts_d.get("active_users_7d"), counts_d.get("active_users_prev_7d")
            ),
            "on_time_rate": None,
        },
        "trends": sparklines,
    }
    conversations = {
        "total": _count(conv, "total"),
        "team_members": _count(conv, "team_members"),
        "dm": _count(conv, "dm"),
        # the SQL returns only weeks with messages; the chart needs every Monday of the range
        "weekly": dense_weeks(
            conv_d.get("weekly") or [], bounds.start, bounds.end, keys=("team_members", "dm")
        )
        if conv is not None
        else [],
        "excluded": list(EXCLUDED_CONVERSATIONS),
    }
    scrum_section = {
        "live_as_of": generated_at,
        "stories_created": _count(scrum, "stories_created"),
        "tasks_created": _count(scrum, "tasks_created"),
        "story_points_created": _count(scrum, "story_points_created"),
        "task_points_created": _count(scrum, "task_points_created"),
        "by_sprint": scrum_d.get("by_sprint", []),
        "chars": scrum_d.get("chars", []),
    }
    trends = {
        "as_of": as_of.isoformat() if as_of else None,
        "panels": build_panels(trend_rows.get("weekly") or [], bounds) if trend_rows else [],
    }
    failures = sorted({card for name in failed for card in SECTION_FAILURES[name]})
    return {
        "meta": {
            "institution": {k: institution[k] for k in ("id", "name", "slug", "timezone")},
            "class": {"id": str(selected["id"]), "label": class_label(selected)}
            if selected
            else None,
            "range": {
                "preset": bounds.window,
                "from": bounds.start.isoformat(),
                "to": bounds.end.isoformat(),
                "previous_from": bounds.prev_start.isoformat() if bounds.prev_start else None,
                "previous_to": bounds.prev_end.isoformat() if bounds.prev_end else None,
            },
            "generated_at": generated_at,
            "cached": False,
            "k_anonymity": privacy.K_ANONYMITY,
            "rollup_as_of": as_of.isoformat() if as_of else None,
        },
        "overview": overview,
        "conversations": conversations,
        "scrum": scrum_section,
        "timeliness": copy.deepcopy(EMPTY_TIMELINESS),
        "trends": trends,
        "breakdown": _breakdown(institution["id"], selected, counts_d, conv, scrum),
        "failures": failures,
    }


def _scrum_columns(row: dict | None) -> dict:
    row = row or {}
    return {k: row.get(k, 0) for k in ("stories", "tasks", "points_done", "points_total")}


def _breakdown(
    institution_id: str, selected: dict | None, counts: dict, conv: dict | None, scrum: dict | None
) -> dict:
    """Per class (no class filter) or per team (class selected), folded at k = 3, with live point rates.

    Rows are ordered here (name, then id), never by the database's collation. A column whose source RPC
    failed is None on every row, the folded one included.
    """
    conv_d, scrum_d = conv or {}, scrum or {}
    if selected is None:
        conv_by = {r["class_id"]: r["team_messages"] for r in conv_d.get("by_class", [])}
        scrum_by = {r["class_id"]: r for r in scrum_d.get("by_class", [])}
        rows = [
            {
                "id": c["class_id"],
                "name": c["label"],
                "teams": c["teams"],
                "students": c["students"],
                "team_messages": conv_by.get(c["class_id"], 0),
                **_scrum_columns(scrum_by.get(c["class_id"])),
                "href": f"/app/analytics?institution={institution_id}&class={c['class_id']}",
            }
            for c in counts.get("by_class", [])
        ]
        kind, size_key = "class", "students"
        sum_keys = ("teams", "team_messages", "stories", "tasks", "points_done", "points_total")
    else:
        conv_by = {r["project_id"]: r["team_messages"] for r in conv_d.get("by_team", [])}
        scrum_by = {r["project_id"]: r for r in scrum_d.get("by_team", [])}
        rows = [
            {
                "id": t["project_id"],
                "name": t["name"],
                "members": t["members"],
                "team_messages": conv_by.get(t["project_id"], 0),
                **_scrum_columns(scrum_by.get(t["project_id"])),
                "href": f"/app/projects/{t['project_id']}/board",
            }
            for t in counts.get("by_team", [])
            if t["class_id"] == str(selected["id"])
        ]
        kind, size_key = "team", "members"
        sum_keys = ("team_messages", "stories", "tasks", "points_done", "points_total")
    rows.sort(key=lambda r: (_name_key(r["name"]), r["id"]))
    folded = privacy.fold_small_groups(rows, size_key=size_key, sum_keys=sum_keys)
    blank: set[str] = set()
    if conv is None:
        blank.add("team_messages")
    if scrum is None:
        blank.update({"stories", "tasks", "points_done_rate"})
    finished = []
    for row in folded:
        row = _finish_row(row)
        for column in blank:
            row[column] = None
        finished.append(row)
    return {"kind": kind, "rows": finished}


def _finish_row(row: dict) -> dict:
    done, total = row.pop("points_done", 0), row.pop("points_total", 0)
    row["points_done_rate"] = round(done / total, 4) if total else None
    row["on_time_rate"] = None  # sub-project C
    row["missing"] = 0  # sub-project C
    return row
