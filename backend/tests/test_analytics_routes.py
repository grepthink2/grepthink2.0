"""The analytics routes end to end: auth, scope, validation, headers, the viewed event, the limit."""

import time

import jwt
import pytest

from app.analytics import controller
from app.config import settings
from app.limiter import limiter
from tests.conftest import TEST_SECRET, header_for
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
    failing,
)

BASE = "/api/analytics"
# the route parses ids as UUIDs, so the two classes these tests name get real ones; the fixture's others stay
C1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
C9 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9"
_UUIDS = {"c1": C1, "c9": C9}


def _remap(rows: list[dict]) -> list[dict]:
    return [{**r, "class_id": _UUIDS.get(r["class_id"], r["class_id"])} for r in rows]


CLASSES_UUID = [{**c, "id": _UUIDS.get(c["id"], c["id"])} for c in CLASSES]
COUNTS_UUID = {
    **COUNTS,
    "by_class": _remap(COUNTS["by_class"]),
    "by_team": _remap(COUNTS["by_team"]),
}
CONV_UUID = {**CONV, "by_class": _remap(CONV["by_class"])}
SCRUM_UUID = {**SCRUM, "by_class": _remap(SCRUM["by_class"])}
NOWHERE = "99999999-9999-4999-8999-999999999999"


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    fake = FakeSupabase(
        relations=RELATIONS,
        institutions=[ISTINYE, UCSC],
        classes=CLASSES_UUID,
        events=[],
        rpc={
            "analytics_scope_counts": lambda p: COUNTS_UUID,
            "analytics_conversations": lambda p: CONV_UUID,
            "analytics_scrum": lambda p: SCRUM_UUID,
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
MAINTAINER = header_for("maintainer@grepthink.dev", sub="m")


def test_routes_need_a_token(client):
    assert client.get(f"{BASE}/scope").status_code == 401
    assert client.get(f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}).status_code == 401


def test_a_verified_token_without_a_subject_is_401_not_500(client):
    # the shape of Supabase's public anon key: signed with the project secret, no sub
    now = int(time.time())
    anon = jwt.encode(
        {"iss": "supabase", "role": "anon", "iat": now - 60, "exp": now + 3600},
        TEST_SECRET,
        algorithm="HS256",
    )
    headers = {"Authorization": f"Bearer {anon}"}
    assert client.get(f"{BASE}/scope", headers=headers).status_code == 401
    assert (
        client.get(
            f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=headers
        ).status_code
        == 401
    )


def test_scope_lists_the_callers_institutions_and_is_empty_for_students(client):
    r = client.get(f"{BASE}/scope", headers=PROF)
    # no-cache: an instructor who creates a first class and comes back within the minute gets the new scope
    assert (
        r.status_code == 200
        and r.headers["cache-control"] == "no-cache"
        and r.headers["vary"] == "Authorization"
    )
    body = r.json()
    # prof created UCSC classes only; c9 is someone else's
    assert [i["slug"] for i in body["institutions"]] == ["ucsc"]
    ucsc = next(i for i in body["institutions"] if i["slug"] == "ucsc")
    assert ucsc["access"] == "instructor" and ucsc["classes"][0]["label"] == "CSE 115A · Fall 2026"
    assert client.get(f"{BASE}/scope", headers=STUDENT).json() == {"institutions": []}


def test_a_maintainer_sees_every_institution_and_an_unknown_one_is_404(client):
    r = client.get(f"{BASE}/scope", headers=MAINTAINER)
    assert [(i["slug"], i["access"]) for i in r.json()["institutions"]] == [
        ("istinye", "maintainer"),
        ("ucsc", "maintainer"),
    ]
    r = client.get(f"{BASE}/dashboard", params={"institution_id": NOWHERE}, headers=MAINTAINER)
    assert r.status_code == 404 and r.json()["detail"] == controller.INSTITUTION_NOT_FOUND
    assert (
        client.get(
            f"{BASE}/dashboard", params={"institution_id": NOWHERE}, headers=PROF
        ).status_code
        == 403
    )


def test_dashboard_happy_path_sets_the_headers_and_records_the_view(client, _setup):
    r = client.get(
        f"{BASE}/dashboard",
        params={"institution_id": UCSC["id"], "class_id": C1, "window": "class"},
        headers=PROF,
    )
    assert r.status_code == 200, r.text
    assert (
        r.headers["cache-control"] == "private, max-age=60" and r.headers["vary"] == "Authorization"
    )
    body = r.json()
    assert body["meta"]["class"] == {"id": C1, "label": "CSE 115A · Fall 2026"}
    assert body["overview"]["messages"] == 1284 and body["failures"] == []
    # Team Alpha, the selected class's team
    assert body["breakdown"]["rows"][0]["team_messages"] == 300
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


def test_a_view_is_recorded_for_a_first_load_and_a_filter_change_but_not_for_a_fresh_poll(
    client, _setup
):
    params = {"institution_id": UCSC["id"]}
    assert client.get(f"{BASE}/dashboard", params=params, headers=PROF).status_code == 200
    # the page's 60 s poll and its Refresh button send fresh=1: a tab left open is not a view a minute
    fresh = client.get(f"{BASE}/dashboard", params={**params, "fresh": "1"}, headers=PROF)
    assert fresh.status_code == 200
    changed = client.get(f"{BASE}/dashboard", params={**params, "window": "7d"}, headers=PROF)
    assert changed.status_code == 200
    assert [e["meta"]["window"] for e in _setup.store["events"]] == ["30d", "7d"]


def test_fresh_bypasses_the_cache_and_is_never_stored_by_the_browser(client):
    params = {"institution_id": UCSC["id"]}
    assert (
        client.get(f"{BASE}/dashboard", params=params, headers=PROF).json()["meta"]["cached"]
        is False
    )
    assert (
        client.get(f"{BASE}/dashboard", params=params, headers=PROF).json()["meta"]["cached"]
        is True
    )
    r = client.get(f"{BASE}/dashboard", params={**params, "fresh": "1"}, headers=PROF)
    assert r.json()["meta"]["cached"] is False
    assert r.headers["cache-control"] == "no-store" and r.headers["vary"] == "Authorization"


def test_a_degraded_payload_still_answers_200(client, _setup):
    for name in controller.SECTION_RPCS.values():
        _setup.rpcs[name] = failing(name)
    r = client.get(f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=PROF)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["failures"] == ["breakdown", "conversations", "overview", "scrum", "trends"]
    assert body["overview"]["active_classes"] is None and body["conversations"]["total"] is None
    # the server did not cache it; the browser must not either
    assert r.headers["cache-control"] == "no-store"
    assert len(_setup.store["events"]) == 1  # the view was still recorded


def test_the_class_rows_line_up_with_the_remapped_fixtures(client):
    body = client.get(
        f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=PROF
    ).json()
    c1 = next(r for r in body["breakdown"]["rows"] if r["id"] == C1)
    assert (c1["team_messages"], c1["stories"], c1["tasks"], c1["points_done_rate"]) == (
        555,
        58,
        296,
        0.61,
    )


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
    assert "cache-control" not in r.headers


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
    # the preset's own bounds
    assert r.status_code == 200 and r.json()["meta"]["range"]["from"] == "2026-09-08"


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


def test_the_thirty_first_call_in_a_minute_is_rate_limited_on_both_routes(client):
    for _ in range(30):
        assert client.get(f"{BASE}/scope", headers=PROF).status_code == 200
    assert client.get(f"{BASE}/scope", headers=PROF).status_code == 429
    for _ in range(30):
        assert (
            client.get(
                f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=PROF
            ).status_code
            == 200
        )
    assert (
        client.get(
            f"{BASE}/dashboard", params={"institution_id": UCSC["id"]}, headers=PROF
        ).status_code
        == 429
    )
