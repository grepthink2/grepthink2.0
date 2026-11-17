"""The board's side of a document: what each kind derives, seeds and checks (``app.documents.derive``).

One board serves every test: three sprints and a backlog. Sprint 1 (Sep 7-13, 7 days) holds US-1 (done),
US-2 (one task not done) and US-3 (no task). Sprint 2 (Sep 14-27, 14 days) holds US-5 (rank 1, done),
US-7 (rank 2, under way), US-4 (unranked, done) and, as a legacy archived row, US-6, which the board lists
in the backlog. Sprint 3 holds US-8. The backlog holds US-10 (rank 1) and US-9.
"""

from __future__ import annotations

from datetime import date

import pytest

from app.documents import derive
from app.documents.derive import Ctx
from tests.documents_support import PID, documents_db, sprint, story, task

S1, S2, S3 = (f"5b000000-0000-4000-8000-00000000000{n}" for n in (1, 2, 3))
SPRINTS = [
    sprint(S1, "Sprint 1", "2026-09-07", "2026-09-13"),
    sprint(S2, "Sprint 2", "2026-09-14", "2026-09-27"),
    sprint(S3, "Sprint 3", "2026-09-28", "2026-10-11"),
]


def sid(n: int) -> str:
    return f"5c000000-0000-4000-8000-0000000000{n:02d}"


MISSING = "5c000000-0000-4000-8000-0000000000ff"

STORIES = [
    story(sid(1), "US-1", S1, rank=1, points=3, criteria=("Finds a trail by name",)),
    story(sid(2), "US-2", S1, rank=2, points=2),
    story(sid(3), "US-3", S1),
    story(sid(4), "US-4", S2, points=5, criteria=("Saves a trail", "Lists saved trails")),
    story(sid(5), "US-5", S2, rank=1, points=1),
    story(sid(6), "US-6", S2, archived=True),
    story(sid(7), "US-7", S2, rank=2, points=8, criteria=("Shows elevation",)),
    story(sid(8), "US-8", S3, criteria=("Exports GPX",)),
    story(sid(9), "US-9", None, points=2),
    story(sid(10), "US-10", None, rank=1, criteria=("Works offline",)),
]


def tid(n: int) -> str:
    return f"5d000000-0000-4000-8000-0000000000{n:02d}"


TASKS = [
    task(tid(1), sid(1), "done", hours=4),
    task(tid(2), sid(1), "done", hours=2),
    task(tid(3), sid(2), "done", hours=3),
    task(tid(4), sid(2), "todo", hours=1),
    task(tid(5), sid(4), "done", hours=5),
    task(tid(6), sid(4), "done", hours=5),
    task(tid(7), sid(5), "done"),
    task(tid(8), sid(7), "in_progress", hours=3),
    task(tid(9), sid(8), "todo", hours=2),
]

BURNUP_S2 = [
    {
        "sprint_id": S2,
        "day": "2026-09-14",
        "scope_points": 0,
        "completed_points": 0,
        "scope_hours": 14,
        "completed_hours": 0,
    },
    {
        "sprint_id": S2,
        "day": "2026-09-20",
        "scope_points": 0,
        "completed_points": 0,
        "scope_hours": 14,
        "completed_hours": 5,
    },
    {
        "sprint_id": S2,
        "day": "2026-09-27",
        "scope_points": 0,
        "completed_points": 0,
        "scope_hours": 14,
        "completed_hours": 10,
    },
]

AFTER_SPRINT_2 = date(2026, 10, 1)
REPO = "https://github.com/team/trailhead"


def ctx(sprint_id: str | None = None, *, today: date = AFTER_SPRINT_2, **changes) -> Ctx:
    sprints = changes.pop("sprints", SPRINTS)
    return Ctx(
        project_id=PID,
        sprint=next((s for s in sprints if s["id"] == sprint_id), None),
        sprints=sprints,
        stories=changes.pop("stories", STORIES),
        tasks=changes.pop("tasks", TASKS),
        today=today,
        burnup_days=changes.pop("burnup_days", BURNUP_S2),
        repos=changes.pop("repos", [REPO]),
    )


def line(n: int, key: str, points, hours) -> dict:
    return {"id": sid(n), "key": key, "title": f"Story {key}", "points": points, "hours": hours}


# ----------------------------------------------------------------- the completed rule ----


@pytest.mark.parametrize(
    ("statuses", "completed"),
    [
        ([], False),  # no task: nothing shows the story was done
        (["done", "todo"], False),
        (["done", "in_progress"], False),
        (["done"], True),
        (["done", "done"], True),
    ],
)
def test_a_story_is_completed_when_it_has_tasks_and_every_one_is_done(statuses, completed):
    tasks = [{"status": s} for s in statuses]
    assert derive.story_completed({"id": "s"}, tasks) is completed


# ------------------------------------------------------------------- sprint report ----


def test_the_sprint_report_splits_the_sprint_and_works_out_its_rates():
    """Sprint 2: US-5 and US-4 done (US-5 has no hours), US-7 under way; the archived US-6 is not
    in the sprint. 2 stories and 10 hours in 14 days; to date, with Sprint 1 (1 story, 9 hours, 7
    days), 3 stories and 19 hours in 21 days. Sprint 3 starts later and does not count."""
    out = derive.derive_sprint_report(ctx(S2), {})

    assert out["completed"] == [line(5, "US-5", 1, None), line(4, "US-4", 5, 10)]
    assert out["not_completed"] == [line(7, "US-7", 8, 3)]
    assert (out["stories_completed"], out["hours_completed"], out["days"]) == (2, 10, 14)
    assert (out["stories_per_day"], out["hours_per_day"]) == (0.14, 0.71)
    assert out["to_date"] == {"sprints_counted": 2, "stories_per_day": 0.14, "hours_per_day": 0.9}


def test_hours_completed_counts_every_done_task_of_the_sprint_whatever_its_story():
    """Sprint 1: US-1's 4 + 2 hours and the 3 of US-2's done task; US-2 itself is not completed."""
    out = derive.derive_sprint_report(ctx(S1), {})

    assert out["completed"] == [line(1, "US-1", 3, 6)]
    assert out["not_completed"] == [line(2, "US-2", 2, 4), line(3, "US-3", None, None)]
    assert (out["stories_completed"], out["hours_completed"], out["days"]) == (1, 9, 7)
    assert (out["stories_per_day"], out["hours_per_day"]) == (0.14, 1.29)
    assert out["to_date"] == {"sprints_counted": 1, "stories_per_day": 0.14, "hours_per_day": 1.29}


def test_the_sprint_report_draws_the_sprints_burnup_from_its_saved_days():
    """In hours, as the board would (Sprint 2's tasks have no points); each day carries the last
    saved one forward."""
    out = derive.derive_sprint_report(ctx(S2), {})

    labels = [f"9/{d}" for d in range(14, 28)]
    assert out["burnup"] == {
        "unit": "hours",
        "labels": labels,
        "scope": [14] * 14,
        "completed": [0] * 6 + [5] * 7 + [10],
    }


def test_the_burnup_is_in_points_when_every_task_of_the_sprint_has_them():
    tasks = [{**t, "points": 2} if t["story_id"] in (sid(4), sid(5), sid(7)) else t for t in TASKS]
    days = [{**d, "scope_points": 8, "completed_points": 6} for d in BURNUP_S2]
    out = derive.derive_sprint_report(ctx(S2, tasks=tasks, burnup_days=days), {})

    assert out["burnup"]["unit"] == "points"
    assert out["burnup"]["scope"] == [8] * 14


def test_a_sprint_under_way_ends_its_burnup_today_with_the_live_values():
    out = derive.derive_sprint_report(ctx(S2, today=date(2026, 9, 21)), {})

    assert len(out["burnup"]["labels"]) == 14
    # 9/14 to 9/20 from the saved days; today (9/21) the live values: 13 hours, 10 of them done.
    assert out["burnup"]["completed"] == [0] * 6 + [5, 10]
    assert out["burnup"]["scope"] == [14] * 7 + [13]


# ----------------------------------------------------------------- release summary ----


def test_the_release_summary_names_each_key_story_in_the_bodys_order():
    out = derive.derive_release_summary(ctx(), {"key_story_ids": [sid(4), MISSING, sid(2)]})

    assert out["key_stories"] == [
        {
            "id": sid(4),
            "key": "US-4",
            "title": "Story US-4",
            "acceptance_criteria": ["Saves a trail", "Lists saved trails"],
            "completed": True,
        },
        {"id": MISSING, "missing": True},
        {
            "id": sid(2),
            "key": "US-2",
            "title": "Story US-2",
            "acceptance_criteria": [],
            "completed": False,
        },
    ]


def test_the_release_summary_backlog_is_the_unfinished_sprint_stories_then_the_backlog():
    """Sprints by start, each sprint's stories in board order, completed ones left out; then the
    backlog in board order, the legacy archived US-6 included."""
    out = derive.derive_release_summary(ctx(), {"key_story_ids": []})

    assert [(b["key"], b["in_sprint"]) for b in out["backlog"]] == [
        ("US-2", "Sprint 1"),
        ("US-3", "Sprint 1"),
        ("US-7", "Sprint 2"),
        ("US-8", "Sprint 3"),
        ("US-10", None),
        ("US-6", None),
        ("US-9", None),
    ]
    assert out["backlog"][0] == {
        "id": sid(2),
        "key": "US-2",
        "title": "Story US-2",
        "points": 2,
        "in_sprint": "Sprint 1",
    }


# --------------------------------------------------------------------- test report ----


def test_the_test_report_names_each_story_once_and_the_uncovered_ones():
    """Two scenarios name US-7: its criteria are stored once, under its id."""
    body = {
        "scenarios": [
            {"id": "sc-1", "story_ids": [sid(1), sid(7)]},
            {"id": "sc-2", "story_ids": [sid(7), MISSING]},
        ]
    }
    out = derive.derive_test_report(ctx(), body)

    assert out["stories"] == {
        sid(1): {
            "key": "US-1",
            "title": "Story US-1",
            "acceptance_criteria": ["Finds a trail by name"],
        },
        sid(7): {"key": "US-7", "title": "Story US-7", "acceptance_criteria": ["Shows elevation"]},
        MISSING: {"missing": True},
    }
    assert out["scenarios"] == [
        {"id": "sc-1", "story_ids": [sid(1), sid(7)]},
        {"id": "sc-2", "story_ids": [sid(7), MISSING]},
    ]
    assert out["repositories"] == [REPO]
    # Stories with criteria that no scenario covers, in board order (US-5, US-6 and US-9 have none).
    assert out["uncovered"] == [
        {"id": sid(4), "key": "US-4", "title": "Story US-4"},
        {"id": sid(8), "key": "US-8", "title": "Story US-8"},
        {"id": sid(10), "key": "US-10", "title": "Story US-10"},
    ]


# --------------------------------------------------------------------------- seeds ----


def test_a_sprint_report_starts_empty():
    assert derive.seed_sprint_report(ctx(S2)) == {
        "stop": [],
        "start": [],
        "keep": [],
        "satisfied_note": "",
    }


def test_a_release_summary_starts_with_the_completed_stories_in_board_order():
    assert derive.seed_release_summary(ctx()) == {
        "key_story_ids": [sid(1), sid(5), sid(4)],
        "known_problems": [],
        "follow_ups": [],
    }


def test_a_test_report_starts_with_a_scenario_per_completed_story_that_has_criteria():
    seed = derive.seed_test_report(ctx())

    scenarios = seed.pop("scenarios")
    assert seed == {"unit_tests": [], "unit_tests_note": ""}
    assert [{k: v for k, v in s.items() if k != "id"} for s in scenarios] == [
        {
            "title": "Story US-1",
            "story_ids": [sid(1)],
            "steps_md": "1. Finds a trail by name",
            "result": None,
            "note": "",
        },
        {
            "title": "Story US-4",
            "story_ids": [sid(4)],
            "steps_md": "1. Saves a trail\n2. Lists saved trails",
            "result": None,
            "note": "",
        },
    ]
    assert len({s["id"] for s in scenarios}) == 2


def test_seeds_keep_within_the_bodys_limits():
    """31 completed stories with long titles and 20 long criteria each: 30 key stories; titles cut
    to 120; as many whole criteria as fit in 2000 characters of steps."""
    many = [
        story(
            f"6c000000-0000-4000-8000-0000000000{n:02d}",
            f"US-{n}",
            S1,
            title="T" * 200,
            criteria=tuple(f"{n}: " + "c" * 290 for _ in range(20)),
        )
        for n in range(31)
    ]
    tasks = [
        task(f"6d000000-0000-4000-8000-0000000000{n:02d}", s["id"], "done")
        for n, s in enumerate(many)
    ]
    board = ctx(stories=many, tasks=tasks)

    assert len(derive.seed_release_summary(board)["key_story_ids"]) == 30
    scenario = derive.seed_test_report(board)["scenarios"][0]
    assert scenario["title"] == "T" * 120
    steps = scenario["steps_md"].split("\n")
    assert len(scenario["steps_md"]) <= 2000
    assert len(steps) == 6  # each numbered line is 296 characters and a line break: 7 pass 2000
    assert steps[-1].startswith("6. 0: ")


def test_a_test_report_seed_holds_at_most_60_scenarios():
    many = [
        story(f"7c000000-0000-4000-8000-0000000000{n:02d}", f"US-{n}", S1, criteria=("ok",))
        for n in range(61)
    ]
    tasks = [
        task(f"7d000000-0000-4000-8000-0000000000{n:02d}", s["id"], "done")
        for n, s in enumerate(many)
    ]
    assert len(derive.seed_test_report(ctx(stories=many, tasks=tasks))["scenarios"]) == 60


# ------------------------------------------------------------------- blocking checks ----


def _action() -> dict:
    return {"id": "a", "action": "Pair up", "reason": ""}


@pytest.mark.parametrize(
    ("today", "body", "failures"),
    [
        (
            date(2026, 9, 27),  # the sprint's last day: not over yet
            {},
            [derive.SPRINT_NOT_ENDED, derive.NEED_START, derive.NEED_KEEP, derive.NEED_STOP],
        ),
        (AFTER_SPRINT_2, {"keep": [_action()], "stop": [_action()]}, [derive.NEED_START]),
        (AFTER_SPRINT_2, {"start": [_action()], "stop": [_action()]}, [derive.NEED_KEEP]),
        (AFTER_SPRINT_2, {"start": [_action()], "keep": [_action()]}, [derive.NEED_STOP]),
        (AFTER_SPRINT_2, {"start": [_action()], "keep": [_action()], "stop": [_action()]}, []),
        (
            AFTER_SPRINT_2,
            {"start": [_action()], "keep": [_action()], "satisfied_note": "Nothing slowed us"},
            [],
        ),
    ],
)
def test_the_sprint_report_checks(today, body, failures):
    board = ctx(S2, today=today)
    assert (
        derive.checks_sprint_report(board, body, derive.derive_sprint_report(board, body))
        == failures
    )


@pytest.mark.parametrize(
    ("key_story_ids", "failures"),
    [
        ([], [derive.NEED_KEY_STORY]),
        ([sid(4), sid(2)], [derive.NEED_CRITERIA]),  # US-2 has none
        ([sid(4), MISSING], [derive.NEED_CRITERIA]),  # a story no longer on the board has none
        ([sid(4), sid(1)], []),
    ],
)
def test_the_release_summary_checks(key_story_ids, failures):
    body = {"key_story_ids": key_story_ids}
    board = ctx()
    assert (
        derive.checks_release_summary(board, body, derive.derive_release_summary(board, body))
        == failures
    )


@pytest.mark.parametrize(
    ("results", "failures"),
    [
        ([], [derive.NEED_SCENARIO]),
        (["pass", None], [derive.NEED_RESULTS]),
        (["pass", "fail"], []),
    ],
)
def test_the_test_report_checks(results, failures):
    body = {
        "scenarios": [{"id": str(n), "story_ids": [], "result": r} for n, r in enumerate(results)]
    }
    board = ctx()
    assert (
        derive.checks_test_report(board, body, derive.derive_test_report(board, body)) == failures
    )


def test_the_check_messages_are_the_ones_the_page_shows():
    assert [
        derive.SPRINT_NOT_ENDED,
        derive.NEED_START,
        derive.NEED_KEEP,
        derive.NEED_STOP,
        derive.NEED_KEY_STORY,
        derive.NEED_CRITERIA,
        derive.NEED_SCENARIO,
        derive.NEED_RESULTS,
    ] == [
        "The sprint has not ended yet",
        "Add at least one action to start doing",
        "Add at least one action to keep doing",
        "Add an action to stop doing, or say why there is none",
        "Pick at least one key story",
        "Every key story needs acceptance criteria",
        "Add at least one test scenario",
        "Mark every scenario as passed or failed",
    ]


# --------------------------------------------------------------------- the reads ----


@pytest.mark.parametrize(
    ("burnup", "repos", "executes"),
    [(False, False, 3), (True, False, 4), (False, True, 4)],
)
def test_the_context_reads_the_board_once_and_only_what_the_kind_needs(
    monkeypatch, burnup, repos, executes
):
    db = documents_db(
        monkeypatch,
        sprints=[dict(s) for s in SPRINTS],
        user_stories=[dict(s) for s in STORIES],
        tasks=[dict(t) for t in TASKS],
        sprint_burnup_days=[dict(d) for d in BURNUP_S2],
        scrum_repos=[
            {
                "id": "r1",
                "project_id": PID,
                "repo_url": REPO,
                "access_token": "secret",
                "created_at": "2026-09-01T00:00:00+00:00",
            }
        ],
    )
    from app.core.db import get_client

    board = derive.load_context(
        get_client(), PID, S2, today=AFTER_SPRINT_2, burnup=burnup, repos=repos
    )

    assert db.executes == executes
    assert board.sprint["name"] == "Sprint 2"
    assert [s["id"] for s in board.sprints] == [S1, S2, S3]
    assert len(board.stories) == len(STORIES) and len(board.tasks) == len(TASKS)
    assert board.burnup_days == (BURNUP_S2 if burnup else [])
    assert board.repos == ([REPO] if repos else [])  # the URLs alone, never a token
