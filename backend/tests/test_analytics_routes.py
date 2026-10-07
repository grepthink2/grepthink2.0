"""The analytics routes end to end: auth, scope, validation, headers, the viewed event, the limit."""

import pytest

from app.analytics import controller
from app.config import settings
from app.limiter import limiter
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase
from tests.test_analytics_dashboard import (
    CLASSES,
    CONV,
    COUNTS,
    ISTINYE,
    NOW,
    RELATIONS,
    SCRUM,
    TRENDS,
    UCSC,
)

BASE = "/api/analytics"
# the route parses ids as UUIDs, so the two classes these tests name get real ones; the fixture's others stay
C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
C9 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9"
_UUIDS = {"c1": C1, "c9": C9}
CLASSES_UUID = [{**c, "id": _UUIDS.get(c["id"], c["id"])} for c in CLASSES]
COUNTS_UUID = {
    **COUNTS,
    "by_class": [
        {**r, "class_id": _UUIDS.get(r["class_id"], r["class_id"])} for r in COUNTS["by_class"]
    ],
    "by_team": [
        {**t, "class_id": _UUIDS.get(t["class_id"], t["class_id"])} for t in COUNTS["by_team"]
    ],
}


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    fake = FakeSupabase(
        relations=RELATIONS,
        institutions=[ISTINYE, UCSC],
        classes=CLASSES_UUID,
        events=[],
        rpc={
            "analytics_scope_counts": lambda p: COUNTS_UUID,
            "analytics_conversations": lambda p: CONV,
            "analytics_scrum": lambda p: SCRUM,
            "analytics_trends": lambda p: TRENDS,
        },
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(controller, "now_utc", lambda: NOW)
    monkeypatch.setattr(settings, "ANALYTICS_ADMIN_EMAILS", frozenset({"maintainer@grepthink.dev"}))
    controller.clear_dashboard_cache()
    limiter.reset()
    yield fake
    controller.clear_dashboard_cache()
    limiter.reset()


PROF = header_for("prof@ucsc.edu", sub="prof")
STUDENT = header_for("s@ucsc.edu", sub="student")


def test_routes_need_a_token(client):
    assert client.get(f"{BASE}/scope").status_code == 401
    assert client.get(f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}).status_code == 401


def test_scope_lists_the_callers_institutions_and_is_empty_for_students(client):
    r = client.get(f"{BASE}/scope", headers=PROF)
    assert r.status_code == 200 and r.headers["cache-control"] == "private, max-age=60"
    body = r.json()
    assert [i["slug"] for i in body["institutions"]] == [
        "ucsc"
    ]  # prof created UCSC classes only; c9 is someone else's
    ucsc = next(i for i in body["institutions"] if i["slug"] == "ucsc")
    assert ucsc["access"] == "instructor" and ucsc["classes"][0]["label"] == "CSE 115A · Fall 2026"
    assert client.get(f"{BASE}/scope", headers=STUDENT).json() == {"institutions": []}


def test_dashboard_happy_path_sets_the_header_and_records_the_view(client, _setup):
    r = client.get(
        f"{BASE}/dashboard",
        params={"institution_id": UCSC["id"], "class_id": C1, "window": "class"},
        headers=PROF,
    )
    assert r.status_code == 200, r.text
    assert r.headers["cache-control"] == "private, max-age=60"
    body = r.json()
    assert body["meta"]["class"] == {"id": C1, "label": "CSE 115A · Fall 2026"}
    assert body["overview"]["messages"] == 1284 and body["failures"] == []
    events = _setup.store["events"]
    assert len(events) == 1
    event = {k: v for k, v in events[0].items() if k != "id"}
    assert event == {
        "kind": "analytics_viewed",
        "actor_id": "prof",
        "class_id": C1,
        "project_id": None,
        "meta": {"institution_id": UCSC["id"], "window": "class"},
    }


def test_dashboard_authorization_answers(client):
    assert (
        client.get(
            f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=STUDENT
        ).status_code
        == 403
    )
    r = client.get(f"{BASE}/dashboard", params={"institution_id": ISTINYE["id"]}, headers=PROF)
    assert r.status_code == 403 and r.json()["detail"] == controller.ANALYTICS_FORBIDDEN
    r = client.get(
        f"{BASE}/dashboard", params={"institution_id": UCSC["id"], "class_id": C9}, headers=PROF
    )
    assert r.status_code == 400 and r.json()["detail"] == controller.CLASS_NOT_IN_INSTITUTION


@pytest.mark.parametrize(
    ("params", "detail"),
    [
        ({"window": "custom"}, "from and to are required for a custom range"),
        (
            {"window": "custom", "from": "1999-12-31", "to": "2000-01-01"},
            "dates must fall between 2000-01-01 and 2100-12-31",
        ),
        (
            {"window": "custom", "from": "2026-01-02", "to": "2026-01-01"},
            "to must be on or after from",
        ),
        (
            {"window": "custom", "from": "2023-01-01", "to": "2026-01-01"},
            "a range may span at most 2 years",
        ),
        ({"window": "class"}, "window=class needs class_id"),
    ],
)
def test_range_rules_are_422_with_fixed_details(client, params, detail):
    r = client.get(
        f"{BASE}/dashboard", params={"institution_id": UCSC["id"], **params}, headers=PROF
    )
    assert r.status_code == 422 and r.json()["detail"] == detail


def test_from_and_to_are_ignored_outside_a_custom_range(client):
    r = client.get(
        f"{BASE}/dashboard",
        params={
            "institution_id": UCSC["id"],
            "window": "30d",
            "from": "2020-01-01",
            "to": "2020-01-02",
        },
        headers=PROF,
    )
    assert (
        r.status_code == 200 and r.json()["meta"]["range"]["from"] == "2026-09-08"
    )  # the preset's own bounds


def test_an_unknown_window_or_a_bad_uuid_is_422(client):
    assert (
        client.get(
            f"{BASE}/dashboard",
            params={"institution_id": UCSC["id"], "window": "year"},
            headers=PROF,
        ).status_code
        == 422
    )
    assert (
        client.get(
            f"{BASE}/dashboard", params={"institution_id": "not-a-uuid"}, headers=PROF
        ).status_code
        == 422
    )


def test_custom_range_round_trips_its_dates(client):
    r = client.get(
        f"{BASE}/dashboard",
        params={
            "institution_id": UCSC["id"],
            "window": "custom",
            "from": "2026-09-01",
            "to": "2026-09-30",
        },
        headers=PROF,
    )
    assert r.status_code == 200
    assert r.json()["meta"]["range"] == {
        "preset": "custom",
        "from": "2026-09-01",
        "to": "2026-09-30",
        "previous_from": "2026-08-02",
        "previous_to": "2026-08-31",
    }


def test_the_thirty_first_call_in_a_minute_is_rate_limited(client):
    for _ in range(30):
        assert client.get(f"{BASE}/scope", headers=PROF).status_code == 200
    assert client.get(f"{BASE}/scope", headers=PROF).status_code == 429
