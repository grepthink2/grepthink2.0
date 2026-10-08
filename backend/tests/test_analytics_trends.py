"""Weekly rollup rows → Trends panels, sparklines and deltas (spec §6.2 analytics_trends, Q-B3)."""

import datetime as dt

from app.analytics import trends
from app.analytics.windows import RangeBounds

WEEKLY = [  # Monday weeks, each rolled up on all seven days; teams averaged over the week
    {
        "week_start": "2026-08-31",
        "days": 7,
        "team_messages": 120,
        "tasks_created": 40,
        "points_done": 300,
        "teams": 20.0,
        "dm_messages": 15,
    },
    {
        "week_start": "2026-09-07",
        "days": 7,
        "team_messages": 150,
        "tasks_created": 50,
        "points_done": 330,
        "teams": 20.0,
        "dm_messages": 20,
    },
    {
        "week_start": "2026-09-14",
        "days": 7,
        "team_messages": 0,
        "tasks_created": 0,
        "points_done": None,
        "teams": 0,
        "dm_messages": 0,
    },
    {
        "week_start": "2026-09-21",
        "days": 7,
        "team_messages": 230,
        "tasks_created": 46,
        "points_done": 400,
        "teams": 23.0,
        "dm_messages": 33,
    },
    {
        "week_start": "2026-09-28",
        "days": 7,
        "team_messages": 253,
        "tasks_created": 69,
        "points_done": 460,
        "teams": 23.0,
        "dm_messages": 28,
    },
]
BOUNDS = RangeBounds(
    "30d", dt.date(2026, 9, 8), dt.date(2026, 10, 7), dt.date(2026, 8, 9), dt.date(2026, 9, 7)
)


def test_panels_divide_by_the_week_s_team_count_and_split_current_from_previous():
    panels = trends.build_panels(WEEKLY, BOUNDS)
    assert [p["key"] for p in panels] == [
        "team_messages_per_team",
        "tasks_per_team",
        "points_done_per_team",
    ]
    msgs = panels[0]
    # a week belongs to the range that holds its Monday: 09-07 is the previous range's last day
    assert [c["week_start"] for c in msgs["current"]] == ["2026-09-14", "2026-09-21", "2026-09-28"]
    assert [c["value"] for c in msgs["current"]] == [
        None,
        10.0,
        11.0,
    ]  # 0 teams → null, not a division
    assert [c["week_start"] for c in msgs["previous"]] == ["2026-08-31", "2026-09-07"]
    assert [c["value"] for c in msgs["previous"]] == [6.0, 7.5]
    assert panels[2]["unit"] == "per team" and panels[2]["current"][2]["value"] == 20.0


def test_a_range_ending_on_sunday_leaves_the_next_week_out_and_one_ending_on_monday_takes_it():
    rows = WEEKLY + [dict(WEEKLY[4], week_start="2026-10-05")]
    sunday = RangeBounds(
        "custom",
        dt.date(2026, 9, 8),
        dt.date(2026, 10, 4),
        dt.date(2026, 8, 12),
        dt.date(2026, 9, 7),
    )
    monday = RangeBounds(
        "custom",
        dt.date(2026, 9, 8),
        dt.date(2026, 10, 5),
        dt.date(2026, 8, 11),
        dt.date(2026, 9, 7),
    )
    assert [c["week_start"] for c in trends.build_panels(rows, sunday)[0]["current"]] == [
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
    ]
    assert [c["week_start"] for c in trends.build_panels(rows, monday)[0]["current"]][
        -1
    ] == "2026-10-05"


def test_panels_have_no_previous_series_for_the_all_preset():
    panels = trends.build_panels(
        WEEKLY, RangeBounds("all", dt.date(2026, 8, 1), dt.date(2026, 10, 7), None, None)
    )
    assert all(p["previous"] is None for p in panels)
    assert len(panels[0]["current"]) == 5


def test_sparklines_take_the_last_twelve_weeks_ending_at_as_of_and_add_direct_messages():
    out = trends.build_sparklines(WEEKLY, dt.date(2026, 10, 2))
    assert out["messages"] == [135.0, 170.0, 0.0, 263.0, 281.0]
    assert out["tasks_created"] == [40.0, 50.0, 0.0, 46.0, 69.0]
    many = [
        dict(WEEKLY[0], week_start=(dt.date(2026, 1, 5) + dt.timedelta(weeks=i)).isoformat())
        for i in range(40)
    ]
    assert len(trends.build_sparklines(many, dt.date(2026, 10, 7))["messages"]) == 12
    assert trends.build_sparklines(WEEKLY, None) == {}
    assert trends.build_sparklines([], dt.date(2026, 10, 7)) == {}


# Wednesday 2026-10-07 is the last rolled-up day: its week holds three days so far
PARTIAL = dict(
    WEEKLY[4], week_start="2026-10-05", days=3, team_messages=90, tasks_created=12, dm_messages=9
)


def test_a_week_with_fewer_than_seven_rolled_up_days_is_left_out_of_panels_and_sparklines():
    rows = WEEKLY + [PARTIAL]
    panels = trends.build_panels(rows, BOUNDS)
    # its Monday is in the range, but three days' sum would read as a drop
    assert [c["week_start"] for c in panels[0]["current"]] == [
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
    ]
    assert all(
        [c["week_start"] for c in p["current"]] == ["2026-09-14", "2026-09-21", "2026-09-28"]
        for p in panels
    )  # points_done is a snapshot and follows the same rule
    out = trends.build_sparklines(rows, dt.date(2026, 10, 7))
    assert out["messages"] == [135.0, 170.0, 0.0, 263.0, 281.0]  # ends at the last complete week
    assert out["tasks_created"] == [40.0, 50.0, 0.0, 46.0, 69.0]


def test_a_week_rolled_up_on_all_seven_days_is_kept():
    rows = WEEKLY + [dict(PARTIAL, days=7)]
    panels = trends.build_panels(rows, BOUNDS)
    assert [c["week_start"] for c in panels[0]["current"]][-1] == "2026-10-05"
    assert panels[0]["current"][-1]["value"] == round(90 / 23, 2)
    out = trends.build_sparklines(rows, dt.date(2026, 10, 11))
    assert out["messages"][-1] == 99.0 and len(out["messages"]) == 6


def test_a_range_whose_only_week_is_partial_yields_empty_panels():
    # the 7d preset holds exactly one Monday; on Thursday 2026-10-08 that week has three rolled-up days
    seven = RangeBounds(
        "7d", dt.date(2026, 10, 2), dt.date(2026, 10, 8), dt.date(2026, 9, 25), dt.date(2026, 10, 1)
    )
    panels = trends.build_panels(WEEKLY + [PARTIAL], seven)
    assert [p["current"] for p in panels] == [[], [], []]
    assert [c["week_start"] for c in panels[0]["previous"]] == ["2026-09-28"]


def test_the_sparklines_keep_twelve_complete_weeks_when_the_week_in_progress_is_left_out():
    many = [
        dict(WEEKLY[0], week_start=(dt.date(2026, 7, 6) + dt.timedelta(weeks=i)).isoformat())
        for i in range(13)
    ]  # 2026-07-06 … 2026-09-28, all complete
    many.append(dict(PARTIAL))
    out = trends.build_sparklines(many, dt.date(2026, 10, 7))
    # 2026-07-13 … 2026-09-28: the window ends at the last complete week, so it still holds twelve
    assert out["messages"] == [135.0] * 12
    assert trends.build_sparklines([PARTIAL], dt.date(2026, 10, 7)) == {}


def test_delta_is_a_fraction_and_null_without_a_baseline():
    assert trends.delta(118, 100) == 0.18
    assert trends.delta(90, 100) == -0.1
    assert trends.delta(5, 0) is None
    assert trends.delta(None, 3) is None and trends.delta(3, None) is None


def test_week_of_is_monday():
    assert trends.week_of(dt.date(2026, 10, 7)) == dt.date(2026, 10, 5)
    assert trends.week_of(dt.date(2026, 10, 5)) == dt.date(2026, 10, 5)


def test_dense_weeks_fills_quiet_weeks_with_zeros_from_the_week_of_start_to_the_week_of_end():
    rows = [
        {"week_start": "2026-09-07", "team_members": 100, "dm": 120},
        {"week_start": "2026-09-21", "team_members": 7, "dm": 0},
    ]
    out = trends.dense_weeks(
        rows, dt.date(2026, 9, 8), dt.date(2026, 10, 7), keys=("team_members", "dm")
    )
    assert [r["week_start"] for r in out] == [
        "2026-09-07",
        "2026-09-14",
        "2026-09-21",
        "2026-09-28",
        "2026-10-05",
    ]
    assert out[0] == {"week_start": "2026-09-07", "team_members": 100, "dm": 120}
    assert out[1] == {"week_start": "2026-09-14", "team_members": 0, "dm": 0}
    assert trends.dense_weeks([], dt.date(2026, 10, 5), dt.date(2026, 10, 5), keys=("dm",)) == [
        {"week_start": "2026-10-05", "dm": 0}
    ]


def test_dense_weeks_drops_rows_outside_the_range():
    rows = [
        {"week_start": "2026-08-31", "dm": 9},  # before the range
        {"week_start": "2026-09-14", "dm": 4},
        {"week_start": "2026-10-12", "dm": 2},  # after it
    ]
    out = trends.dense_weeks(rows, dt.date(2026, 9, 8), dt.date(2026, 9, 20), keys=("dm",))
    assert out == [{"week_start": "2026-09-07", "dm": 0}, {"week_start": "2026-09-14", "dm": 4}]
