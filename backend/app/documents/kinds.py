"""The kinds of project document the API serves, and what each one is made of.

A ``Kind`` names its body model, its seed (the body of a new document), its derived sections (what the
board says, ``derive.py``), the checks that hold back a finalize, and its Markdown renderer. To add a kind,
write those and file it in ``KINDS``. The database also allows ``sprint_plan`` and ``release_plan``; the
API refuses them until they are filed here.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from pydantic import BaseModel

from app.documents import derive, markdown
from app.documents.derive import Ctx
from app.documents.markdown import Heading
from app.documents.models import ReleaseSummaryBody, SprintReportBody, TestReportBody


@dataclass(frozen=True)
class Kind:
    """One kind of document.

    Attributes:
        name: ``project_documents.kind``.
        per_sprint: One per sprint (it names its sprint), or one per project.
        title: How the kind is named; a sprint's document is named after its sprint (:func:`title_of`).
        body_model: What a save accepts as the body.
        seed: ``ctx -> body``, the first revision of a new document.
        derive: ``(ctx, body) -> derived``, the sections the board supplies.
        blocking_checks: ``(ctx, body, derived) -> [message]``; finalize answers 409 with the first.
        render: ``(heading, body, derived) -> Markdown``.
        reads_burnup: The derived sections need the sprint's saved burnup days.
        reads_repos: The derived sections need the team's repository URLs.
    """

    name: str
    per_sprint: bool
    title: str
    body_model: type[BaseModel]
    seed: Callable[[Ctx], dict]
    derive: Callable[[Ctx, dict], dict]
    blocking_checks: Callable[[Ctx, dict, dict], list[str]]
    render: Callable[[Heading, dict, dict], str]
    reads_burnup: bool = False
    reads_repos: bool = False


KINDS: dict[str, Kind] = {
    kind.name: kind
    for kind in (
        Kind(
            name="sprint_report",
            per_sprint=True,
            title="Sprint report",
            body_model=SprintReportBody,
            seed=derive.seed_sprint_report,
            derive=derive.derive_sprint_report,
            blocking_checks=derive.checks_sprint_report,
            render=markdown.render_sprint_report,
            reads_burnup=True,
        ),
        Kind(
            name="release_summary",
            per_sprint=False,
            title="Release summary",
            body_model=ReleaseSummaryBody,
            seed=derive.seed_release_summary,
            derive=derive.derive_release_summary,
            blocking_checks=derive.checks_release_summary,
            render=markdown.render_release_summary,
        ),
        Kind(
            name="test_report",
            per_sprint=False,
            title="Test plan and report",
            body_model=TestReportBody,
            seed=derive.seed_test_report,
            derive=derive.derive_test_report,
            blocking_checks=derive.checks_test_report,
            render=markdown.render_test_report,
            reads_repos=True,
        ),
    )
}

#: The order a team's documents are listed in: a sprint's (sprint by sprint), then the project's.
ORDER = tuple(KINDS)


def title_of(kind: Kind, sprint: dict | None) -> str:
    """A document's name: "Sprint 2 report" for a sprint's, the kind's title for a project's."""
    if kind.per_sprint and sprint is not None:
        return f"{markdown.sprint_label(sprint['name'])} report"
    return kind.title
