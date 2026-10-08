"""Opt-in checks of the analytics SQL against the DEV database (spec §9, "SQL").

Skipped unless ANALYTICS_IT_DATABASE=1: the normal suite never touches a network. Run it after
applying 2026-10-07_analytics.sql on DEV:

    ANALYTICS_IT_DATABASE=1 .venv/bin/python -m pytest tests/test_analytics_integration.py -q

The module builds its own client from the repo-root .env (conftest replaces SUPABASE_URL with a stub
before the app loads, so the app's client would point the real key at a bogus host) and runs against the
DEV project only. The run WRITES to DEV: it re-runs yesterday's rollup with the snapshot (replacing that
day's board snapshot with the current board) and rewrites the activity rows of the day before. Ranges end
yesterday in the school's zone so a message written during the run cannot race a comparison. The
assertions are shape, non-negativity and cross-consistency (per-class sums equal totals, a second rollup
run changes no activity value), never exact counts — DEV data moves.
"""

from __future__ import annotations

import datetime as dt
import os
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("ANALYTICS_IT_DATABASE") != "1",
    reason="set ANALYTICS_IT_DATABASE=1 to run the analytics SQL against DEV",
)

PARAMS = ("p_institution", "p_class", "p_from", "p_to", "p_prev_from", "p_prev_to", "p_tz")
DEV_PROJECT_REF = "jfbagjjvryqcwxsyeyeg"
SNAPSHOT_METRICS = {
    "tasks_todo",
    "tasks_in_progress",
    "tasks_done",
    "points_todo",
    "points_in_progress",
    "points_done",
}
ACTIVITY_METRICS = 8
METRICS_PER_CLASS = ACTIVITY_METRICS + len(SNAPSHOT_METRICS)


@pytest.fixture(scope="module")
def db():
    __tracebackhide__ = True  # a failure here must not print the .env (showlocals)
    from dotenv import dotenv_values
    from supabase import create_client

    env_file = Path(__file__).resolve().parents[2] / ".env"
    values = dotenv_values(env_file)
    url, key = values.get("SUPABASE_URL") or "", values.get("SUPABASE_SERVICE_ROLE_KEY") or ""
    del values
    assert url and key, f"{env_file} must hold SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
    assert DEV_PROJECT_REF in url.lower(), "the analytics checks run against the DEV project only"
    return create_client(url, key)


@pytest.fixture(scope="module")
def ucsc(db) -> dict:
    rows = db.table("institutions").select("id, timezone").eq("slug", "ucsc").execute().data
    assert rows, "DEV has no institution with slug 'ucsc'"
    return rows[0]


def _today(ucsc: dict) -> dt.date:
    """Today in the school's zone, so 'yesterday' is a closed school day."""
    return dt.datetime.now(ZoneInfo(ucsc["timezone"])).date()


def _args(ucsc: dict, class_id: str | None = None, *, days: int = 30) -> dict:
    """A closed range of ``days`` days ending yesterday, with the previous range of equal length."""
    end = _today(ucsc) - dt.timedelta(days=1)
    start = end - dt.timedelta(days=days - 1)
    prev_end = start - dt.timedelta(days=1)
    prev_start = prev_end - dt.timedelta(days=days - 1)
    return dict(
        zip(
            PARAMS,
            (
                ucsc["id"],
                class_id,
                start.isoformat(),
                end.isoformat(),
                prev_start.isoformat(),
                prev_end.isoformat(),
                ucsc["timezone"],
            ),
            strict=True,
        )
    )


def _all_time_args(ucsc: dict, class_id: str | None = None) -> dict:
    """Everything up to yesterday, no previous range: exercises real rows even on a quiet month."""
    end = _today(ucsc) - dt.timedelta(days=1)
    return dict(
        zip(
            PARAMS,
            (ucsc["id"], class_id, "2000-01-01", end.isoformat(), None, None, ucsc["timezone"]),
            strict=True,
        )
    )


def _call(db, fn: str, params: dict) -> dict:
    data = db.rpc(fn, params).execute().data
    assert isinstance(data, dict), f"{fn} must return a JSON object, got {type(data).__name__}"
    return data


def _day_values(db, ucsc: dict, day: dt.date) -> dict[tuple[str | None, str], float]:
    rows = (
        db.table("analytics_daily")
        .select("class_id, metric, value")
        .eq("institution_id", ucsc["id"])
        .eq("day", day.isoformat())
        .execute()
        .data
    )
    return {(r["class_id"], r["metric"]): float(r["value"]) for r in rows}


def test_scope_counts_are_consistent(db, ucsc):
    j = _call(db, "analytics_scope_counts", _args(ucsc))
    assert j["classes"] == len(j["by_class"])
    assert j["teams"] == sum(c["teams"] for c in j["by_class"])
    assert j["teams"] == len(j["by_team"])
    assert all(t["members"] >= 1 for t in j["by_team"])
    assert j["students"] >= 0 and j["classes"] >= 0


def test_conversations_sum_per_class(db, ucsc):
    j = _call(db, "analytics_conversations", _all_time_args(ucsc))
    assert j["total"] == j["team_members"] + j["dm"]
    assert j["team_members"] == sum(c["team_messages"] for c in j["by_class"])
    assert j["team_members"] == sum(w["team_members"] for w in j["weekly"])
    assert j["dm"] == sum(w["dm"] for w in j["weekly"])
    assert j["prev_team_members"] is None and j["prev_dm"] is None
    for w in j["weekly"]:
        assert dt.date.fromisoformat(w["week_start"]).isoweekday() == 1


def test_class_filter_leaves_dm_alone(db, ucsc):
    whole = _call(db, "analytics_conversations", _all_time_args(ucsc))
    if not whole["by_class"]:
        pytest.skip("no team messages on DEV")
    one = whole["by_class"][0]["class_id"]
    part = _call(db, "analytics_conversations", _all_time_args(ucsc, one))
    assert part["team_members"] == whole["by_class"][0]["team_messages"]
    if whole["dm"] == 0:
        pytest.skip("no counted direct messages on DEV: the school-wide rule is untested here")
    assert part["dm"] == whole["dm"], "direct messages are school-wide and ignore the class filter"


def test_scrum_snapshot_and_medians(db, ucsc):
    j = _call(db, "analytics_scrum", _all_time_args(ucsc))
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
    day = _today(ucsc) - dt.timedelta(days=1)
    first = (
        db.rpc("analytics_rollup_day", {"p_day": day.isoformat(), "p_snapshot": True})
        .execute()
        .data
    )
    before = _day_values(db, ucsc, day)
    second = (
        db.rpc("analytics_rollup_day", {"p_day": day.isoformat(), "p_snapshot": True})
        .execute()
        .data
    )
    after = _day_values(db, ucsc, day)
    assert first == second and first > 0
    # a second run must not change any activity or institution value (snapshots follow the live board)
    stable_before = {k: v for k, v in before.items() if k[1] not in SNAPSHOT_METRICS}
    stable_after = {k: v for k, v in after.items() if k[1] not in SNAPSHOT_METRICS}
    assert stable_before == stable_after, "a second rollup run changed activity values"
    negative = {k: v for k, v in after.items() if v < 0}
    assert negative == {}, f"negative values: {negative}"
    # every class that existed by the end of that school-zone day has its rows (quiet ones too); rows of
    # classes deleted since are kept on purpose, so this is a superset check
    day_end = dt.datetime.combine(
        day + dt.timedelta(days=1), dt.time.min, tzinfo=ZoneInfo(ucsc["timezone"])
    )
    classes = (
        db.table("classes").select("id, created_at").eq("institution_id", ucsc["id"]).execute().data
    )
    expected = {c["id"] for c in classes if dt.datetime.fromisoformat(c["created_at"]) < day_end}
    per_class = {cid for (cid, _metric) in after if cid is not None}
    missing = expected - per_class
    assert not missing, f"classes without rows for {day}: {sorted(missing)}"
    per_metric: dict[str, set[str]] = {}
    for cid, metric in after:
        if cid in expected:
            per_metric.setdefault(cid, set()).add(metric)
    short = {cid: sorted(m) for cid, m in per_metric.items() if len(m) != METRICS_PER_CLASS}
    assert short == {}, f"classes without {METRICS_PER_CLASS} metric rows: {short}"
    assert {"dm_messages", "active_users"} <= {metric for (cid, metric) in after if cid is None}
    # a backfill (snapshot off) rewrites the activity rows of an earlier day and leaves whatever snapshot
    # rows that day already has (from the nightly job, the Check or an earlier run) untouched
    before_day = day - dt.timedelta(days=1)
    snapshots_before = {
        k: v for k, v in _day_values(db, ucsc, before_day).items() if k[1] in SNAPSHOT_METRICS
    }
    ranged = (
        db.rpc(
            "analytics_rollup_range",
            {"p_from": before_day.isoformat(), "p_to": before_day.isoformat()},
        )
        .execute()
        .data
    )
    single = (
        db.rpc("analytics_rollup_day", {"p_day": before_day.isoformat(), "p_snapshot": False})
        .execute()
        .data
    )
    assert ranged == single
    snapshots_after = {
        k: v for k, v in _day_values(db, ucsc, before_day).items() if k[1] in SNAPSHOT_METRICS
    }
    assert snapshots_before == snapshots_after, "a backfill must not touch a day's snapshot rows"


def test_trends_rows_are_weekly(db, ucsc):
    j = _call(db, "analytics_trends", _args(ucsc))
    if j["as_of"] is not None:
        dt.date.fromisoformat(j["as_of"])
    for w in j["weekly"]:
        assert dt.date.fromisoformat(w["week_start"]).isoweekday() == 1
        assert w["team_messages"] >= 0 and w["tasks_created"] >= 0 and w["dm_messages"] >= 0
        assert 1 <= w["days"] <= 7, "each week counts its rolled-up days"
        if w["team_messages"] + w["tasks_created"] > 0:
            # the classes active that week are in session on those days, so the week has a team count
            assert w["teams"] is not None, f"week {w['week_start']} has activity but no teams"


def test_trends_count_no_teams_for_a_class_without_activity(db, ucsc):
    """A class with no activity in the rows read is never in session: none of its weeks has a team count."""
    args = _args(ucsc, days=90)
    as_of = _call(db, "analytics_trends", args)["as_of"]
    # the function's own lower bound, a week early: a wider window than it reads, so "quiet" is safe
    p_from, p_to = dt.date.fromisoformat(args["p_from"]), dt.date.fromisoformat(args["p_to"])
    anchor = dt.date.fromisoformat(as_of) if as_of else p_from
    lo = min(
        dt.date.fromisoformat(args["p_prev_from"]),
        anchor - dt.timedelta(days=84),
        p_to - dt.timedelta(days=84),
    ) - dt.timedelta(days=7)
    classes = (
        db.table("classes").select("id").eq("institution_id", ucsc["id"]).order("id").execute().data
    )
    quiet = None
    for c in (
        classes
    ):  # one small read per class: a single read of every active row could hit the row cap
        hit = (
            db.table("analytics_daily")
            .select("day")
            .eq("institution_id", ucsc["id"])
            .eq("class_id", c["id"])
            .in_("metric", ["team_messages", "tasks_created", "stories_created", "active_teams"])
            .gt("value", 0)
            .gte("day", lo.isoformat())
            .lte("day", args["p_to"])
            .limit(1)
            .execute()
            .data
        )
        if not hit:
            quiet = c["id"]
            break
    if quiet is None:
        pytest.skip("every DEV class has activity in the window")
    j = _call(db, "analytics_trends", {**args, "p_class": quiet})
    assert all(w["teams"] is None for w in j["weekly"]), "a class without activity adds no teams"
