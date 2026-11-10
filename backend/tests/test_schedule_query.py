"""``GET /api/schedule``: the range it accepts, before any database read."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from app.schedule import controller

CLASS = "c0000000-0000-0000-0000-000000000001"


@pytest.fixture
def calls(monkeypatch):
    seen = []

    def fake(user_id, class_id, start, end):
        seen.append((user_id, str(class_id), start, end))
        return {"lens": "student", "items": []}

    monkeypatch.setattr(controller, "get_schedule", fake)
    return seen


def test_the_range_reaches_the_controller_as_aware_instants(client, auth_header, calls):
    res = client.get(
        "/api/schedule",
        params={
            "class_id": CLASS,
            "from": "2026-11-09T00:00:00-08:00",
            "to": "2026-11-23T08:00:00Z",
        },
        headers=auth_header,
    )
    assert res.status_code == 200
    assert res.json() == {"lens": "student", "items": []}
    assert calls == [
        (
            "user-abc",
            CLASS,
            datetime(2026, 11, 9, 8, tzinfo=UTC),
            datetime(2026, 11, 23, 8, tzinfo=UTC),
        )
    ]


@pytest.mark.parametrize(
    ("start", "end", "why"),
    [
        ("2026-11-09T00:00:00", "2026-11-10T00:00:00Z", "timezone"),  # no offset
        ("2026-11-10T00:00:00Z", "2026-11-09T00:00:00Z", "from must be before to"),
        ("2026-11-09T00:00:00Z", "2026-11-09T00:00:00Z", "from must be before to"),
        ("2026-11-01T00:00:00Z", "2026-12-13T00:00:01Z", "at most 42 days"),
    ],
)
def test_a_range_without_an_offset_backwards_or_over_six_weeks_is_refused(
    client, auth_header, calls, start, end, why
):
    res = client.get(
        "/api/schedule",
        params={"class_id": CLASS, "from": start, "to": end},
        headers=auth_header,
    )
    assert res.status_code == 422
    assert why in str(res.json()["detail"])
    assert calls == []


def test_six_weeks_exactly_is_accepted(client, auth_header, calls):
    res = client.get(
        "/api/schedule",
        params={"class_id": CLASS, "from": "2026-11-01T00:00:00Z", "to": "2026-12-13T00:00:00Z"},
        headers=auth_header,
    )
    assert res.status_code == 200
