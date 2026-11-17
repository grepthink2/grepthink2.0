"""A document as Markdown, in its template's order: one renderer per kind, each a pure function of the
document's heading, its body (what the team typed) and its derived sections (what the board said).

Text a student typed can't change the document's structure. A single-line field (an action, a title, a
known problem) has its line breaks folded into spaces and every character Markdown would read as markup
escaped, a list marker or a heading underline at its start included, so a reason that starts with ``#``
stays text. A note keeps its paragraphs, each line escaped the same way. A scenario's steps are Markdown
on purpose: they go inside a block quote, which holds whatever they open (an unclosed code fence ends with
the quote), with headings and heading underlines escaped.
"""

from __future__ import annotations

import re
import string
from dataclasses import dataclass
from datetime import date

_MONTHS = (
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
)
#: Markdown's inline markup, escaped wherever it appears in student text.
_MARKUP = re.compile(r"([\\`*_\[\]<>#|~&])")
#: An ordered-list marker at the start of a line ("1." or "1)").
_ORDERED = re.compile(r"(\d{1,9})([.)])")
#: A setext heading underline (or a thematic break) as a line of a scenario's steps.
_UNDERLINE = re.compile(r" {0,3}(=+|-+)[ \t]*")
_RESULTS = {"pass": "Pass", "fail": "Fail"}
_PROBLEM_GROUPS = (("bug", "Bugs"), ("omission", "Omissions"), ("shortcut", "Design shortcuts"))
_GONE = "A story that is no longer on the board"


@dataclass(frozen=True)
class Heading:
    """The template's heading block: the product and team (the project's name) and the date, and for a
    sprint's document its sprint and where its burnup is on the board."""

    project_name: str
    date: date
    sprint_name: str | None = None
    board_url: str | None = None


# ----------------------------------------------------------------------- escaping ----


def inline(text) -> str:
    """One line of student text as Markdown text (see the module docstring)."""
    flat = " ".join(str(text or "").split())
    escaped = _MARKUP.sub(r"\\\1", flat)
    ordered = _ORDERED.match(escaped)
    if ordered:
        return f"{ordered.group(1)}\\{ordered.group(2)}{escaped[ordered.end() :]}"
    if escaped[:1] in ("-", "+", "="):
        return "\\" + escaped
    return escaped


def paragraphs(text) -> str:
    """A note's paragraphs, each of its lines escaped as :func:`inline` does."""
    out: list[str] = []
    gap = False
    for raw in str(text or "").splitlines():
        line = inline(raw)
        if not line:
            gap = bool(out)
            continue
        if gap:
            out.append("")
            gap = False
        out.append(line)
    return "\n".join(out)


def quoted(text) -> str:
    """A Markdown field as a block quote, its headings and heading underlines escaped."""
    out = []
    for line in str(text or "").strip("\n").splitlines():
        stripped = line.lstrip()
        if stripped.startswith("#") or _UNDERLINE.fullmatch(line):
            line = line[: len(line) - len(stripped)] + "\\" + stripped
        out.append(f"> {line}" if line.strip() else ">")
    return "\n".join(out)


def code(text) -> str:
    """Text as a code span, fenced with more backticks than it holds in a row."""
    flat = " ".join(str(text or "").split())
    longest = max((len(run) for run in re.findall(r"`+", flat)), default=0)
    fence = "`" * (longest + 1)
    pad = " " if flat.startswith("`") or flat.endswith("`") else ""
    return f"{fence}{pad}{flat}{pad}{fence}"


# ------------------------------------------------------------------------ pieces ----


def sprint_label(name: str) -> str:
    """A sprint as a heading names it: "Sprint 3" as it is, "Alpha" as "Sprint Alpha"."""
    name = " ".join(str(name or "").split())
    return name if re.match(r"(?i)sprint\b", name) else f"Sprint {name}".strip()


def day_label(day: date) -> str:
    """ "December 4, 2026", whatever the server's locale."""
    return f"{_MONTHS[day.month - 1]} {day.day}, {day.year}"


def _count(n: int, unit: str) -> str:
    return f"{n} {unit}" if n == 1 else f"{n} {unit}s"


def _section(items: list[str]) -> list[str]:
    """A section's lines, "None." when it has none, and the blank line after it."""
    return [*(items or ["None."]), ""]


def _head(title: str, heading: Heading) -> list[str]:
    project = inline(heading.project_name)
    return [
        f"# {title}",
        "",
        f"- **Product:** {project}",
        f"- **Team:** {project}",
        f"- **Date:** {day_label(heading.date)}",
        "",
    ]


def _story(item: dict, *extra: str) -> str:
    """A story line: its key and title, and its points, hours or sprint when it has them."""
    details = []
    if item.get("points") is not None:
        details.append(_count(item["points"], "point"))
    if item.get("hours") is not None:
        details.append(_count(item["hours"], "hour"))
    details += [e for e in extra if e]
    text = f"- {inline(item['key'])}: {inline(item['title'])}"
    return f"{text} ({', '.join(details)})" if details else text


def _ref(ref: dict) -> str:
    if ref.get("missing"):
        return _GONE
    return f"{inline(ref['key'])}: {inline(ref['title'])}"


def _text(lines: list[str]) -> str:
    return "\n".join(lines).rstrip("\n") + "\n"


# --------------------------------------------------------------------- renderers ----


def render_sprint_report(heading: Heading, body: dict, derived: dict) -> str:
    sprint = inline(sprint_label(heading.sprint_name or ""))
    lines = _head(f"{sprint} Report", heading)
    for title, key in (
        ("Actions to stop doing", "stop"),
        ("Actions to start doing", "start"),
        ("Actions to keep doing", "keep"),
    ):
        items = [
            f"- **{inline(a['action'])}** {inline(a.get('reason'))}".rstrip()
            for a in body.get(key) or []
        ]
        note = paragraphs(body.get("satisfied_note")) if key == "stop" else ""
        lines += [f"## {title}", ""]
        if items:
            lines += [*items, ""]
        if note:
            lines += [note, ""]
        if not items and not note:
            lines += ["None.", ""]

    lines += ["## Work completed / not completed", "", "### Completed", ""]
    lines += _section([_story(s) for s in derived["completed"]])
    lines += ["### Not completed", ""]
    lines += _section([_story(s) for s in derived["not_completed"]])

    to_date = derived["to_date"]
    lines += [
        "## Work completion rate",
        "",
        f"- User stories completed: {derived['stories_completed']}",
        f"- Ideal work hours completed: {derived['hours_completed']}",
        f"- Days in the sprint: {derived['days']}",
        f"- User stories per day: {derived['stories_per_day']:.2f}",
        f"- Ideal work hours per day: {derived['hours_per_day']:.2f}",
        f"- To date ({_count(to_date['sprints_counted'], 'sprint')}): "
        f"{to_date['stories_per_day']:.2f} user stories per day, "
        f"{to_date['hours_per_day']:.2f} ideal work hours per day",
    ]
    if heading.board_url:
        lines.append(f"- Burnup: [{sprint} on the board]({heading.board_url})")
    return _text(lines)


def render_release_summary(heading: Heading, body: dict, derived: dict) -> str:
    lines = _head("Release Summary", heading)
    lines += ["## Key user stories and acceptance criteria", ""]
    if not derived["key_stories"]:
        lines += ["None.", ""]
    for story in derived["key_stories"]:
        if story.get("missing"):
            lines += [f"### {_GONE}", ""]
            continue
        lines += [f"### {inline(story['key'])}: {inline(story['title'])}", ""]
        criteria = story.get("acceptance_criteria") or []
        lines += [f"{n}. {inline(c)}" for n, c in enumerate(criteria, start=1)] or [
            "No acceptance criteria."
        ]
        lines.append("")

    lines += ["## Known problems", ""]
    problems = body.get("known_problems") or []
    for kind, title in _PROBLEM_GROUPS:
        lines += [f"### {title}", ""]
        lines += _section([f"- {inline(p['text'])}" for p in problems if p.get("kind") == kind])

    lines += ["## Product backlog", ""]
    lines += _section(
        [
            _story(item, f"in {inline(item['in_sprint'])}" if item.get("in_sprint") else "")
            for item in derived["backlog"]
        ]
    )
    lines += ["### Follow-ups", ""]
    lines += _section([f"- {inline(f['text'])}" for f in body.get("follow_ups") or []])
    return _text(lines)


def render_test_report(heading: Heading, body: dict, derived: dict) -> str:
    lines = _head("Test Plan and Report", heading)
    lines += ["## System test scenarios", ""]
    stories = derived.get("stories") or {}
    scenarios = body.get("scenarios") or []
    if not scenarios:
        lines += ["None.", ""]
    for n, scenario in enumerate(scenarios, start=1):
        lines += [f"### Scenario {n}", ""]
        refs = [stories.get(str(i), {"missing": True}) for i in scenario.get("story_ids") or []]
        if refs:
            letters = string.ascii_lowercase
            lines += [f"- {letters[i]}. {_ref(ref)}" for i, ref in enumerate(refs)] + [""]
        result = _RESULTS.get(scenario.get("result"), "Not run")
        lines += [f"**{inline(scenario['title'])}** ({result})", ""]
        if (scenario.get("steps_md") or "").strip():
            lines += [quoted(scenario["steps_md"]), ""]
        if (scenario.get("note") or "").strip():
            lines += [f"Note: {inline(scenario['note'])}", ""]

    lines += ["## Unit tests", ""]
    unit_tests = []
    for test in body.get("unit_tests") or []:
        line = f"- {code(test['location'])} ({'failing' if test.get('failing') else 'passing'})"
        unit_tests.append(f"{line}: {inline(test['note'])}" if test.get("note") else line)
    lines += _section(unit_tests)
    note = paragraphs(body.get("unit_tests_note"))
    if note:
        lines += [note, ""]
    repositories = derived.get("repositories") or []
    if repositories:
        lines += ["Repositories:", "", *[f"- {inline(r)}" for r in repositories], ""]
    return _text(lines)
