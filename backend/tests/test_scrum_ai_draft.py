"""AI draft: quota 429, disabled 503, snap-to-scale."""

from datetime import date

import pytest
from fastapi import HTTPException

from app.config import settings
from app.scrum import controller
from app.scrum.ai_draft import snap_points
from tests.scrum_support import PID, UID, scrum_db

TODAY = date(2026, 9, 1)


def test_snap_points_to_scale():
    fib = [1, 2, 3, 5, 8, 13]
    assert snap_points(4, fib) == 3  # ties round down
    assert snap_points(7, fib) == 8
    assert snap_points(99, fib) == 13
    assert snap_points(None, fib) is None


def test_draft_503_when_unconfigured(monkeypatch):
    scrum_db(monkeypatch)
    monkeypatch.setattr(settings, "AI_API_KEY", "")
    with pytest.raises(HTTPException) as e:
        controller.ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 503


def test_draft_429_over_quota(monkeypatch):
    scrum_db(
        monkeypatch,
        ai_draft_usage=[{"user_id": UID, "used_on": TODAY.isoformat(), "count": 10}],
    )
    monkeypatch.setattr(controller, "_today_la", lambda: TODAY)
    monkeypatch.setattr(settings, "AI_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_BASE_URL", "http://ai.test")  # the 503 gate checks both
    with pytest.raises(HTTPException) as e:
        controller.ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 429
