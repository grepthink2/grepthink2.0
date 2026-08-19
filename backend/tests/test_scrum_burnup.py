"""Pure burnup-series math: carry-forward, today override, cumulative build."""
from datetime import date

from app.scrum.burnup import build_sprint_series, build_cumulative_series


def test_carry_forward_fills_gaps_and_today_overrides():
    snaps = [{"day": "2026-08-10", "scope_points": 10, "completed_points": 2}]
    out = build_sprint_series(
        snapshots=snaps, starts_at=date(2026, 8, 10), ends_at=date(2026, 8, 14),
        today=date(2026, 8, 12), live_scope=13, live_completed=5)
    assert out["labels"] == ["8/10", "8/11", "8/12", "8/13", "8/14"]
    assert out["scope"] == [10, 10, 13]        # truncated at today
    assert out["completed"] == [2, 2, 5]


def test_series_empty_before_start():
    out = build_sprint_series(snapshots=[], starts_at=date(2026, 9, 1),
                              ends_at=date(2026, 9, 5), today=date(2026, 8, 12),
                              live_scope=8, live_completed=0)
    assert out["scope"] == [] and out["labels"] == ["9/1", "9/2", "9/3", "9/4", "9/5"]


def test_cumulative_one_point_per_sprint():
    sprints = [
        {"id": "s1", "name": "Sprint 1", "final": {"scope_points": 10, "completed_points": 9}},
        {"id": "s2", "name": "Sprint 2", "final": {"scope_points": 8, "completed_points": 3}},
    ]
    out = build_cumulative_series(sprints)
    assert out["labels"] == ["S1", "S2"]
    assert out["scope"] == [10, 18] and out["completed"] == [9, 12]
