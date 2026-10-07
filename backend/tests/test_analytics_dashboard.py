"""One payload from four RPCs: composition, folding, deltas, failures, cache (spec §6.1, §9)."""

import datetime as dt

import pytest
from fastapi import HTTPException

from app.analytics import controller
from app.analytics.windows import WindowError
from app.config import settings
from app.core.errors import DatabaseError
from tests.fake_supabase import FakeSupabase

UCSC = {
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "UC Santa Cruz",
    "slug": "ucsc",
    "timezone": "America/Los_Angeles",
}
ISTINYE = {
    "id": "22222222-2222-4222-8222-222222222222",
    "name": "İstinye University",
    "slug": "istinye",
    "timezone": "Europe/Istanbul",
}
CLASSES = [
    {
        "id": "c1",
        "name": "CSE 115A",
        "term": "Fall 2026",
        "start_date": "2026-09-21",
        "created_at": "2026-09-01T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
    },
    {
        "id": "c2",
        "name": "CSE 115B",
        "term": None,
        "start_date": None,
        "created_at": "2026-01-10T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
    },
    {
        "id": "c3",
        "name": "Pilot",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-05T10:00:00+00:00",
        "created_by": "prof",
        "institution_id": UCSC["id"],
    },
    {
        "id": "c9",
        "name": "SE 301",
        "term": None,
        "start_date": None,
        "created_at": "2026-09-03T10:00:00+00:00",
        "created_by": "other",
        "institution_id": ISTINYE["id"],
    },
]
RELATIONS = {
    ("classes", "institutions"): ("institution_id", "id", False)
}  # the scope read embeds the institution
COUNTS = {
    "classes": 3,
    "teams": 10,
    "students": 46,
    "active_users_7d": 30,
    "active_users_prev_7d": 25,
    "by_class": [
        {"class_id": "c1", "label": "CSE 115A · Fall 2026", "teams": 8, "students": 41},
        {"class_id": "c2", "label": "CSE 115B", "teams": 1, "students": 3},
        {"class_id": "c3", "label": "Pilot", "teams": 1, "students": 2},
    ],
    "by_team": [
        {"project_id": "p1", "class_id": "c1", "name": "Team Alpha", "members": 5},
        {"project_id": "p2", "class_id": "c1", "name": "Duo", "members": 2},
    ],
}
CONV = {
    "team_members": 572,
    "dm": 712,
    "total": 1284,
    "prev_team_members": 500,
    "prev_dm": 588,
    "weekly": [{"week_start": "2026-09-07", "team_members": 100, "dm": 120}],
    "by_class": [
        {"class_id": "c1", "team_messages": 555},
        {"class_id": "c2", "team_messages": 12},
        {"class_id": "c3", "team_messages": 5},
    ],
    "by_team": [
        {"project_id": "p1", "team_messages": 300},
        {"project_id": "p2", "team_messages": 20},
    ],
}
SCRUM = {
    "stories_created": 61,
    "tasks_created": 302,
    "story_points_created": 188,
    "task_points_created": 611,
    "prev_stories_created": 50,
    "prev_tasks_created": 280,
    "prev_story_points_created": 150,
    "prev_task_points_created": 500,
    "weekly_tasks": [{"week_start": "2026-09-07", "tasks_created": 40}],
    "by_sprint": [
        {
            "ordinal": 0,
            "label": "Backlog",
            "teams": 9,
            "todo": 40,
            "in_progress": 0,
            "done": 0,
            "points_todo": 80,
            "points_in_progress": 0,
            "points_done": 0,
        }
    ],
    "chars": [{"entity": "task", "ordinal": None, "label": "All sprints", "n": 418, "median": 29}],
    "by_class": [
        {"class_id": "c1", "stories": 58, "tasks": 296, "points_done": 61, "points_total": 100},
        {"class_id": "c2", "stories": 1, "tasks": 2, "points_done": 0, "points_total": 0},
        {"class_id": "c3", "stories": 2, "tasks": 4, "points_done": 2, "points_total": 8},
    ],
    "by_team": [
        {"project_id": "p1", "stories": 30, "tasks": 150, "points_done": 30, "points_total": 60},
        {"project_id": "p2", "stories": 2, "tasks": 4, "points_done": 1, "points_total": 4},
    ],
}
TRENDS = {
    "as_of": "2026-10-06",
    "weekly": [
        {
            "week_start": "2026-09-21",
            "team_messages": 230,
            "tasks_created": 46,
            "points_done": 400,
            "teams": 23.0,
            "dm_messages": 33,
        },
        {
            "week_start": "2026-09-28",
            "team_messages": 253,
            "tasks_created": 69,
            "points_done": 460,
            "teams": 23.0,
            "dm_messages": 28,
        },
    ],
}
NOW = dt.datetime(2026, 10, 7, 18, 0, tzinfo=dt.UTC)  # 11:00 in Santa Cruz


def stubs(**overrides):
    base = {
        "analytics_scope_counts": lambda p: COUNTS,
        "analytics_conversations": lambda p: CONV,
        "analytics_scrum": lambda p: SCRUM,
        "analytics_trends": lambda p: TRENDS,
    }
    base.update(overrides)
    return base


@pytest.fixture(autouse=True)
def _clock_and_cache(monkeypatch):
    monkeypatch.setattr(controller, "now_utc", lambda: NOW)
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({"maintainer@grepthink.dev"}))
    controller.clear_dashboard_cache()
    yield
    controller.clear_dashboard_cache()


@pytest.fixture
def fake(monkeypatch):
    def make(**overrides):
        fake = FakeSupabase(
            relations=RELATIONS,
            institutions=[ISTINYE, UCSC],
            classes=CLASSES,
            rpc=stubs(**overrides),
        )
        monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
        return fake

    return make


def dashboard(**kw):
    args = {
        "institution_id": UCSC["id"],
        "class_id": None,
        "window": "30d",
        "custom_from": None,
        "custom_to": None,
        "fresh": False,
    }
    args.update(kw)
    return controller.get_dashboard("prof", "prof@ucsc.edu", **args)


def test_payload_shape_meta_and_overview(fake):
    db = fake()
    p = dashboard()
    assert set(p) == {
        "meta",
        "overview",
        "conversations",
        "scrum",
        "timeliness",
        "trends",
        "breakdown",
        "failures",
    }
    assert p["meta"]["institution"] == UCSC and p["meta"]["class"] is None
    assert p["meta"]["range"] == {
        "preset": "30d",
        "from": "2026-09-08",
        "to": "2026-10-07",
        "previous_from": "2026-08-09",
        "previous_to": "2026-09-07",
    }
    assert (
        p["meta"]["cached"] is False
        and p["meta"]["k_anonymity"] == 3
        and p["meta"]["rollup_as_of"] == "2026-10-06"
    )
    assert p["meta"]["generated_at"] == "2026-10-07T18:00:00+00:00"
    o = p["overview"]
    assert (
        o["active_classes"],
        o["teams"],
        o["students"],
        o["active_users_7d"],
        o["messages"],
    ) == (3, 10, 46, 30, 1284)
    assert (
        o["stories_created"],
        o["tasks_created"],
        o["story_points_created"],
        o["task_points_created"],
    ) == (61, 302, 188, 611)
    assert o["on_time_rate"] is None
    assert o["deltas"] == {
        "messages": 0.1801,
        "stories_created": 0.22,
        "tasks_created": 0.0786,
        "active_users_7d": 0.2,
        "on_time_rate": None,
    }
    assert o["trends"] == {"messages": [263.0, 281.0], "tasks_created": [46.0, 69.0]}
    assert p["failures"] == []
    assert (
        db.executes == 6
    )  # classes created_by (institution embedded), classes of the institution, 4 RPCs
    rpc_params = [q["filters"][0] for q in db.queries if q.get("op") == "rpc"]
    assert rpc_params[0] == {
        "p_institution": UCSC["id"],
        "p_class": None,
        "p_from": "2026-09-08",
        "p_to": "2026-10-07",
        "p_prev_from": "2026-08-09",
        "p_prev_to": "2026-09-07",
        "p_tz": "America/Los_Angeles",
    }


def test_sections_are_passed_through_with_fixed_copy(fake):
    fake()
    p = dashboard()
    weekly = p["conversations"].pop("weekly")
    assert p["conversations"] == {
        "total": 1284,
        "team_members": 572,
        "dm": 712,
        "excluded": controller.EXCLUDED_CONVERSATIONS,
    }
    assert [w["week_start"] for w in weekly] == [
        "2026-09-07",
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
        "2026-10-05",
    ]
    assert weekly[0] == CONV["weekly"][0] and weekly[1] == {
        "week_start": "2026-09-14",
        "team_members": 0,
        "dm": 0,
    }
    assert p["scrum"] == {
        "live_as_of": "2026-10-07T18:00:00+00:00",
        "stories_created": 61,
        "tasks_created": 302,
        "story_points_created": 188,
        "task_points_created": 611,
        "by_sprint": SCRUM["by_sprint"],
        "chars": SCRUM["chars"],
    }
    assert p["timeliness"] == controller.EMPTY_TIMELINESS
    assert p["trends"]["as_of"] == "2026-10-06" and [x["key"] for x in p["trends"]["panels"]] == [
        "team_messages_per_team",
        "tasks_per_team",
        "points_done_per_team",
    ]
    assert p["trends"]["panels"][0]["current"] == [
        {"week_start": "2026-09-21", "value": 10.0},
        {"week_start": "2026-09-28", "value": 11.0},
    ]
    assert p["trends"]["panels"][0]["previous"] == []


def test_class_breakdown_folds_small_classes_and_keeps_totals(fake):
    fake()
    rows = dashboard()["breakdown"]
    assert rows["kind"] == "class"
    assert [r["id"] for r in rows["rows"]] == ["c1", "c2", "folded"]
    c1 = rows["rows"][0]
    assert c1 == {
        "id": "c1",
        "name": "CSE 115A · Fall 2026",
        "kind": "row",
        "teams": 8,
        "students": 41,
        "team_messages": 555,
        "stories": 58,
        "tasks": 296,
        "points_done_rate": 0.61,
        "on_time_rate": None,
        "missing": 0,
        "href": f"/app/analytics?institution={UCSC['id']}&class=c1",
    }
    assert rows["rows"][1]["points_done_rate"] is None  # 0 points on the board
    folded = rows["rows"][2]
    assert (
        folded["name"] == "Smaller groups (1)"
        and folded["students"] == 2
        and folded["team_messages"] == 5
    )
    assert folded["points_done_rate"] == 0.25 and "href" not in folded
    assert dashboard()["overview"]["students"] == 46  # totals unaffected by folding


def test_team_breakdown_when_a_class_is_selected(fake):
    fake()
    p = dashboard(class_id="c1", window="class")
    assert p["meta"]["class"] == {"id": "c1", "label": "CSE 115A · Fall 2026"}
    assert p["meta"]["range"]["from"] == "2026-09-21" and p["meta"]["range"]["to"] == "2026-10-07"
    rows = p["breakdown"]
    assert rows["kind"] == "team"
    assert [r["id"] for r in rows["rows"]] == ["p1", "folded"]
    assert rows["rows"][0] == {
        "id": "p1",
        "name": "Team Alpha",
        "kind": "row",
        "members": 5,
        "team_messages": 300,
        "stories": 30,
        "tasks": 150,
        "points_done_rate": 0.5,
        "on_time_rate": None,
        "missing": 0,
        "href": "/app/projects/p1/board",
    }
    assert rows["rows"][1]["members"] == 2 and rows["rows"][1]["points_done_rate"] == 0.25


def test_a_failing_section_lands_in_failures_and_the_rest_renders(fake):
    fake(
        analytics_scrum=lambda p: (_ for _ in ()).throw(
            DatabaseError(operation="read", target="analytics_scrum")
        )
    )
    p = dashboard()
    assert p["failures"] == ["scrum"]
    assert (
        p["scrum"]["stories_created"] == 0
        and p["scrum"]["by_sprint"] == []
        and p["scrum"]["chars"] == []
    )
    assert p["overview"]["messages"] == 1284 and p["overview"]["stories_created"] == 0
    assert p["breakdown"]["rows"][0]["stories"] == 0


def test_a_failing_scope_count_marks_overview_and_breakdown(fake):
    fake(
        analytics_scope_counts=lambda p: (_ for _ in ()).throw(
            DatabaseError(operation="read", target="analytics_scope_counts")
        )
    )
    p = dashboard()
    assert p["failures"] == ["breakdown", "overview"]
    assert p["overview"]["active_classes"] == 0 and p["overview"]["active_users_7d"] is None
    assert p["breakdown"] == {"kind": "class", "rows": []}


def test_outside_scope_is_403_and_a_foreign_class_is_400(fake):
    fake()
    with pytest.raises(HTTPException) as e:
        controller.get_dashboard(
            "student",
            "s@ucsc.edu",
            institution_id=UCSC["id"],
            class_id=None,
            window="30d",
            custom_from=None,
            custom_to=None,
            fresh=False,
        )
    assert (e.value.status_code, e.value.detail) == (403, controller.ANALYTICS_FORBIDDEN)
    with pytest.raises(HTTPException) as e:
        dashboard(class_id="c9")
    assert (e.value.status_code, e.value.detail) == (400, controller.CLASS_NOT_IN_INSTITUTION)
    with pytest.raises(HTTPException) as e:
        controller.get_dashboard(
            "prof",
            "prof@ucsc.edu",
            institution_id=ISTINYE["id"],
            class_id=None,
            window="30d",
            custom_from=None,
            custom_to=None,
            fresh=False,
        )
    assert e.value.status_code == 403  # prof created nothing at İstinye


def test_window_rules_surface_as_window_error(fake):
    fake()
    with pytest.raises(WindowError, match="from and to are required"):
        dashboard(window="custom")
    with pytest.raises(WindowError, match="needs class_id"):
        dashboard(window="class")


def test_all_window_starts_at_the_oldest_class_and_has_no_previous_range(fake):
    fake()
    p = dashboard(window="all")
    assert p["meta"]["range"] == {
        "preset": "all",
        "from": "2026-01-10",
        "to": "2026-10-07",
        "previous_from": None,
        "previous_to": None,
    }
    assert all(x["previous"] is None for x in p["trends"]["panels"])


def test_the_cache_serves_a_second_identical_call_and_fresh_bypasses_it(fake):
    db = fake()
    first = dashboard()
    n = db.executes  # 6: the scope read, the institution's classes, four RPCs
    second = dashboard()
    assert db.executes == n + 1  # a hit re-checks access (one read) and nothing else
    assert all(q.get("op") != "rpc" for q in db.queries[n:])
    assert second["meta"]["cached"] is True and first["meta"]["cached"] is False
    assert second["overview"] == first["overview"]
    second["overview"]["teams"] = -1  # a caller gets its own copy, never the cached entry
    assert dashboard()["overview"]["teams"] == first["overview"]["teams"]
    dashboard(fresh=True)
    assert db.executes == n + 2 + 6
    dashboard(window="7d")  # a different key is a miss
    assert db.executes == n + 2 + 12


def test_a_maintainer_reaches_any_institution(fake):
    db = fake()
    p = controller.get_dashboard(
        "x",
        "maintainer@grepthink.dev",
        institution_id=ISTINYE["id"],
        class_id=None,
        window="7d",
        custom_from=None,
        custom_to=None,
        fresh=False,
    )
    assert p["meta"]["institution"]["slug"] == "istinye"
    assert db.executes == 6
