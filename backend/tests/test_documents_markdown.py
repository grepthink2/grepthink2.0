"""The Markdown export (``app.documents.markdown``): each kind in its template's order, checked against a
golden file in tests/fixtures/documents/, and student text that can't break the structure."""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import pytest

from app.documents import markdown
from app.documents.markdown import Heading

FIXTURES = Path(__file__).parent / "fixtures" / "documents"
BOARD = "https://grepthink.example/app/projects/p1/board?view=burnup&sprint=s2"


def golden(name: str) -> str:
    return (FIXTURES / f"{name}.md").read_text(encoding="utf-8")


def act(action: str, reason: str = "") -> dict:
    return {"id": action, "action": action, "reason": reason}


SPRINT_BODY = {
    "stop": [act("Skipping standups", "We lost track of blockers.")],
    "start": [act("Pairing on reviews"), act("Writing tests first", "Fewer bugs reached main.")],
    "keep": [act("Demo on Fridays", "The client sees progress.")],
    "satisfied_note": "",
}
SPRINT_DERIVED = {
    "completed": [
        {"id": "5", "key": "US-5", "title": "Search by name", "points": 1, "hours": None},
        {"id": "4", "key": "US-4", "title": "Save a trail", "points": 5, "hours": 10},
    ],
    "not_completed": [
        {"id": "7", "key": "US-7", "title": "Show elevation", "points": 8, "hours": 3},
        {"id": "3", "key": "US-3", "title": "Story without tasks", "points": None, "hours": None},
    ],
    "stories_completed": 2,
    "hours_completed": 10,
    "days": 14,
    "stories_per_day": 0.14,
    "hours_per_day": 0.71,
    "to_date": {"sprints_counted": 2, "stories_per_day": 0.14, "hours_per_day": 0.9},
    "burnup": {"unit": "hours", "labels": [], "scope": [], "completed": []},
}

RELEASE_BODY = {
    "key_story_ids": ["4", "gone", "2"],
    "known_problems": [
        {"id": "p1", "kind": "bug", "text": "Search ignores accents"},
        {"id": "p2", "kind": "shortcut", "text": "Trail tiles are not cached"},
        {"id": "p3", "kind": "bug", "text": "The map flickers on zoom"},
    ],
    "follow_ups": [{"id": "f1", "text": "Cache trail tiles"}],
}
RELEASE_DERIVED = {
    "key_stories": [
        {
            "id": "4",
            "key": "US-4",
            "title": "Save a trail",
            "acceptance_criteria": ["Saves a trail", "Lists saved trails"],
            "completed": True,
        },
        {"id": "gone", "missing": True},
        {
            "id": "2",
            "key": "US-2",
            "title": "Filter trails",
            "acceptance_criteria": [],
            "completed": False,
        },
    ],
    "backlog": [
        {"id": "7", "key": "US-7", "title": "Show elevation", "points": 8, "in_sprint": "Sprint 2"},
        {"id": "10", "key": "US-10", "title": "Work offline", "points": None, "in_sprint": None},
        {"id": "9", "key": "US-9", "title": "Export a trail", "points": 2, "in_sprint": None},
    ],
}

TEST_BODY = {
    "scenarios": [
        {
            "id": "sc1",
            "title": "Search by name",
            "story_ids": ["1", "3"],
            "steps_md": '1. Open the app\n2. Type "Pogonip" in search\n\nThe trail shows first.',
            "result": "pass",
            "note": "Tested on iOS and Android.",
        },
        {
            "id": "sc2",
            "title": "Save a trail offline",
            "story_ids": ["gone"],
            "steps_md": "1. Turn on airplane mode",
            "result": "fail",
            "note": "",
        },
        {
            "id": "sc3",
            "title": "Export a trail",
            "story_ids": [],
            "steps_md": "",
            "result": None,
            "note": "",
        },
    ],
    "unit_tests": [
        {
            "id": "u1",
            "location": "backend/tests/test_trails.py",
            "note": "Covers search",
            "failing": True,
        },
        {"id": "u2", "location": "frontend/src/__tests__/", "note": "", "failing": False},
    ],
    "unit_tests_note": "Run them with npm test and pytest.",
}
TEST_DERIVED = {
    "stories": {
        "1": {"key": "US-1", "title": "Find a trail", "acceptance_criteria": []},
        "3": {"key": "US-3", "title": "Filter trails", "acceptance_criteria": []},
        "gone": {"missing": True},
    },
    "scenarios": [
        {"id": "sc1", "story_ids": ["1", "3"]},
        {"id": "sc2", "story_ids": ["gone"]},
        {"id": "sc3", "story_ids": []},
    ],
    "repositories": ["https://github.com/team/trailhead"],
    "uncovered": [],
}


def test_the_sprint_report_matches_its_golden_file():
    heading = Heading(
        project_name="Trailhead", date=date(2026, 9, 28), sprint_name="Sprint 2", board_url=BOARD
    )
    assert markdown.render_sprint_report(heading, SPRINT_BODY, SPRINT_DERIVED) == golden(
        "sprint_report"
    )


def test_the_release_summary_matches_its_golden_file():
    heading = Heading(project_name="Trailhead", date=date(2026, 12, 4))
    assert markdown.render_release_summary(heading, RELEASE_BODY, RELEASE_DERIVED) == golden(
        "release_summary"
    )


def test_the_test_report_matches_its_golden_file():
    heading = Heading(project_name="Trailhead", date=date(2026, 12, 4))
    assert markdown.render_test_report(heading, TEST_BODY, TEST_DERIVED) == golden("test_report")


@pytest.mark.parametrize(
    ("name", "title"),
    [
        ("Sprint 3", "Sprint 3"),
        ("sprint three", "sprint three"),
        ("Alpha", "Sprint Alpha"),
        ("Sprinter", "Sprint Sprinter"),
    ],
)
def test_a_sprint_is_named_sprint_once(name, title):
    assert markdown.sprint_label(name) == title


def test_an_empty_section_says_none():
    heading = Heading(project_name="Trailhead", date=date(2026, 9, 28), sprint_name="Sprint 2")
    derived = {**SPRINT_DERIVED, "completed": [], "not_completed": []}
    body = {
        "stop": [],
        "start": [],
        "keep": [],
        "satisfied_note": "Nothing held us back.\n\nReally.",
    }
    text = markdown.render_sprint_report(heading, body, derived)

    assert (
        "## Actions to stop doing\n\nNothing held us back.\n\nReally.\n\n## Actions to start"
        in text
    )
    assert "## Actions to start doing\n\nNone.\n\n## Actions to keep doing\n\nNone.\n" in text
    assert "### Completed\n\nNone.\n\n### Not completed\n\nNone.\n" in text
    assert "Burnup" not in text  # no link without the board's address


# --------------------------------------------------------------------------- escaping ----

HOSTILE = (
    "# Heading\n## Sub\n- item\n+ plus\n1. one\n2) two\n> quote\n```\n<script>alert(1)</script>\n---\n"
    "===\n| a | b |\n[x](https://evil.example) ![i](y) *b* _i_ `c` \\ ~s~ &amp; trailing #"
)


@pytest.mark.parametrize(
    ("text", "escaped"),
    [
        ("# Not a heading", r"\# Not a heading"),
        ("Line one\n# still line one", r"Line one \# still line one"),
        ("1. not a list", r"1\. not a list"),
        ("12) not a list", r"12\) not a list"),
        ("- not an item", r"\- not an item"),
        ("+ not an item", r"\+ not an item"),
        ("=== not a heading", r"\=== not a heading"),
        ("*b* _i_ `c` [l](u) <b> | ~s~ & \\", r"\*b\* \_i\_ \`c\` \[l\](u) \<b\> \| \~s\~ \& \\"),
        ("US-4: plain text stays", "US-4: plain text stays"),
    ],
)
def test_student_text_is_escaped(text, escaped):
    assert markdown.inline(text) == escaped


def test_a_code_span_holds_any_backticks():
    assert markdown.code("tests/a.py") == "`tests/a.py`"
    assert markdown.code("a `b` c") == "``a `b` c``"
    assert markdown.code("`edge`") == "`` `edge` ``"


def test_steps_stay_inside_their_quote():
    quoted = markdown.quoted("# Title\nStep\n===\n```\nunclosed fence\n\n- item")
    assert quoted.split("\n") == [
        r"> \# Title",
        "> Step",
        r"> \===",
        "> ```",
        "> unclosed fence",
        ">",
        "> - item",
    ]


def _headings(text: str) -> list[str]:
    """The lines that start a heading, outside the quoted steps."""
    return [line for line in text.split("\n") if line.startswith("#")]


def test_no_student_text_adds_a_heading_or_leaves_its_place():
    """Hostile text in every field a student types: the headings are the template's alone, and every
    line of a scenario's steps is quoted."""
    hostile_action = act(HOSTILE, HOSTILE)
    sprint = markdown.render_sprint_report(
        Heading(project_name=HOSTILE, date=date(2026, 9, 28), sprint_name=HOSTILE, board_url=BOARD),
        {
            "stop": [hostile_action],
            "start": [hostile_action],
            "keep": [hostile_action],
            "satisfied_note": HOSTILE,
        },
        {
            **SPRINT_DERIVED,
            "completed": [{"id": "x", "key": HOSTILE, "title": HOSTILE, "points": 1, "hours": 1}],
        },
    )
    assert _headings(sprint) == [
        sprint.split("\n")[0],
        "## Actions to stop doing",
        "## Actions to start doing",
        "## Actions to keep doing",
        "## Work completed / not completed",
        "### Completed",
        "### Not completed",
        "## Work completion rate",
    ]
    assert re.fullmatch(r"# Sprint .* Report", sprint.split("\n")[0])
    assert "\n# " not in sprint and "<script>" not in sprint

    release = markdown.render_release_summary(
        Heading(project_name=HOSTILE, date=date(2026, 12, 4)),
        {
            "key_story_ids": ["s"],
            "known_problems": [{"id": "p", "kind": "bug", "text": HOSTILE}],
            "follow_ups": [{"id": "f", "text": HOSTILE}],
        },
        {
            "key_stories": [
                {
                    "id": "s",
                    "key": HOSTILE,
                    "title": HOSTILE,
                    "acceptance_criteria": [HOSTILE],
                    "completed": True,
                }
            ],
            "backlog": [
                {"id": "b", "key": HOSTILE, "title": HOSTILE, "points": 1, "in_sprint": HOSTILE}
            ],
        },
    )
    assert [h.split(" ", 1)[0] for h in _headings(release)] == [
        "#",
        "##",
        "###",
        "##",
        "###",
        "###",
        "###",
        "##",
        "###",
    ]
    assert "<script>" not in release

    tests = markdown.render_test_report(
        Heading(project_name=HOSTILE, date=date(2026, 12, 4)),
        {
            "scenarios": [
                {
                    "id": "sc",
                    "title": HOSTILE,
                    "story_ids": ["s"],
                    "steps_md": HOSTILE,
                    "result": None,
                    "note": HOSTILE,
                }
            ],
            "unit_tests": [{"id": "u", "location": HOSTILE, "note": HOSTILE, "failing": True}],
            "unit_tests_note": HOSTILE,
        },
        {
            "stories": {"s": {"key": HOSTILE, "title": HOSTILE, "acceptance_criteria": []}},
            "scenarios": [{"id": "sc", "story_ids": ["s"]}],
            "repositories": [HOSTILE],
            "uncovered": [],
        },
    )
    assert _headings(tests) == [
        "# Test Plan and Report",
        "## System test scenarios",
        "### Scenario 1",
        "## Unit tests",
    ]
    lines = tests.split("\n")
    first = next(i for i, line in enumerate(lines) if line.startswith(">"))
    steps = lines[first : first + len(HOSTILE.split("\n"))]
    assert all(line.startswith(">") for line in steps)
    assert lines[first + len(steps)] == ""  # the quote ends where the steps end


def test_a_story_deleted_since_the_sprint_ended_is_named_as_gone():
    heading = Heading(project_name="Trailhead", date=date(2026, 9, 28), sprint_name="Sprint 2")
    derived = {**SPRINT_DERIVED, "completed": [{"id": "x", "missing": True}], "not_completed": []}
    text = markdown.render_sprint_report(heading, SPRINT_BODY, derived)
    assert "### Completed\n\n- A story that is no longer on the board\n\n### Not completed" in text
