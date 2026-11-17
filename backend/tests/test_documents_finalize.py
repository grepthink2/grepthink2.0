"""Finalizing (POST /api/documents/{document_id}/finalize) and deleting a document.

Finalize hands in the revision the caller is looking at, which must still be the head: the kind's checks
run on it, its derived sections are frozen on it, the document turns final and the team's TAs hear of it,
in the app and by email. A finalized document can't be deleted.
"""

from __future__ import annotations

import copy
import logging
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException
from postgrest.exceptions import APIError

from app.core.db import get_client
from app.documents import controller, derive
from app.limiter import limiter
from tests.conftest import header_for
from tests.documents_support import (
    AFTER_SPRINT_2,
    CLASS,
    DURING_SPRINT_2,
    INSTR,
    MEETING_TA,
    PID,
    PO,
    REVIEW_TA,
    S2,
    SM,
    ST1,
    ST4,
    ST5,
    UID,
    add_document,
    board_tables,
    document,
    documents_db,
    pin_today,
    revisions,
    writes,
)
from tests.scrum_support import pin_clock

ITEM_1 = "6a000000-0000-4000-8000-000000000001"
ITEM_2 = "6a000000-0000-4000-8000-000000000002"
REPORT = {
    "stop": [],
    "start": [{"id": ITEM_1, "action": "Pair on reviews", "reason": ""}],
    "keep": [{"id": ITEM_2, "action": "Demo on Fridays", "reason": ""}],
    "satisfied_note": "Nothing slowed us down",
}


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


def test_finalize_freezes_the_derived_sections_on_the_head(db, client):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT, saves=1)

    response = client.post(
        f"/api/documents/{doc}/finalize",
        json={"revision": 2},
        headers=header_for("sam@ucsc.edu", sub=SM),
    )

    assert response.status_code == 200
    out = response.json()
    row = document(db, doc)
    assert (row["status"], row["finalized_revision"], row["finalized_by"]) == ("final", 2, SM)
    assert out["document"]["status"] == "final"
    assert out["document"]["finalized_by_name"] == "Sam Master"
    assert (out["revision"]["number"], out["derived_frozen"]) == (2, True)
    [first, second] = revisions(db, doc)
    assert first["snapshot"] is None
    assert second["snapshot"] == out["derived"]
    assert [s["key"] for s in second["snapshot"]["completed"]] == ["US-3"]


def test_the_snapshot_is_what_readers_get_after_the_board_changes(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    handed_in = controller.finalize_document(doc, SM, 1)["derived"]
    db.store["tasks"] = []  # US-3's task is gone: live, nothing is completed any more

    assert controller.get_document(doc, MEETING_TA)["derived"] == handed_in
    live = derive.load_context(get_client(), PID, S2, today=AFTER_SPRINT_2)
    assert derive.derive_sprint_report(live, REPORT)["completed"] == []


@pytest.mark.parametrize(
    ("kind", "body", "detail"),
    [
        ("sprint_report", {**REPORT, "start": []}, derive.NEED_START),
        ("sprint_report", {**REPORT, "keep": []}, derive.NEED_KEEP),
        ("sprint_report", {**REPORT, "satisfied_note": ""}, derive.NEED_STOP),
        ("release_summary", {"key_story_ids": []}, derive.NEED_KEY_STORY),
        ("release_summary", {"key_story_ids": [ST1, ST4]}, derive.NEED_CRITERIA),
        ("test_report", {"scenarios": []}, derive.NEED_SCENARIO),
        (
            "test_report",
            {"scenarios": [{"id": ITEM_1, "title": "Search", "story_ids": [ST5], "result": None}]},
            derive.NEED_RESULTS,
        ),
    ],
)
def test_a_failing_check_is_409_and_nothing_is_finalized(db, kind, body, detail):
    doc = add_document(db, kind, sprint_id=S2 if kind == "sprint_report" else None, body=body)
    db.reset_counter()

    assert refused(lambda: controller.finalize_document(doc, SM, 1)) == (409, detail)
    assert writes(db) == []
    assert document(db, doc)["status"] == "draft"


def test_a_sprint_report_waits_for_its_sprint_to_end(db, monkeypatch):
    pin_today(monkeypatch, DURING_SPRINT_2)
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    assert refused(lambda: controller.finalize_document(doc, SM, 1)) == (
        409,
        "The sprint has not ended yet",
    )


def test_a_revision_that_is_no_longer_the_head_is_409(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT, saves=1)
    db.reset_counter()
    assert refused(lambda: controller.finalize_document(doc, SM, 1)) == (
        409,
        controller.DOCUMENT_CHANGED,
    )
    assert writes(db) == []


def test_a_save_that_lands_while_finalizing_is_409(db):
    """Someone saved between the read and the finalize: the function refuses under its lock."""
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)

    def moved(params):
        raise APIError(
            {"code": "23505", "message": "document changed", "details": None, "hint": None}
        )

    db.rpcs["document_finalize"] = moved
    assert refused(lambda: controller.finalize_document(doc, SM, 1)) == (
        409,
        controller.DOCUMENT_CHANGED,
    )
    assert db.rows("notifications") == [] and db.rows("email_outbox") == []


def test_finalize_tells_the_meeting_ta_and_the_review_ta(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)

    controller.finalize_document(doc, SM, 1)

    notes = db.rows("notifications")
    assert sorted(n["user_id"] for n in notes) == sorted([MEETING_TA, REVIEW_TA])
    assert {
        (n["type"], n["title"], n["body"], n["entity_type"], n["entity_id"]) for n in notes
    } == {
        (
            "document_finalized",
            "Document finalized",
            "Trailhead finalized its Sprint 2 report",
            "document",
            doc,
        )
    }
    emails = db.rows("email_outbox")
    assert sorted((e["user_id"], e["to_email"], e["dedupe_key"]) for e in emails) == sorted(
        [
            (MEETING_TA, f"{MEETING_TA}@ucsc.edu", f"document_finalized:{doc}:1:{MEETING_TA}"),
            (REVIEW_TA, f"{REVIEW_TA}@ucsc.edu", f"document_finalized:{doc}:1:{REVIEW_TA}"),
        ]
    )
    assert {e["kind"] for e in emails} == {"document_finalized"}
    assert {e["status"] for e in emails} == {"pending"}
    assert {e["class_id"] for e in emails} == {CLASS}
    assert emails[0]["payload"] == {
        "project_name": "Trailhead",
        "document_title": "Sprint 2 report",
        "link": f"http://localhost:5173/app/projects/{PID}/documents/{doc}",
    }


def test_finalize_records_an_event_with_the_kind_only(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    controller.finalize_document(doc, PO, 1)
    [event] = [e for e in db.rows("events") if e["kind"] == "document_finalized"]
    assert (event["actor_id"], event["project_id"], event["meta"]) == (
        PO,
        PID,
        {"kind": "sprint_report"},
    )


def test_finalizing_the_finalized_revision_again_changes_and_tells_nothing(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    first = controller.finalize_document(doc, SM, 1)
    db.reset_counter()

    again = controller.finalize_document(doc, UID, 1)

    assert again["derived"] == first["derived"] and again["derived_frozen"] is True
    assert writes(db) == []
    assert len(db.rows("notifications")) == 2
    assert document(db, doc)["finalized_by"] == SM


def test_a_failed_notice_never_fails_the_finalize(db, monkeypatch, caplog):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)

    def broken(*args, **kwargs):
        raise APIError(
            {
                "code": "XX000",
                "message": "Failing row contains (Trailhead, ta@ucsc.edu)",
                "details": None,
                "hint": None,
            }
        )

    monkeypatch.setattr("app.outbox.controller.enqueue", broken)
    with caplog.at_level(logging.WARNING, logger="app.documents.notify"):
        out = controller.finalize_document(doc, SM, 1)

    assert out["document"]["status"] == "final"
    [record] = [r for r in caplog.records if r.name == "app.documents.notify"]
    assert record.levelno == logging.WARNING
    assert doc in record.getMessage() and "APIError" in record.getMessage()
    assert "Trailhead" not in record.getMessage() and "@" not in record.getMessage()
    assert record.exc_info is None


def test_finalizing_costs_at_most_sixteen_round_trips(db):
    """The document; access and role; the revision, project and board; the finalize; the notice (Review
    TAs, addresses, then the notifications and emails); the document again with the finalizer's name;
    the event."""
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    db.reset_counter()
    controller.finalize_document(doc, SM, 1)
    assert db.executes <= 16


def test_finalizing_is_limited_per_person(db, client):
    doc = add_document(db, "test_report", body={"scenarios": []})
    headers = header_for("sam@ucsc.edu", sub=SM)
    answers = [
        client.post(
            f"/api/documents/{doc}/finalize", json={"revision": 1}, headers=headers
        ).status_code
        for _ in range(11)
    ]
    assert answers == [409] * 10 + [429]


# --------------------------------------------------------------------------- delete ----


def test_a_draft_is_deleted(db, client):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    response = client.delete(f"/api/documents/{doc}", headers=header_for("p@ucsc.edu", sub=PO))
    assert response.status_code == 204
    assert db.rows("project_documents") == []


@pytest.mark.parametrize("edited_since", [False, True])
def test_a_finalized_document_is_409(db, edited_since):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT, finalize=True)
    if edited_since:
        controller.save_document(doc, UID, REPORT, 1)
    assert refused(lambda: controller.delete_document(doc, SM)) == (409, controller.DOCUMENT_FINAL)
    assert len(db.rows("project_documents")) == 1


def test_a_document_finalized_while_deleting_is_409(db, monkeypatch):
    """The read saw a draft; the delete, which only takes a draft, found a final one."""
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    real = controller._load_document

    def stale(client, document_id):
        row = real(client, document_id)
        document(db, doc).update(status="final", finalized_revision=1)
        return row

    monkeypatch.setattr(controller, "_load_document", stale)
    assert refused(lambda: controller.delete_document(doc, SM)) == (409, controller.DOCUMENT_FINAL)
    assert len(db.rows("project_documents")) == 1


def test_a_document_deleted_while_finalizing_is_404(db):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    real = db.rpcs["document_finalize"]

    def gone(params):
        db.store["project_documents"] = []
        return real(params)

    db.rpcs["document_finalize"] = gone
    assert refused(lambda: controller.finalize_document(doc, SM, 1)) == (
        404,
        controller.DOCUMENT_NOT_FOUND,
    )
    assert db.rows("notifications") == []


def test_a_document_deleted_while_deleting_is_404(db, monkeypatch):
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    real = controller._load_document

    def stale(client, document_id):
        row = real(client, document_id)
        db.store["project_documents"] = []
        return row

    monkeypatch.setattr(controller, "_load_document", stale)
    assert refused(lambda: controller.delete_document(doc, SM)) == (
        404,
        controller.DOCUMENT_NOT_FOUND,
    )


# ------------------------------------------------------------------- every hand-in ----


def test_every_hand_in_is_kept_and_read_back_as_it_was_handed_in(db, monkeypatch):
    """Revision 1 handed in, then an edit, then revision 2 handed in a day later on a changed board:
    revision 1 still answers its own snapshot, both are marked handed in, the document is the
    second's, and the TAs hear again, under the second revision's keys."""
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    first = controller.finalize_document(doc, SM, 1)
    controller.save_document(doc, UID, {**REPORT, "satisfied_note": "Still nothing"}, 1)
    db.store["tasks"] = []  # the board changes before the second hand-in
    pin_clock(monkeypatch, datetime(2026, 10, 2, 19, 0, tzinfo=UTC))
    second = controller.finalize_document(doc, PO, 2)

    assert second["derived"] != first["derived"]
    one = controller.get_document(doc, INSTR, 1)
    assert (one["derived_frozen"], one["derived"]) == (True, first["derived"])
    assert one["revision"]["finalized_at"] == revisions(db, doc)[0]["finalized_at"]
    listed = controller.list_revisions(doc, INSTR)["revisions"]
    assert [(r["number"], r["finalized"]) for r in listed] == [(2, True), (1, True)]
    assert listed[0]["finalized_at"] == "2026-10-02T19:00:00+00:00" != listed[1]["finalized_at"]
    row = document(db, doc)
    assert (row["finalized_revision"], row["finalized_by"], row["finalized_at"]) == (
        2,
        PO,
        "2026-10-02T19:00:00+00:00",
    )
    assert (second["document"]["finalized_by_name"], second["document"]["edited_since"]) == (
        "Pat Owner",
        False,
    )
    assert sorted(e["dedupe_key"] for e in db.rows("email_outbox")) == sorted(
        f"document_finalized:{doc}:{n}:{ta}" for n in (1, 2) for ta in (MEETING_TA, REVIEW_TA)
    )
    assert len(db.rows("notifications")) == 4


def test_two_finalizers_of_one_head_tell_the_tas_once(db, monkeypatch):
    """Both read the draft; the second finds it finalized under the lock (the function answers NULL)
    and answers what the first handed in, telling nobody and recording nothing."""
    doc = add_document(db, "sprint_report", sprint_id=S2, body=REPORT)
    draft = copy.deepcopy(document(db, doc))
    real = controller._load_document
    reads: list[str] = []

    def load(client, document_id):
        reads.append(str(document_id))
        if len(reads) == 3:  # the second request's first read: the draft, before the first commits
            return copy.deepcopy(draft)
        return real(client, document_id)

    monkeypatch.setattr(controller, "_load_document", load)
    first = controller.finalize_document(doc, SM, 1)
    second = controller.finalize_document(doc, PO, 1)

    assert len(db.rows("notifications")) == 2 and len(db.rows("email_outbox")) == 2
    assert [e["kind"] for e in db.rows("events")].count("document_finalized") == 1
    assert (second["derived"], second["derived_frozen"]) == (first["derived"], True)
    assert second["document"]["finalized_by"] == SM
    assert revisions(db, doc)[0]["finalized_by"] == SM
