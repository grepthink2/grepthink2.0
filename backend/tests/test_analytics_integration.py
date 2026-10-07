"""Opt-in checks of the analytics SQL against the DEV database (spec §9, "SQL").

Skipped unless ANALYTICS_IT_DATABASE=1: the normal suite never touches a network. Run it after
applying 2026-10-07_analytics.sql on DEV:

    ANALYTICS_IT_DATABASE=1 .venv/bin/python -m pytest tests/test_analytics_integration.py -q

The module builds its own client from the repo-root .env (conftest replaces SUPABASE_URL with a stub
before the app loads, so the app's client would point the real key at a bogus host) and refuses to
run against the PROD project. The assertions are shape, non-negativity and cross-consistency
(per-class sums equal totals, a second rollup run changes nothing), never exact counts — DEV data moves.
"""

from __future__ import annotations

import datetime as dt
import os
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

PROD_PROJECT_REF = "yfezwtoeoexfksvbpxmi"

pytestmark = pytest.mark.skipif(
    os.environ.get("ANALYTICS_IT_DATABASE") != "1",
    reason="set ANALYTICS_IT_DATABASE=1 to run the analytics SQL against DEV",
)

PARAMS = ("p_institution", "p_class", "p_from", "p_to", "p_prev_from", "p_prev_to", "p_tz")


@pytest.fixture(scope="module")
def db():
    from dotenv import dotenv_values
    from supabase import create_client

    env_file = Path(__file__).resolve().parents[2] / ".env"
    env = dotenv_values(env_file)
    url, key = env.get("SUPABASE_URL"), env.get("SUPABASE_SERVICE_ROLE_KEY")
    assert url and key, f"{env_file} must hold SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    assert PROD_PROJECT_REF not in url, "refusing to run the analytics checks against PROD"
    return create_client(url, key)


@pytest.fixture(scope="module")
def ucsc(db) -> dict:
    rows = db.table("institutions").select("id, timezone").eq("slug", "ucsc").execute().data
    assert rows, "DEV has no institution with slug 'ucsc'"
    return rows[0]


def _args(ucsc: dict, class_id: str | None = None) -> dict:
    today = dt.date.today()
    return dict(
        zip(
            PARAMS,
            (
                ucsc["id"],
                class_id,
                (today - dt.timedelta(days=29)).isoformat(),
                today.isoformat(),
                (today - dt.timedelta(days=59)).isoformat(),
                (today - dt.timedelta(days=30)).isoformat(),
                ucsc["timezone"],
            ),
            strict=True,
        )
    )


def _call(db, fn: str, params: dict) -> dict:
    data = db.rpc(fn, params).execute().data
    assert isinstance(data, dict), f"{fn} must return a JSON object, got {type(data).__name__}"
    return data


def test_scope_counts_are_consistent(db, ucsc):
    j = _call(db, "analytics_scope_counts", _args(ucsc))
    assert j["classes"] == len(j["by_class"])
    assert j["teams"] == sum(c["teams"] for c in j["by_class"])
    assert j["teams"] == len(j["by_team"])
    assert all(t["members"] >= 1 for t in j["by_team"])
    assert j["students"] >= 0 and j["classes"] >= 0


def test_conversations_sum_per_class(db, ucsc):
    j = _call(db, "analytics_conversations", _args(ucsc))
    assert j["total"] == j["team_members"] + j["dm"]
    assert j["team_members"] == sum(c["team_messages"] for c in j["by_class"])
    assert j["team_members"] == sum(w["team_members"] for w in j["weekly"])
    assert j["dm"] == sum(w["dm"] for w in j["weekly"])
    for w in j["weekly"]:
        assert dt.date.fromisoformat(w["week_start"]).isoweekday() == 1


def test_class_filter_leaves_dm_alone(db, ucsc):
    whole = _call(db, "analytics_conversations", _args(ucsc))
    if not whole["by_class"]:
        pytest.skip("no team messages in the range on DEV")
    one = whole["by_class"][0]["class_id"]
    part = _call(db, "analytics_conversations", _args(ucsc, one))
    assert part["dm"] == whole["dm"], "direct messages are school-wide and ignore the class filter"
    assert part["team_members"] == whole["by_class"][0]["team_messages"]


def test_scrum_snapshot_and_medians(db, ucsc):
    j = _call(db, "analytics_scrum", _args(ucsc))
    for row in j["by_sprint"]:
        assert row["todo"] >= 0 and row["in_progress"] >= 0 and row["done"] >= 0
        assert row["label"] == ("Backlog" if row["ordinal"] == 0 else f"Sprint {row['ordinal']}")
    ordinals = [r["ordinal"] for r in j["by_sprint"]]
    assert ordinals == sorted(ordinals)
    for c in j["chars"]:
        assert c["entity"] in ("task", "story") and c["n"] >= 1 and c["median"] >= 1
    assert j["tasks_created"] == sum(c["tasks"] for c in j["by_class"])
    assert j["stories_created"] == sum(c["stories"] for c in j["by_class"])


def test_rollup_is_idempotent_and_complete(db, ucsc):
    day = dt.date.today() - dt.timedelta(days=1)
    first = (
        db.rpc("analytics_rollup_day", {"p_day": day.isoformat(), "p_snapshot": True})
        .execute()
        .data
    )
    second = (
        db.rpc("analytics_rollup_day", {"p_day": day.isoformat(), "p_snapshot": True})
        .execute()
        .data
    )
    assert first == second and first > 0
    rows = (
        db.table("analytics_daily")
        .select("class_id, metric, value")
        .eq("institution_id", ucsc["id"])
        .eq("day", day.isoformat())
        .execute()
        .data
    )
    keys = [(r["class_id"], r["metric"]) for r in rows]
    assert len(keys) == len(set(keys)), "one row per (class, metric)"
    assert all(float(r["value"]) >= 0 for r in rows)
    # every class that existed by the end of that school-zone day has rows (quiet ones too); rows of
    # classes deleted since are kept on purpose, so this is a superset check
    day_end = dt.datetime.combine(
        day + dt.timedelta(days=1), dt.time.min, tzinfo=ZoneInfo(ucsc["timezone"])
    )
    classes = (
        db.table("classes").select("id, created_at").eq("institution_id", ucsc["id"]).execute().data
    )
    expected = {c["id"] for c in classes if dt.datetime.fromisoformat(c["created_at"]) < day_end}
    per_class = {r["class_id"] for r in rows if r["class_id"] is not None}
    assert expected <= per_class, "every class that existed by the day's end has rows"
    per_metric: dict[str, set[str]] = {}
    for r in rows:
        if r["class_id"] in expected:
            per_metric.setdefault(r["class_id"], set()).add(r["metric"])
    assert all(len(m) == 14 for m in per_metric.values()), "8 activity + 6 snapshot rows per class"
    assert {"dm_messages", "active_users"} <= {r["metric"] for r in rows if r["class_id"] is None}
    before = (day - dt.timedelta(days=1)).isoformat()
    ranged = db.rpc("analytics_rollup_range", {"p_from": before, "p_to": before}).execute().data
    assert (
        ranged
        == db.rpc("analytics_rollup_day", {"p_day": before, "p_snapshot": False}).execute().data
    )


def test_trends_rows_are_weekly(db, ucsc):
    j = _call(db, "analytics_trends", _args(ucsc))
    assert j["as_of"] is None or dt.date.fromisoformat(j["as_of"])
    for w in j["weekly"]:
        assert dt.date.fromisoformat(w["week_start"]).isoweekday() == 1
        assert w["team_messages"] >= 0 and w["tasks_created"] >= 0 and w["dm_messages"] >= 0
