"""AI draft: quota 429, disabled 503, snap-to-scale."""
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.scrum.ai_draft import snap_points

PID = "00000000-0000-0000-0000-0000000000aa"
UID = "00000000-0000-0000-0000-0000000000bb"


def test_snap_points_to_scale():
    fib = [1, 2, 3, 5, 8, 13]
    assert snap_points(4, fib) == 3      # ties round down
    assert snap_points(7, fib) == 8
    assert snap_points(99, fib) == 13
    assert snap_points(None, fib) is None


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_draft_503_when_unconfigured(mock_client, _w, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AI_API_KEY", "")
    from app.scrum.controller import ai_draft
    with pytest.raises(HTTPException) as e:
        ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 503


@patch("app.scrum.controller._require_writer")
@patch("app.scrum.controller._client")
def test_draft_429_over_quota(mock_client, _w, monkeypatch):
    from app.config import settings
    monkeypatch.setattr(settings, "AI_API_KEY", "k")
    monkeypatch.setattr(settings, "AI_BASE_URL", "http://ai.test")  # plan fix: 503 gate checks both
    client = MagicMock()
    mock_client.return_value = client
    client.table.return_value.select.return_value.eq.return_value.eq.return_value.maybe_single.return_value.execute.return_value = MagicMock(
        data={"count": 10})
    from app.scrum.controller import ai_draft
    with pytest.raises(HTTPException) as e:
        ai_draft(project_id=PID, user_id=UID, kind="story", prompt="x", story_id=None)
    assert e.value.status_code == 429
