"""Analytics: who sees which institution, and the one dashboard payload (spec §6.1).

Authorization is decided here, in Python: the service role bypasses RLS. A maintainer (e-mail in
``ANALYTICS_ADMIN_EMAILS``) sees every institution; an instructor sees the institutions of the
classes they created; everyone else has an empty scope.
"""

from __future__ import annotations

import copy
import datetime as dt
import threading
import time
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.analytics import privacy, windows
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
# Which cards a failed RPC blanks (brief §5 `failures`).
SECTION_FAILURES: dict[str, tuple[str, ...]] = {
    "scope_counts": ("overview", "breakdown"),
    "conversations": ("conversations",),
    "scrum": ("scrum",),
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
_CACHE_TTL_SECONDS = 60.0
_CACHE_MAX_ENTRIES = 128
_cache: dict[tuple, tuple[float, dict]] = {}
_cache_lock = threading.Lock()


def clear_dashboard_cache() -> None:
    with _cache_lock:
        _cache.clear()


def _cache_get(key: tuple) -> dict | None:
    with _cache_lock:
        hit = _cache.get(key)
        if hit is None:
            return None
        expires_at, payload = hit
        if expires_at < time.monotonic():
            _cache.pop(key, None)
            return None
        return copy.deepcopy(payload)  # a caller's own copy: nothing it does can reach the cache


def _cache_put(key: tuple, payload: dict) -> None:
    with _cache_lock:
        if len(_cache) >= _CACHE_MAX_ENTRIES:
            oldest = min(_cache, key=lambda k: _cache[k][0])
            _cache.pop(oldest, None)
        _cache[key] = (time.monotonic() + _CACHE_TTL_SECONDS, copy.deepcopy(payload))


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

    403 outside the caller's scope, 400 for a class of another institution, ``WindowError`` for a bad
    range (the view answers 422). A failing section RPC never fails the request: its card is listed in
    ``failures`` and rendered empty.
    """
    scope = scope_for_user(user_id, email)
    institution = next((i for i in scope if i["id"] == institution_id), None)
    if institution is None:
        raise HTTPException(status_code=403, detail=ANALYTICS_FORBIDDEN)
    # spec D12: keyed by the request and looked up right after the access check, so a hit costs the
    # one read that re-checks access; an entry exists only for a class and range that once passed
    key = (institution_id, class_id, window, custom_from, custom_to)
    if not fresh:
        cached = _cache_get(key)
        if cached is not None:
            return {**cached, "meta": {**cached["meta"], "cached": True}}
    client = get_client()
    classes = (
        client.table("classes")
        .select(CLASS_COLUMNS)
        .eq("institution_id", institution_id)
        .order("name")
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
    _cache_put(key, payload)
    return payload


def _compose(
    institution: dict,
    selected: dict | None,
    bounds: windows.RangeBounds,
    results: dict,
    failed: set[str],
) -> dict:
    counts = results.get("scope_counts") or {}
    conv = results.get("conversations") or {}
    scrum = results.get("scrum") or {}
    trend_rows = results.get("trends") or {}
    generated_at = now_utc().isoformat()
    as_of = windows.parse_date(trend_rows.get("as_of"))
    # the sparklines end at the range's end: a custom range in the past shows the twelve weeks up to it
    sparklines = build_sparklines(
        trend_rows.get("weekly") or [], min(as_of, bounds.end) if as_of else None
    )
    prev_messages = None
    if conv.get("prev_team_members") is not None and conv.get("prev_dm") is not None:
        prev_messages = conv["prev_team_members"] + conv["prev_dm"]
    overview = {
        "active_classes": counts.get("classes", 0),
        "teams": counts.get("teams", 0),
        "students": counts.get("students", 0),
        "active_users_7d": counts.get("active_users_7d"),
        "messages": conv.get("total", 0),
        "stories_created": scrum.get("stories_created", 0),
        "tasks_created": scrum.get("tasks_created", 0),
        "story_points_created": scrum.get("story_points_created", 0),
        "task_points_created": scrum.get("task_points_created", 0),
        "on_time_rate": None,
        "deltas": {
            "messages": delta(conv.get("total"), prev_messages),
            "stories_created": delta(
                scrum.get("stories_created"), scrum.get("prev_stories_created")
            ),
            "tasks_created": delta(scrum.get("tasks_created"), scrum.get("prev_tasks_created")),
            "active_users_7d": delta(
                counts.get("active_users_7d"), counts.get("active_users_prev_7d")
            ),
            "on_time_rate": None,
        },
        "trends": sparklines,
    }
    conversations = {
        "total": conv.get("total", 0),
        "team_members": conv.get("team_members", 0),
        "dm": conv.get("dm", 0),
        # the SQL returns only weeks with messages; the chart needs every Monday of the range
        "weekly": dense_weeks(
            conv.get("weekly") or [], bounds.start, bounds.end, keys=("team_members", "dm")
        ),
        "excluded": list(EXCLUDED_CONVERSATIONS),
    }
    scrum_section = {
        "live_as_of": generated_at,
        "stories_created": scrum.get("stories_created", 0),
        "tasks_created": scrum.get("tasks_created", 0),
        "story_points_created": scrum.get("story_points_created", 0),
        "task_points_created": scrum.get("task_points_created", 0),
        "by_sprint": scrum.get("by_sprint", []),
        "chars": scrum.get("chars", []),
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
        "breakdown": _breakdown(institution["id"], selected, counts, conv, scrum),
        "failures": failures,
    }


def _breakdown(
    institution_id: str, selected: dict | None, counts: dict, conv: dict, scrum: dict
) -> dict:
    """Per class (no class filter) or per team (class selected), folded at k = 3, with live point rates."""
    if selected is None:
        conv_by = {r["class_id"]: r["team_messages"] for r in conv.get("by_class", [])}
        scrum_by = {r["class_id"]: r for r in scrum.get("by_class", [])}
        rows = [
            {
                "id": c["class_id"],
                "name": c["label"],
                "teams": c["teams"],
                "students": c["students"],
                "team_messages": conv_by.get(c["class_id"], 0),
                "stories": scrum_by.get(c["class_id"], {}).get("stories", 0),
                "tasks": scrum_by.get(c["class_id"], {}).get("tasks", 0),
                "points_done": scrum_by.get(c["class_id"], {}).get("points_done", 0),
                "points_total": scrum_by.get(c["class_id"], {}).get("points_total", 0),
                "href": f"/app/analytics?institution={institution_id}&class={c['class_id']}",
            }
            for c in counts.get("by_class", [])
        ]
        folded = privacy.fold_small_groups(
            rows,
            size_key="students",
            sum_keys=("teams", "team_messages", "stories", "tasks", "points_done", "points_total"),
        )
        kind = "class"
    else:
        conv_by = {r["project_id"]: r["team_messages"] for r in conv.get("by_team", [])}
        scrum_by = {r["project_id"]: r for r in scrum.get("by_team", [])}
        rows = [
            {
                "id": t["project_id"],
                "name": t["name"],
                "members": t["members"],
                "team_messages": conv_by.get(t["project_id"], 0),
                "stories": scrum_by.get(t["project_id"], {}).get("stories", 0),
                "tasks": scrum_by.get(t["project_id"], {}).get("tasks", 0),
                "points_done": scrum_by.get(t["project_id"], {}).get("points_done", 0),
                "points_total": scrum_by.get(t["project_id"], {}).get("points_total", 0),
                "href": f"/app/projects/{t['project_id']}/board",
            }
            for t in counts.get("by_team", [])
            if t["class_id"] == str(selected["id"])
        ]
        folded = privacy.fold_small_groups(
            rows,
            size_key="members",
            sum_keys=("team_messages", "stories", "tasks", "points_done", "points_total"),
        )
        kind = "team"
    return {"kind": kind, "rows": [_finish_row(r) for r in folded]}


def _finish_row(row: dict) -> dict:
    done, total = row.pop("points_done", 0), row.pop("points_total", 0)
    row["points_done_rate"] = round(done / total, 4) if total else None
    row["on_time_rate"] = None  # sub-project C
    row["missing"] = 0  # sub-project C
    return row
