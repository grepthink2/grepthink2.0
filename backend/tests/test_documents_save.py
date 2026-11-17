"""Saving a document (PUT /api/documents/{document_id}): every save is a revision and the last writer
wins; the answer says when the save replaced a revision the saver never saw. The body is checked
against its kind, and every story it names must be on the team's board. A final document stays final."""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.documents import controller
from app.limiter import limiter
from tests.conftest import header_for
from tests.documents_support import (
    AFTER_SPRINT_2,
    OTHER_STORY,
    PID,
    S2,
    SM,
    ST1,
    ST3,
    UID,
    add_document,
    board_tables,
    document,
    documents_db,
    pin_today,
    revisions,
    writes,
)

HEADERS = header_for("tony@ucsc.edu", sub=UID)
ITEM = "6a000000-0000-4000-8000-000000000001"


@pytest.fixture(autouse=True)
def _fresh_limits():
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def db(monkeypatch):
    pin_today(monkeypatch, AFTER_SPRINT_2)
    return documents_db(monkeypatch, **board_tables())


def refused(call) -> tuple[int, object]:
    with pytest.raises(HTTPException) as e:
        call()
    return e.value.status_code, e.value.detail


def report(**changes) -> dict:
    return {
        "stop": [],
        "start": [{"id": ITEM, "action": "Pair on reviews", "reason": ""}],
        "keep": [],
        "satisfied_note": "",
        **changes,
    }


def test_a_save_is_the_next_revision(db, client):
    doc = add_document(db, "sprint_report", sprint_id=S2)
    db.reset_counter()

    response = client.put(
        f"/api/documents/{doc}", json={"body": report(), "base_revision": 1}, headers=HEADERS
    )

    assert response.status_code == 200
    assert response.json() == {"revision": 2, "overwrote": None}
    assert [(r["number"], r["source"], r["saved_by"]) for r in revisions(db, doc)] == [
        (1, "seed", UID),
        (2, "edit", UID),
    ]
    assert revisions(db, doc)[1]["body"] == report()
    assert document(db, doc)["head_revision"] == 2
    # The document, the caller's access, the save. No story to check in a sprint report.
    assert db.executes <= 3


def test_a_save_that_names_stories_checks_them_in_one_read(db):
    doc = add_document(db, "release_summary")
    db.reset_counter()

    out = controller.save_document(doc, UID, {"key_story_ids": [ST3, ST1]}, 1)

    assert out == {"revision": 2, "overwrote": None}
    assert db.executes <= 4


def test_a_save_from_an_older_revision_says_whose_revision_it_replaced(db):
    doc = add_document(db, "sprint_report", sprint_id=S2)
    controller.save_document(doc, SM, report(), 1)  # Sam saves revision 2

    out = controller.save_document(doc, UID, report(keep=[]), 1)  # Tony still edits revision 1

    assert out == {"revision": 3, "overwrote": {"number": 2, "by": SM, "by_name": "Sam Master"}}
    assert revisions(db, doc)[-1]["saved_by"] == UID  # the last writer wins


def test_without_a_base_revision_a_save_reports_nothing_replaced(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, saves=2)
    assert controller.save_document(doc, UID, report(), None)["overwrote"] is None


def test_the_stored_body_is_the_checked_one(db):
    doc = add_document(db, "sprint_report", sprint_id=S2)
    controller.save_document(
        doc, UID, report(start=[{"id": ITEM.upper(), "action": "  Pair  "}]), 1
    )
    assert revisions(db, doc)[-1]["body"]["start"] == [{"id": ITEM, "action": "Pair", "reason": ""}]


@pytest.mark.parametrize(
    ("kind", "body"),
    [
        ("sprint_report", report(start=[{"id": ITEM, "action": "a" * 201}])),
        ("sprint_report", report(mood="great")),
        ("sprint_report", {"key_story_ids": []}),  # another kind's body
        ("release_summary", {"key_story_ids": [ST1] * 2}),
        ("release_summary", {"known_problems": [{"id": ITEM, "kind": "feature", "text": "x"}]}),
        ("test_report", {"scenarios": [{"id": ITEM, "title": "t" * 121}]}),
        ("test_report", {"unit_tests": [{"id": ITEM, "location": ""}]}),
    ],
)
def test_a_body_its_kind_refuses_is_422_and_nothing_is_saved(db, client, kind, body):
    doc = add_document(db, kind, sprint_id=S2 if kind == "sprint_report" else None)
    db.reset_counter()

    response = client.put(f"/api/documents/{doc}", json={"body": body}, headers=HEADERS)

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert isinstance(detail, list) and detail[0]["loc"][:2] == ["body", "body"]
    assert "input" not in detail[0]  # the refusal does not echo what was typed
    assert writes(db) == []
    assert len(revisions(db, doc)) == 1


@pytest.mark.parametrize(
    ("kind", "body"),
    [
        ("release_summary", {"key_story_ids": [ST1, OTHER_STORY]}),
        ("release_summary", {"key_story_ids": ["5c000000-0000-4000-8000-00000000dead"]}),
        (
            "test_report",
            {"scenarios": [{"id": ITEM, "title": "Search", "story_ids": [OTHER_STORY]}]},
        ),
    ],
    ids=["another team's story", "no such story", "a scenario's story"],
)
def test_a_story_that_is_not_on_the_board_is_422(db, kind, body):
    doc = add_document(db, kind)
    db.reset_counter()
    assert refused(lambda: controller.save_document(doc, UID, body, 1)) == (
        422,
        controller.STORY_NOT_IN_PROJECT,
    )
    assert writes(db) == []


def test_a_final_document_stays_final_and_says_it_was_edited_since(db):
    doc = add_document(db, "release_summary", body={"key_story_ids": [ST1]}, finalize=True)

    controller.save_document(doc, UID, {"key_story_ids": [ST1, ST3]}, 1)

    row = document(db, doc)
    assert (row["status"], row["finalized_revision"], row["head_revision"]) == ("final", 1, 2)
    read = controller.get_document(doc, UID)
    assert (read["document"]["status"], read["document"]["edited_since"]) == ("final", True)
    [slot] = [
        s
        for s in controller.list_project_documents(PID, UID)["documents"]
        if s["kind"] == "release_summary"
    ]
    assert slot["document"]["edited_since"] is True


def test_a_document_deleted_while_saving_is_404(db, monkeypatch):
    """The document went between the read and the save: the function finds none (P0002)."""
    doc = add_document(db, "sprint_report", sprint_id=S2)
    real = db.rpcs["document_save"]

    def gone(params):
        db.store["project_documents"] = []
        return real(params)

    db.rpcs["document_save"] = gone
    assert refused(lambda: controller.save_document(doc, UID, report(), 1)) == (
        404,
        controller.DOCUMENT_NOT_FOUND,
    )


def test_saves_are_limited_per_person(db, client):
    doc = add_document(db, "sprint_report", sprint_id=S2)
    url, body = f"/api/documents/{doc}", {"body": report()}
    answers = [client.put(url, json=body, headers=HEADERS).status_code for _ in range(31)]
    assert answers.count(200) == 30 and answers[-1] == 429
    # Another member keeps their own allowance.
    other = header_for("sam@ucsc.edu", sub=SM)
    assert client.put(url, json=body, headers=other).status_code == 200
