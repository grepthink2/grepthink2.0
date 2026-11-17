"""What each kind of document accepts as its body: the limits, unknown fields, ids and trimming.

A body is what the team types. The save route validates it with its kind's model (``app.documents.models``),
so a refusal here is the route's 422.
"""

from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.documents import models

SPRINT = models.SprintReportBody
RELEASE = models.ReleaseSummaryBody
TESTS = models.TestReportBody


def _id() -> str:
    return str(uuid.uuid4())


def _action(**extra) -> dict:
    return {"id": _id(), "action": "Pair on reviews", "reason": "Fewer bugs reached main", **extra}


def _problem(**extra) -> dict:
    return {"id": _id(), "kind": "bug", "text": "Search ignores accents", **extra}


def _follow_up(**extra) -> dict:
    return {"id": _id(), "text": "Cache trail tiles", **extra}


def _scenario(**extra) -> dict:
    return {
        "id": _id(),
        "title": "Find a trail by name",
        "story_ids": [_id()],
        "steps_md": "1. Open the app",
        "result": None,
        "note": "",
        **extra,
    }


def _unit_test(**extra) -> dict:
    return {
        "id": _id(),
        "location": "backend/tests/test_trails.py",
        "note": "",
        "failing": False,
        **extra,
    }


@pytest.mark.parametrize(
    ("model", "empty"),
    [
        (SPRINT, {"stop": [], "start": [], "keep": [], "satisfied_note": ""}),
        (RELEASE, {"key_story_ids": [], "known_problems": [], "follow_ups": []}),
        (TESTS, {"scenarios": [], "unit_tests": [], "unit_tests_note": ""}),
    ],
)
def test_an_empty_body_is_every_list_empty_and_every_note_blank(model, empty):
    assert model.model_validate({}).model_dump(mode="json") == empty


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (SPRINT, {"stop": [_action() for _ in range(10)]}),
        (SPRINT, {"keep": [_action(action="a" * 200, reason="r" * 400)]}),
        (SPRINT, {"satisfied_note": "n" * 600}),
        (RELEASE, {"key_story_ids": [_id() for _ in range(30)]}),
        (RELEASE, {"known_problems": [_problem(text="t" * 400) for _ in range(40)]}),
        (RELEASE, {"follow_ups": [_follow_up(text="t" * 300) for _ in range(20)]}),
        (TESTS, {"scenarios": [_scenario() for _ in range(60)]}),
        (
            TESTS,
            {
                "scenarios": [
                    _scenario(
                        title="t" * 120,
                        story_ids=[_id() for _ in range(5)],
                        steps_md="s" * 2000,
                        result="fail",
                        note="n" * 300,
                    )
                ]
            },
        ),
        (TESTS, {"unit_tests": [_unit_test(location="l" * 300, note="n" * 300)] * 1}),
        (TESTS, {"unit_tests": [_unit_test() for _ in range(20)], "unit_tests_note": "n" * 600}),
    ],
)
def test_a_body_at_every_limit_is_accepted(model, body):
    model.model_validate(body)


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (SPRINT, {"stop": [_action() for _ in range(11)]}),
        (SPRINT, {"start": [_action() for _ in range(11)]}),
        (SPRINT, {"keep": [_action() for _ in range(11)]}),
        (SPRINT, {"start": [_action(action="")]}),
        (SPRINT, {"start": [_action(action="   ")]}),
        (SPRINT, {"start": [_action(action="a" * 201)]}),
        (SPRINT, {"start": [_action(reason="r" * 401)]}),
        (SPRINT, {"satisfied_note": "n" * 601}),
        (RELEASE, {"key_story_ids": [_id() for _ in range(31)]}),
        (RELEASE, {"known_problems": [_problem() for _ in range(41)]}),
        (RELEASE, {"known_problems": [_problem(kind="feature")]}),
        (RELEASE, {"known_problems": [_problem(text="")]}),
        (RELEASE, {"known_problems": [_problem(text="t" * 401)]}),
        (RELEASE, {"follow_ups": [_follow_up() for _ in range(21)]}),
        (RELEASE, {"follow_ups": [_follow_up(text=" ")]}),
        (RELEASE, {"follow_ups": [_follow_up(text="t" * 301)]}),
        (TESTS, {"scenarios": [_scenario() for _ in range(61)]}),
        (TESTS, {"scenarios": [_scenario(title="")]}),
        (TESTS, {"scenarios": [_scenario(title="t" * 121)]}),
        (TESTS, {"scenarios": [_scenario(story_ids=[_id() for _ in range(6)])]}),
        (TESTS, {"scenarios": [_scenario(steps_md="s" * 2001)]}),
        (TESTS, {"scenarios": [_scenario(result="skipped")]}),
        (TESTS, {"scenarios": [_scenario(note="n" * 301)]}),
        (TESTS, {"unit_tests": [_unit_test() for _ in range(21)]}),
        (TESTS, {"unit_tests": [_unit_test(location="")]}),
        (TESTS, {"unit_tests": [_unit_test(location="l" * 301)]}),
        (TESTS, {"unit_tests": [_unit_test(note="n" * 301)]}),
        (TESTS, {"unit_tests_note": "n" * 601}),
    ],
)
def test_a_body_past_a_limit_is_refused(model, body):
    with pytest.raises(ValidationError):
        model.model_validate(body)


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (SPRINT, {"stop": [], "mood": "great"}),
        (SPRINT, {"start": [_action(owner="Ana")]}),
        (RELEASE, {"key_story_ids": [], "summary": "Done"}),
        (RELEASE, {"known_problems": [_problem(severity="high")]}),
        (RELEASE, {"follow_ups": [_follow_up(points=3)]}),
        (TESTS, {"scenarios": [_scenario(owner="Ana")]}),
        (TESTS, {"unit_tests": [_unit_test(coverage=80)]}),
        (TESTS, {"coverage": 80}),
    ],
)
def test_a_field_a_body_does_not_name_is_refused(model, body):
    with pytest.raises(ValidationError):
        model.model_validate(body)


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (SPRINT, {"start": [_action(id="first")]}),
        (RELEASE, {"key_story_ids": ["US-1"]}),
        (TESTS, {"scenarios": [_scenario(story_ids=["US-1"])]}),
    ],
)
def test_ids_are_uuids(model, body):
    with pytest.raises(ValidationError):
        model.model_validate(body)


def _twice(make, key: str = "id") -> list[dict]:
    shared = _id()
    return [make(**{key: shared}), make(**{key: shared})]


@pytest.mark.parametrize(
    ("model", "body"),
    [
        (SPRINT, {"stop": _twice(_action)}),
        # The same id in two lists is one id used twice.
        (
            SPRINT,
            {
                "stop": [_action(id="9d0b3c1e-0000-4000-8000-000000000001")],
                "keep": [_action(id="9d0b3c1e-0000-4000-8000-000000000001")],
            },
        ),
        (RELEASE, {"known_problems": _twice(_problem)}),
        (
            RELEASE,
            {
                "known_problems": [_problem(id="9d0b3c1e-0000-4000-8000-000000000002")],
                "follow_ups": [_follow_up(id="9d0b3c1e-0000-4000-8000-000000000002")],
            },
        ),
        (RELEASE, {"key_story_ids": ["9d0b3c1e-0000-4000-8000-000000000003"] * 2}),
        (TESTS, {"scenarios": _twice(_scenario)}),
        (TESTS, {"unit_tests": _twice(_unit_test)}),
        (TESTS, {"scenarios": [_scenario(story_ids=["9d0b3c1e-0000-4000-8000-000000000004"] * 2)]}),
    ],
)
def test_an_id_used_twice_in_one_body_is_refused(model, body):
    with pytest.raises(ValidationError):
        model.model_validate(body)


def test_a_story_may_be_named_by_two_scenarios():
    """Story ids are references, not item ids: two scenarios can cover one story."""
    story = _id()
    TESTS.model_validate(
        {"scenarios": [_scenario(story_ids=[story]), _scenario(story_ids=[story])]}
    )


def test_every_string_is_trimmed():
    body = SPRINT.model_validate(
        {"start": [_action(action="  Pair up  ", reason=" because \n")], "satisfied_note": "  ok "}
    ).model_dump(mode="json")
    assert (body["start"][0]["action"], body["start"][0]["reason"]) == ("Pair up", "because")
    assert body["satisfied_note"] == "ok"
    scenario = TESTS.model_validate(
        {"scenarios": [_scenario(title=" Search ", steps_md="\n1. Go\n")]}
    )
    assert (scenario.scenarios[0].title, scenario.scenarios[0].steps_md) == ("Search", "1. Go")


def test_ids_are_stored_as_lowercase_text():
    upper = "9D0B3C1E-0000-4000-8000-00000000000A"
    body = RELEASE.model_validate({"key_story_ids": [upper]}).model_dump(mode="json")
    assert body["key_story_ids"] == [upper.lower()]


@pytest.mark.parametrize(
    ("model", "field"),
    [(models.SaveDocumentRequest, "base_revision"), (models.FinalizeDocumentRequest, "revision")],
)
def test_a_revision_number_fits_the_databases_integer(model, field):
    extra = {"body": {}} if field == "base_revision" else {}
    model.model_validate({field: 2147483647, **extra})
    with pytest.raises(ValidationError):
        model.model_validate({field: 2147483648, **extra})
