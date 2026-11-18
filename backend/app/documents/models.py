"""Request models for project documents, and the body each kind of document saves.

A body holds what the team types; the board supplies the rest (the derived sections, ``derive.py``). Every
string is trimmed before it is measured. A body refuses a field it does not name, and every item in it
carries an id the web client makes (a UUID) that no other item of the same body has. Story ids are
references to the board, so two items may name one story; a list of them names each story once. The save
route checks that each named story is on the team's board.
"""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

#: Every kind the database knows (project_documents_kind_valid). The API serves the ones in
#: ``kinds.KINDS`` and refuses the others for now.
DocumentKind = Literal[
    "sprint_plan", "sprint_report", "release_plan", "release_summary", "test_report"
]

# ----- limits -----

#: The largest revision number: revisions are an integer column.
REVISION_MAX = 2_147_483_647

ACTIONS_MAX = 10
ACTION_MAX = 200
REASON_MAX = 400
SATISFIED_NOTE_MAX = 600

KEY_STORIES_MAX = 30
KNOWN_PROBLEMS_MAX = 40
PROBLEM_MAX = 400
FOLLOW_UPS_MAX = 20
FOLLOW_UP_MAX = 300

SCENARIOS_MAX = 60
SCENARIO_TITLE_MAX = 120
SCENARIO_STORIES_MAX = 5
STEPS_MAX = 2000
NOTE_MAX = 300
UNIT_TESTS_MAX = 20
LOCATION_MAX = 300
UNIT_TESTS_NOTE_MAX = 600


def _text(max_length: int, *, required: bool = False):
    """A trimmed string of at most ``max_length`` characters; ``required`` ones are not blank."""
    return Annotated[
        str,
        StringConstraints(
            strip_whitespace=True, min_length=1 if required else 0, max_length=max_length
        ),
    ]


def _each_once(ids: list[UUID], name: str) -> list[UUID]:
    if len(set(ids)) != len(ids):
        raise ValueError(f"{name} names a story more than once")
    return ids


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Item(_Strict):
    id: UUID


class _Body(_Strict):
    """A document body: refuses an item id used twice, in one list or across two."""

    def _items(self) -> list[_Item]:
        return [
            item
            for value in self.__dict__.values()
            if isinstance(value, list)
            for item in value
            if isinstance(item, _Item)
        ]

    @model_validator(mode="after")
    def _ids_are_unique(self):
        ids = [item.id for item in self._items()]
        if len(set(ids)) != len(ids):
            raise ValueError("Each item needs an id of its own")
        return self

    def story_ids(self) -> set[UUID]:
        """The board stories the body names (each must be one of the team's)."""
        return set()


# ----- sprint report -----


class SprintAction(_Item):
    """Something the team will stop, start or keep doing, and why."""

    action: _text(ACTION_MAX, required=True)
    reason: _text(REASON_MAX) = ""


class SprintReportBody(_Body):
    stop: list[SprintAction] = Field(default_factory=list, max_length=ACTIONS_MAX)
    start: list[SprintAction] = Field(default_factory=list, max_length=ACTIONS_MAX)
    keep: list[SprintAction] = Field(default_factory=list, max_length=ACTIONS_MAX)
    #: Why the team has nothing to stop doing (finalize takes it in place of a stop action).
    satisfied_note: _text(SATISFIED_NOTE_MAX) = ""


# ----- release summary -----


class KnownProblem(_Item):
    kind: Literal["bug", "omission", "shortcut"]
    text: _text(PROBLEM_MAX, required=True)


class FollowUp(_Item):
    """A bug fix or an idea that is not a story on the board."""

    text: _text(FOLLOW_UP_MAX, required=True)


class ReleaseSummaryBody(_Body):
    #: Board stories, in the team's chosen order.
    key_story_ids: list[UUID] = Field(default_factory=list, max_length=KEY_STORIES_MAX)
    known_problems: list[KnownProblem] = Field(default_factory=list, max_length=KNOWN_PROBLEMS_MAX)
    follow_ups: list[FollowUp] = Field(default_factory=list, max_length=FOLLOW_UPS_MAX)

    @field_validator("key_story_ids")
    @classmethod
    def _key_stories_once(cls, ids: list[UUID]) -> list[UUID]:
        return _each_once(ids, "key_story_ids")

    def story_ids(self) -> set[UUID]:
        return set(self.key_story_ids)


# ----- test plan and report -----


class Scenario(_Item):
    """A system test scenario: the stories it covers, its steps (Markdown) and its result."""

    title: _text(SCENARIO_TITLE_MAX, required=True)
    story_ids: list[UUID] = Field(default_factory=list, max_length=SCENARIO_STORIES_MAX)
    steps_md: _text(STEPS_MAX) = ""
    #: None until the scenario has been run.
    result: Literal["pass", "fail"] | None = None
    note: _text(NOTE_MAX) = ""

    @field_validator("story_ids")
    @classmethod
    def _stories_once(cls, ids: list[UUID]) -> list[UUID]:
        return _each_once(ids, "story_ids")


class UnitTest(_Item):
    """Where some unit tests live (a path or a URL), and whether any of them fail."""

    location: _text(LOCATION_MAX, required=True)
    note: _text(NOTE_MAX) = ""
    failing: bool = False


class TestReportBody(_Body):
    __test__ = False  # a model, not a pytest test class

    scenarios: list[Scenario] = Field(default_factory=list, max_length=SCENARIOS_MAX)
    unit_tests: list[UnitTest] = Field(default_factory=list, max_length=UNIT_TESTS_MAX)
    unit_tests_note: _text(UNIT_TESTS_NOTE_MAX) = ""

    def story_ids(self) -> set[UUID]:
        return {story for scenario in self.scenarios for story in scenario.story_ids}


# ----- responses -----


class DocumentStoryResponse(BaseModel):
    """A story of the team's board, as a document's pickers and links need it."""

    id: UUID
    key: str
    title: str
    acceptance_criteria: list[str]
    #: Its sprint, or None in the backlog.
    sprint_id: UUID | None
    sprint_name: str | None
    #: At least one task, and every task done.
    completed: bool


class DocumentStoriesResponse(BaseModel):
    """GET /projects/{project_id}/documents/stories: the board's live stories in board order."""

    stories: list[DocumentStoryResponse]


# ----- requests -----


class CreateDocumentRequest(BaseModel):
    kind: DocumentKind
    #: The sprint of a sprint's kind (a sprint report); none for a project's kinds.
    sprint_id: UUID | None = None


class SaveDocumentRequest(BaseModel):
    #: The whole body, in the shape of the document's kind (checked once the document is known).
    body: dict
    #: The revision the edit started from: when another one has been saved since, the answer says so.
    base_revision: int | None = Field(None, ge=1, le=REVISION_MAX)


class FinalizeDocumentRequest(BaseModel):
    #: The revision the caller is looking at; it must still be the head.
    revision: int = Field(..., ge=1, le=REVISION_MAX)
