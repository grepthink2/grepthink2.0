"""Reading documents: one document at a revision (a member reads the head, staff read what was handed
in), its derived sections live or frozen, its revisions, its Markdown, a team's Documents tab and a
class's list. Each read's round trips are pinned."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.documents import controller
from tests.conftest import header_for
from tests.documents_support import (
    AFTER_SPRINT_2,
    CLASS,
    INSTR,
    MEETING_TA,
    OTHER_PID,
    PID,
    S1,
    S2,
    SM,
    ST1,
    ST3,
    TA,
    UID,
    add_document,
    board_tables,
    documents_db,
    pin_today,
)
from tests.scrum_support import pin_clock

SUMMARY = {"key_story_ids": [ST1], "known_problems": [], "follow_ups": []}
SNAPSHOT = {"key_stories": [{"id": ST1, "frozen": True}], "backlog": []}


@pytest.fixture
def db(monkeypatch):
    pin_today(monkeypatch, AFTER_SPRINT_2)
    return documents_db(monkeypatch, **board_tables())


def refused(call) -> tuple[int, str]:
    with pytest.raises(HTTPException) as e:
        call()
    return e.value.status_code, e.value.detail


def final_then_edited(db) -> str:
    """A release summary finalized at revision 2 (Sam, the Scrum Master), then saved again (3)."""
    doc = add_document(
        db, "release_summary", body=SUMMARY, saves=1, finalize=True, snapshot=SNAPSHOT, user=SM
    )
    db.rpcs["document_save"](
        {
            "p_document_id": doc,
            "p_body": {**SUMMARY, "key_story_ids": [ST1, ST3]},
            "p_user": UID,
            "p_source": "edit",
            "p_base": 2,
        }
    )
    db.reset_counter()
    return doc


# ------------------------------------------------------------------------- one document ----


@pytest.mark.parametrize(
    ("user", "number", "frozen"),
    [(UID, 3, False), (INSTR, 2, True), (TA, 2, True), (MEETING_TA, 2, True)],
    ids=["member: the head", "instructor: handed in", "class TA: handed in", "meeting TA"],
)
def test_a_member_reads_the_head_and_staff_read_what_was_handed_in(db, user, number, frozen):
    doc = final_then_edited(db)

    out = controller.get_document(doc, user)

    assert out["revision"]["number"] == number
    assert out["derived_frozen"] is frozen
    assert (out["access"], out["can_write"]) == (
        ("member", True) if user == UID else ("staff", False)
    )
    assert out["document"]["edited_since"] is True
    assert out["document"]["finalized_by_name"] == "Sam Master"


def test_staff_read_the_head_of_a_draft(db):
    doc = add_document(db, "release_summary", body=SUMMARY, saves=2)
    assert controller.get_document(doc, INSTR)["revision"]["number"] == 3


@pytest.mark.parametrize("number", [1, 2, 3])
def test_a_revision_can_be_asked_for(db, number):
    doc = final_then_edited(db)
    out = controller.get_document(doc, UID, number)
    assert out["revision"]["number"] == number
    assert out["derived_frozen"] is (number == 2)


@pytest.mark.parametrize("number", [4, 99])
def test_a_revision_that_does_not_exist_is_404(db, number):
    doc = final_then_edited(db)
    assert refused(lambda: controller.get_document(doc, UID, number)) == (
        404,
        controller.REVISION_NOT_FOUND,
    )


def test_the_handed_in_revision_keeps_its_snapshot_whatever_the_board_does(db):
    """Finalize froze the board's answer; the head still follows the board."""
    doc = final_then_edited(db)
    db.store["tasks"] = []  # nothing is done any more

    frozen = controller.get_document(doc, INSTR)
    live = controller.get_document(doc, UID)

    assert frozen["derived"] == SNAPSHOT
    assert [s["completed"] for s in live["derived"]["key_stories"]] == [False, False]


def test_a_member_may_finalize_only_with_a_team_role(db):
    doc = add_document(db, "release_summary", body=SUMMARY)
    assert controller.get_document(doc, SM)["can_finalize"] is True
    assert controller.get_document(doc, INSTR)["can_finalize"] is False


def test_reading_a_document_costs_three_rounds(db):
    """The document; the caller's access; then the revision, the caller's role and the board, side
    by side. A release summary reads the sprints, stories and tasks."""
    doc = add_document(db, "release_summary", body=SUMMARY)
    db.reset_counter()
    controller.get_document(doc, UID)
    assert db.executes <= 7


def test_reading_a_handed_in_revision_skips_the_board(db):
    """Its derived sections are the snapshot: of the board, only the sprints are read (to name a
    sprint's document). The finalizer's name comes with the document."""
    doc = final_then_edited(db)
    controller.get_document(doc, INSTR)  # staff: two reads for the access check
    assert db.executes <= 5


def test_reading_a_sprint_report_reads_its_burnup_too(db):
    doc = add_document(db, "sprint_report", sprint_id=S2)
    db.reset_counter()
    out = controller.get_document(doc, UID)
    assert out["derived"]["burnup"]["completed"][-1] == 5
    assert db.executes <= 8


# ------------------------------------------------------------------------- revisions ----


def test_the_revisions_newest_first_without_their_bodies(db):
    doc = final_then_edited(db)

    out = controller.list_revisions(doc, INSTR)

    assert [
        (r["number"], r["source"], r["saved_by_name"], r["finalized"]) for r in out["revisions"]
    ] == [
        (3, "edit", "Tony Wu", False),
        (2, "edit", "Sam Master", True),
        (1, "seed", "Sam Master", False),
    ]
    assert set(out["revisions"][0]) == {
        "number",
        "source",
        "saved_by",
        "saved_by_name",
        "saved_at",
        "finalized",
        "finalized_at",
    }
    assert db.executes <= 4  # the document, staff's two access reads, the revisions


# ------------------------------------------------------------------------- Markdown ----


def test_the_markdown_of_a_draft_is_its_head_dated_today(db, client):
    doc = add_document(
        db,
        "sprint_report",
        sprint_id=S2,
        body={"stop": [], "start": [], "keep": [], "satisfied_note": "Nothing to stop"},
    )

    response = client.get(
        f"/api/documents/{doc}/markdown", headers=header_for("t@ucsc.edu", sub=UID)
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "text/markdown; charset=utf-8"
    assert response.headers["content-disposition"] == (
        'attachment; filename="trailhead-sprint-2-report.md"'
    )
    text = response.text
    assert text.startswith("# Sprint 2 Report\n\n- **Product:** Trailhead\n")
    assert "- **Date:** October 1, 2026\n" in text
    assert "Nothing to stop" in text
    assert f"/app/projects/{PID}/board?view=burnup&sprint={S2})" in text


def test_the_markdown_of_a_final_document_is_what_was_handed_in(db, monkeypatch):
    """Finalized late on Nov 30 at the school (Dec 1 in UTC), then edited: the file is the finalized
    revision, with its frozen sections and the school's date."""
    pin_clock(monkeypatch, datetime(2026, 12, 1, 5, 0, tzinfo=UTC))
    snapshot = {
        "key_stories": [
            {
                "id": ST1,
                "key": "US-1",
                "title": "Frozen title",
                "acceptance_criteria": ["Kept"],
                "completed": True,
            }
        ],
        "backlog": [],
    }
    doc = add_document(db, "release_summary", body=SUMMARY, finalize=True, snapshot=snapshot)
    db.rpcs["document_save"](
        {
            "p_document_id": doc,
            "p_body": {
                **SUMMARY,
                "follow_ups": [
                    {"id": "6a000000-0000-4000-8000-000000000001", "text": "Not handed in"}
                ],
            },
            "p_user": UID,
            "p_source": "edit",
            "p_base": 1,
        }
    )
    pin_today(monkeypatch, AFTER_SPRINT_2)

    filename, text = controller.document_markdown(doc, INSTR)

    assert filename == "trailhead-release-summary.md"
    assert "- **Date:** November 30, 2026\n" in text
    assert "### US-1: Frozen title\n\n1. Kept\n" in text
    assert "Not handed in" not in text


def test_a_file_name_is_ascii(db):
    db.rows("projects")[0]["name"] = "İstinye Ekibi / 2"
    doc = add_document(db, "test_report")
    assert controller.document_markdown(doc, UID)[0] == "istinye-ekibi-2-test-plan-and-report.md"


# ------------------------------------------------------------------ the Documents tab ----


def test_the_documents_tab_lists_every_slot_made_or_not(db):
    report = add_document(db, "sprint_report", sprint_id=S2, saves=1, user=SM)
    summary = final_then_edited(db)

    out = controller.list_project_documents(PID, UID)

    assert [(s["kind"], s["title"], (s["sprint"] or {}).get("id")) for s in out["documents"]] == [
        ("sprint_report", "Sprint 1 report", S1),
        ("sprint_report", "Sprint 2 report", S2),
        ("release_summary", "Release summary", None),
        ("test_report", "Test plan and report", None),
    ]
    slots = {s["title"]: s for s in out["documents"]}
    assert slots["Sprint 1 report"]["document"] is None
    assert slots["Sprint 2 report"]["sprint"]["status"] == "completed"
    assert slots["Sprint 2 report"]["document"] == {
        "id": report,
        "status": "draft",
        "head_revision": 2,
        "finalized_revision": None,
        "edited_since": False,
        "updated_at": slots["Sprint 2 report"]["document"]["updated_at"],
        "saved_by_name": "Sam Master",
    }
    assert slots["Release summary"]["document"] | {"updated_at": None} == {
        "id": summary,
        "status": "final",
        "head_revision": 3,
        "finalized_revision": 2,
        "edited_since": True,
        "updated_at": None,
        "saved_by_name": "Tony Wu",
    }
    assert slots["Test plan and report"]["document"] is None
    # The access check; the sprints and the documents; the heads with their savers.
    assert db.executes <= 4


def test_staff_see_the_same_tab(db):
    add_document(db, "test_report")
    assert [
        s["document"] is not None for s in controller.list_project_documents(PID, TA)["documents"]
    ] == [False, False, False, True]


# ----------------------------------------------------------------- the class's list ----


def test_the_class_list_holds_every_teams_documents(db):
    add_document(db, "test_report", project_id=OTHER_PID, user="student-1")
    report = add_document(db, "sprint_report", sprint_id=S2)
    summary = final_then_edited(db)
    early = add_document(db, "sprint_report", sprint_id=S1)
    db.reset_counter()

    out = controller.list_class_documents(CLASS, INSTR)

    assert [(d["project_name"], d["title"]) for d in out["documents"]] == [
        ("Other team", "Test plan and report"),
        ("Trailhead", "Sprint 1 report"),
        ("Trailhead", "Sprint 2 report"),
        ("Trailhead", "Release summary"),
    ]
    rows = {d["id"]: d for d in out["documents"]}
    assert rows[report] | {"updated_at": None} == {
        "id": report,
        "kind": "sprint_report",
        "title": "Sprint 2 report",
        "project_id": PID,
        "project_name": "Trailhead",
        "sprint_name": "Sprint 2",
        "status": "draft",
        "head_revision": 1,
        "finalized_revision": None,
        "edited_since": False,
        "updated_at": None,
    }
    assert (rows[summary]["status"], rows[summary]["edited_since"]) == ("final", True)
    assert rows[early]["sprint_name"] == "Sprint 1"
    assert db.executes <= 2  # the class, then the teams with their documents


def test_a_class_ta_costs_one_more_read(db):
    add_document(db, "test_report")
    db.reset_counter()
    controller.list_class_documents(CLASS, TA)
    assert db.executes <= 3


# ------------------------------------------------------------------------- the routes ----


def test_the_read_routes_answer_through_http(db, client):
    doc = final_then_edited(db)
    member, staff = header_for("t@ucsc.edu", sub=UID), header_for("i@ucsc.edu", sub=INSTR)

    tab = client.get(f"/api/projects/{PID}/documents", headers=member)
    one = client.get(f"/api/documents/{doc}?revision=1", headers=staff)
    revisions = client.get(f"/api/documents/{doc}/revisions", headers=staff)
    classes = client.get(f"/api/classes/{CLASS}/documents", headers=staff)

    assert [r.status_code for r in (tab, one, revisions, classes)] == [200] * 4
    assert [s["kind"] for s in tab.json()["documents"]][-2:] == ["release_summary", "test_report"]
    assert (one.json()["revision"]["number"], one.json()["access"]) == (1, "staff")
    assert [r["number"] for r in revisions.json()["revisions"]] == [3, 2, 1]
    assert [d["id"] for d in classes.json()["documents"]] == [doc]


def test_a_revision_number_below_1_is_422(db, client):
    doc = add_document(db, "test_report")
    response = client.get(
        f"/api/documents/{doc}?revision=0", headers=header_for("t@ucsc.edu", sub=UID)
    )
    assert response.status_code == 422


def test_a_kind_the_api_does_not_serve_yet_is_left_out_and_answers_422(db):
    """A sprint plan the database holds (made by a later version, say): not on the tab, not in the
    class's list, and 422 when asked for."""
    doc = add_document(db, "test_report")
    db.rows("project_documents")[0]["kind"] = "sprint_plan"
    db.rows("project_documents")[0]["sprint_id"] = S1

    assert all(
        s["document"] is None for s in controller.list_project_documents(PID, UID)["documents"]
    )
    assert controller.list_class_documents(CLASS, INSTR)["documents"] == []
    assert refused(lambda: controller.get_document(doc, UID)) == (
        422,
        controller.KIND_NOT_AVAILABLE,
    )


def test_a_revision_whose_author_is_gone_names_nobody(db):
    doc = add_document(db, "test_report")
    db.rows("project_document_revisions")[0]["saved_by"] = None  # the profile was deleted
    out = controller.get_document(doc, UID)
    assert (out["revision"]["saved_by"], out["revision"]["saved_by_name"]) == (None, None)


def test_a_sprint_report_reads_the_stories_its_sprint_ended_with(db):
    """A saved day of Sprint 2 recorded its stories: the report reads them, through the same reads."""
    db.rows("sprint_burnup_days").append(
        {
            "sprint_id": S2,
            "day": "2026-09-27",
            "scope_points": 0,
            "completed_points": 0,
            "scope_hours": 5,
            "completed_hours": 5,
            "stories": [{"id": ST3, "done": True, "hours": 5, "points": 5}],
        }
    )
    doc = add_document(db, "sprint_report", sprint_id=S2)

    derived = controller.get_document(doc, UID)["derived"]

    assert derived["as_of"] == "2026-09-27"
    assert [s["key"] for s in derived["completed"]] == ["US-3"]
    assert derived["not_completed"] == []  # US-4 was not in the sprint that day
    assert derived["hours_completed"] == 5


def test_a_revision_number_past_the_databases_integer_is_422(db, client):
    doc = add_document(db, "test_report")
    response = client.get(
        f"/api/documents/{doc}?revision=2147483648", headers=header_for("t@ucsc.edu", sub=UID)
    )
    assert response.status_code == 422
