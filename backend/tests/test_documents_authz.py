"""Who may do what with a team's documents: the board's members and staff, and the roles that finalize.

Team members read and write; class staff (the instructor, a class TA, the team's meeting TA) read and
never write; anyone else gets the board's 403, and a document, project or class that does not exist is 404.
Finalizing and deleting take a team role: Scrum Master, Product Owner, owner or admin. A refused call
writes nothing. The class's list of documents is for its instructor and TAs.
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.core import authz
from app.documents import controller
from app.scrum.controller import MEMBERS_ONLY
from tests.documents_support import (
    ADMIN,
    AFTER_SPRINT_2,
    CLASS,
    EMPTY_BODIES,
    INSTR,
    MEETING_TA,
    MEMBER,
    NO_ROLE,
    OUTSIDER,
    PID,
    PO,
    S2,
    SM,
    STUDENT,
    TA,
    UID,
    add_document,
    board_tables,
    document,
    documents_db,
    pin_today,
    revisions,
    writes,
)

MISSING = "00000000-0000-4000-8000-00000000dead"
STAFF = [INSTR, TA, MEETING_TA]
STRANGERS = [STUDENT, OUTSIDER]
FINALIZERS = [SM, PO, UID, ADMIN]  # UID is the team's owner
PLAIN = [MEMBER, NO_ROLE]
REPORT = {
    "stop": [],
    "start": [{"id": "6a000000-0000-4000-8000-000000000001", "action": "Pair", "reason": ""}],
    "keep": [{"id": "6a000000-0000-4000-8000-000000000002", "action": "Demo", "reason": ""}],
    "satisfied_note": "Nothing to stop",
}


@pytest.fixture
def db(monkeypatch):
    pin_today(monkeypatch, AFTER_SPRINT_2)
    fake = documents_db(monkeypatch, **board_tables())
    fake.report = add_document(fake, "sprint_report", sprint_id=S2, body=REPORT)
    fake.reset_counter()
    return fake


def refused(call) -> tuple[int, str]:
    with pytest.raises(HTTPException) as e:
        call()
    return e.value.status_code, e.value.detail


# The routes that read: every one answers members and staff alike.
READS = {
    "list": lambda db, user: controller.list_project_documents(PID, user),
    "read": lambda db, user: controller.get_document(db.report, user),
    "revisions": lambda db, user: controller.list_revisions(db.report, user),
    "markdown": lambda db, user: controller.document_markdown(db.report, user),
}
# The routes that write, with the refusal a member without the role gets.
WRITE_ROUTES = {
    "create": lambda db, user: controller.create_document(PID, user, "release_summary", None),
    "save": lambda db, user: controller.save_document(db.report, user, REPORT, 1),
    "finalize": lambda db, user: controller.finalize_document(db.report, user, 1),
    "delete": lambda db, user: controller.delete_document(db.report, user),
}


MEMBERS = [UID, MEMBER, NO_ROLE]


@pytest.mark.parametrize("user", MEMBERS + STAFF)
def test_members_and_staff_read_and_only_members_may_write(db, user):
    member = user in MEMBERS
    out = controller.get_document(db.report, user)
    assert (out["access"], out["can_write"]) == (("member", True) if member else ("staff", False))
    assert (out["revision"]["number"], out["body"]) == (1, REPORT)
    assert out["can_finalize"] is (user == UID)  # of these, only the owner holds a finalizing role
    tab = controller.list_project_documents(PID, user)["documents"]
    assert [s["document"]["id"] for s in tab if s["document"]] == [db.report]
    assert [r["number"] for r in controller.list_revisions(db.report, user)["revisions"]] == [1]
    assert controller.document_markdown(db.report, user)[0] == "trailhead-sprint-2-report.md"


@pytest.mark.parametrize("route", sorted(READS) + sorted(WRITE_ROUTES))
@pytest.mark.parametrize("user", STRANGERS)
def test_anyone_else_gets_the_boards_403_and_nothing_is_written(db, route, user):
    call = {**READS, **WRITE_ROUTES}[route]
    assert refused(lambda: call(db, user)) == (403, authz.NOT_PROJECT_MEMBER)
    assert writes(db) == []


@pytest.mark.parametrize("route", sorted(WRITE_ROUTES))
@pytest.mark.parametrize("user", STAFF)
def test_staff_never_write(db, route, user):
    assert refused(lambda: WRITE_ROUTES[route](db, user)) == (403, MEMBERS_ONLY)
    assert writes(db) == []


@pytest.mark.parametrize("user", MEMBERS)
def test_every_member_creates_and_saves(db, user):
    assert controller.save_document(db.report, user, REPORT, None)["revision"] == 2
    [saved] = [r for r in revisions(db, db.report) if r["number"] == 2]
    assert (saved["saved_by"], saved["source"], saved["body"]) == (user, "edit", REPORT)

    created = controller.create_document(PID, user, "release_summary", None)
    assert (created["access"], created["can_write"]) == ("member", True)
    assert document(db, created["document"]["id"])["created_by"] == user
    assert revisions(db, created["document"]["id"])[0]["saved_by"] == user


@pytest.mark.parametrize(
    ("route", "detail"),
    [("finalize", controller.FINALIZE_DENIED), ("delete", controller.DELETE_DENIED)],
)
@pytest.mark.parametrize("user", PLAIN)
def test_a_member_without_a_team_role_neither_finalizes_nor_deletes(db, route, detail, user):
    assert refused(lambda: WRITE_ROUTES[route](db, user)) == (403, detail)
    assert writes(db) == []


@pytest.mark.parametrize("user", FINALIZERS)
def test_the_scrum_master_product_owner_owner_and_admin_finalize(db, user):
    out = controller.finalize_document(db.report, user, 1)
    assert (out["document"]["status"], out["can_finalize"], out["derived_frozen"]) == (
        "final",
        True,
        True,
    )
    [handed_in] = revisions(db, db.report)
    assert (handed_in["finalized_by"], handed_in["snapshot"]) == (user, out["derived"])


@pytest.mark.parametrize("user", FINALIZERS)
def test_the_same_roles_delete_a_draft(db, user):
    controller.delete_document(db.report, user)
    assert db.rows("project_documents") == []


@pytest.mark.parametrize(
    "call",
    [
        lambda: controller.get_document(MISSING, UID),
        lambda: controller.list_revisions(MISSING, UID),
        lambda: controller.document_markdown(MISSING, UID),
        lambda: controller.save_document(MISSING, UID, REPORT, None),
        lambda: controller.finalize_document(MISSING, UID, 1),
        lambda: controller.delete_document(MISSING, UID),
    ],
)
def test_a_document_that_does_not_exist_is_404(db, call):
    assert refused(call) == (404, controller.DOCUMENT_NOT_FOUND)


@pytest.mark.parametrize(
    "call",
    [
        lambda: controller.list_project_documents(MISSING, UID),
        lambda: controller.create_document(MISSING, UID, "release_summary", None),
    ],
)
def test_a_project_that_does_not_exist_is_404(db, call):
    assert refused(call) == (404, authz.PROJECT_NOT_FOUND)


# ----------------------------------------------------------------- the class's list ----


@pytest.mark.parametrize("user", [INSTR, TA])
def test_the_instructor_and_a_class_ta_read_the_class_list(db, user):
    assert [d["id"] for d in controller.list_class_documents(CLASS, user)["documents"]] == [
        db.report
    ]


@pytest.mark.parametrize("user", [STUDENT, OUTSIDER, UID])
def test_anyone_else_gets_403_for_the_class_list(db, user):
    assert refused(lambda: controller.list_class_documents(CLASS, user)) == (
        403,
        controller.CLASS_STAFF_ONLY,
    )


def test_a_class_that_does_not_exist_is_404(db):
    assert refused(lambda: controller.list_class_documents(MISSING, INSTR)) == (
        404,
        authz.CLASS_NOT_FOUND,
    )


def test_the_refusals_say_who_may():
    assert (controller.FINALIZE_DENIED, controller.DELETE_DENIED, controller.CLASS_STAFF_ONLY) == (
        "Only the Scrum Master or the Product Owner can finalize a document",
        "Only the Scrum Master or the Product Owner can delete a document",
        "Only the instructor or a class TA can read the class's documents",
    )


def test_an_empty_body_of_each_kind_is_what_a_new_document_needs():
    """The bodies the tests seed documents with are the kinds' own empty bodies."""
    from app.documents.kinds import KINDS

    for name, kind in KINDS.items():
        assert kind.body_model.model_validate({}).model_dump(mode="json") == EMPTY_BODIES[name]
