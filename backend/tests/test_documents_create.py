"""Creating a document (POST /api/projects/{project_id}/documents): each kind's first revision, built from
the board; one document per sprint and kind, or per project and kind; the sprint rules; the kinds the API
does not serve yet."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.documents import controller
from app.limiter import limiter
from app.scrum.controller import SPRINT_NOT_FOUND
from tests.conftest import header_for
from tests.documents_support import (
    AFTER_SPRINT_2,
    CLASS,
    OTHER_SPRINT,
    PID,
    S1,
    S2,
    ST1,
    ST3,
    UID,
    add_document,
    board_tables,
    document,
    documents_db,
    pin_today,
    revisions,
    story,
    task,
    writes,
)

URL = f"/api/projects/{PID}/documents"
HEADERS = header_for("tony@ucsc.edu", sub=UID)


@pytest.fixture(autouse=True)
def _fresh_limits():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def db(monkeypatch):
    pin_today(monkeypatch, AFTER_SPRINT_2)
    return documents_db(monkeypatch, **board_tables())


def refused(call) -> tuple[int, str]:
    with pytest.raises(HTTPException) as e:
        call()
    return e.value.status_code, e.value.detail


def test_a_sprint_report_answers_201_with_the_document_as_a_read_shows_it(db, client):
    response = client.post(URL, json={"kind": "sprint_report", "sprint_id": S2}, headers=HEADERS)

    assert response.status_code == 201
    out = response.json()
    [row] = db.rows("project_documents")
    assert out["document"] == {
        "id": row["id"],
        "project_id": PID,
        "kind": "sprint_report",
        "title": "Sprint 2 report",
        "sprint": {
            "id": S2,
            "name": "Sprint 2",
            "starts_at": "2026-09-14",
            "ends_at": "2026-09-27",
            "status": "completed",
        },
        "status": "draft",
        "head_revision": 1,
        "finalized_revision": None,
        "finalized_at": None,
        "finalized_by": None,
        "finalized_by_name": None,
        "edited_since": False,
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }
    assert out["revision"] == {
        "number": 1,
        "saved_by": UID,
        "saved_by_name": "Tony Wu",
        "saved_at": revisions(db, row["id"])[0]["saved_at"],
        "source": "seed",
        "finalized_at": None,
    }
    assert out["body"] == {"stop": [], "start": [], "keep": [], "satisfied_note": ""}
    assert [s["key"] for s in out["derived"]["completed"]] == ["US-3"]
    assert [s["key"] for s in out["derived"]["not_completed"]] == ["US-4"]
    assert (out["derived_frozen"], out["access"], out["can_write"], out["can_finalize"]) == (
        False,
        "member",
        True,
        True,
    )
    [event] = db.rows("events")
    assert {k: event[k] for k in ("kind", "actor_id", "class_id", "project_id", "meta")} == {
        "kind": "document_created",
        "actor_id": UID,
        "class_id": CLASS,
        "project_id": PID,
        "meta": {"kind": "sprint_report"},
    }


def test_a_release_summary_starts_with_the_completed_stories(db):
    """US-1 and US-3 have tasks, all done; US-2 has one left, US-4 and US-5 none."""
    out = controller.create_document(PID, UID, "release_summary", None)

    assert out["body"] == {"key_story_ids": [ST1, ST3], "known_problems": [], "follow_ups": []}
    assert [s["key"] for s in out["derived"]["key_stories"]] == ["US-1", "US-3"]
    assert out["document"]["title"] == "Release summary"
    assert out["document"]["sprint"] is None


def test_a_test_report_starts_with_a_scenario_per_completed_story_with_criteria(db):
    out = controller.create_document(PID, UID, "test_report", None)

    scenarios = out["body"]["scenarios"]
    assert [(s["title"], s["story_ids"], s["steps_md"], s["result"]) for s in scenarios] == [
        ("Story US-1", [ST1], "1. Finds a trail by name", None),
        ("Story US-3", [ST3], "1. Saves a trail\n2. Lists saved trails", None),
    ]
    assert out["derived"]["repositories"] == ["https://github.com/team/trailhead"]
    assert [s["key"] for s in out["derived"]["uncovered"]] == ["US-5"]
    # What was stored is what was answered.
    assert revisions(db, out["document"]["id"])[0]["body"] == out["body"]


def test_a_blank_story_title_names_its_scenario_by_key(db):
    db.rows("user_stories")[0]["title"] = "   "
    out = controller.create_document(PID, UID, "test_report", None)
    assert out["body"]["scenarios"][0]["title"] == "US-1"


@pytest.mark.parametrize(
    ("kind", "sprint_id"),
    [("sprint_report", S2), ("release_summary", None), ("test_report", None)],
)
def test_a_second_one_is_409(db, kind, sprint_id):
    add_document(db, kind, sprint_id=sprint_id)
    assert refused(lambda: controller.create_document(PID, UID, kind, sprint_id)) == (
        409,
        controller.DOCUMENT_EXISTS,
    )
    assert len(db.rows("project_documents")) == 1


def test_each_sprint_has_its_own_report(db):
    controller.create_document(PID, UID, "sprint_report", S1)
    controller.create_document(PID, UID, "sprint_report", S2)
    assert sorted(d["sprint_id"] for d in db.rows("project_documents")) == [S1, S2]


@pytest.mark.parametrize(
    "sprint_id",
    [None, OTHER_SPRINT, "5b000000-0000-4000-8000-00000000dead"],
    ids=["no sprint", "another team's sprint", "no such sprint"],
)
def test_a_sprint_report_needs_a_sprint_of_this_project(db, sprint_id):
    db.reset_counter()
    assert refused(lambda: controller.create_document(PID, UID, "sprint_report", sprint_id)) == (
        404,
        SPRINT_NOT_FOUND,
    )
    assert writes(db) == []


@pytest.mark.parametrize("kind", ["release_summary", "test_report"])
def test_a_projects_document_takes_no_sprint(db, kind):
    db.reset_counter()
    assert refused(lambda: controller.create_document(PID, UID, kind, S2)) == (
        422,
        controller.NO_SPRINT_FOR_KIND,
    )
    assert writes(db) == []


@pytest.mark.parametrize("kind", ["sprint_plan", "release_plan"])
def test_the_kinds_not_served_yet_are_422(db, kind, client):
    response = client.post(URL, json={"kind": kind, "sprint_id": S2}, headers=HEADERS)
    assert (response.status_code, response.json()["detail"]) == (
        422,
        "That document is not available yet",
    )
    assert db.rows("project_documents") == []


def test_a_kind_the_database_does_not_know_is_422(db, client):
    response = client.post(URL, json={"kind": "memo"}, headers=HEADERS)
    assert response.status_code == 422
    assert db.rows("project_documents") == []


def test_the_new_document_is_a_draft_at_revision_1(db):
    out = controller.create_document(PID, UID, "release_summary", None)
    row = document(db, out["document"]["id"])
    assert (row["status"], row["head_revision"], row["created_by"]) == ("draft", 1, UID)
    assert [(r["number"], r["source"], r["saved_by"]) for r in revisions(db, row["id"])] == [
        (1, "seed", UID)
    ]


def test_a_first_revision_too_long_to_store_is_422(db):
    """60 completed stories whose criteria fill a scenario's steps with three-byte characters: the
    seed is past the 200,000 bytes a revision can hold."""
    many = [
        story(
            f"7c000000-0000-4000-8000-{n:012d}",
            f"US-{n}",
            S1,
            criteria=tuple("漢" * 290 for _ in range(6)),
        )
        for n in range(60)
    ]
    tasks = [task(f"7d000000-0000-4000-8000-{n:012d}", s["id"], "done") for n, s in enumerate(many)]
    db.store["user_stories"], db.store["tasks"] = many, tasks
    db.reset_counter()

    assert refused(lambda: controller.create_document(PID, UID, "test_report", None)) == (
        422,
        controller.DOCUMENT_TOO_LONG,
    )
    assert writes(db) == []


def test_a_sprint_that_left_the_project_while_creating_is_404(db):
    """The function holds the sprint and checks it is the project's (P0002 otherwise): a sprint gone
    between the read and the insert answers as a missing one."""
    real = db.rpcs["document_create"]

    def moved(params):
        db.store["sprints"] = [s for s in db.rows("sprints") if s["id"] != S2]
        return real(params)

    db.rpcs["document_create"] = moved
    assert refused(lambda: controller.create_document(PID, UID, "sprint_report", S2)) == (
        404,
        SPRINT_NOT_FOUND,
    )
    assert db.rows("project_documents") == []


def test_creating_reads_the_project_once(db):
    """The access check brings the project's class (for the event) with the caller's membership: no
    second project read. The access check; the board and the role; the create; the new document
    and its revision; the event."""
    db.reset_counter()
    controller.create_document(PID, UID, "sprint_report", S2)
    assert [q["table"] for q in db.queries].count("projects") == 0
    assert db.executes <= 9
