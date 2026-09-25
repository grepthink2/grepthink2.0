"""Class endpoints are gated by the class, not by the account role.

Each endpoint below used to sit behind ``require_instructor``, which refused an account whose
``profiles.role`` is ``student`` even when it owned the class. Now the route only authenticates
and the controller's owner check decides (pinned per endpoint, with an enrolled student, in
``test_authz_status_policy.py``). Here the controller is replaced, so a 200 proves the route no
longer looks at the account role, and the recorded arguments prove the caller's id reaches the
owner check.

The roster-upload reminder follows the same rule: it goes to whoever created the class.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.notifications.controller import ensure_roster_upload_notifications
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

OWNER = "0e3c2f9e-0000-4000-8000-000000000001"
MEMBER = "0e3c2f9e-0000-4000-8000-000000000002"
CLASS = "0e3c2f9e-0000-4000-8000-0000000000c1"
PROJECT = "0e3c2f9e-0000-4000-8000-0000000000b1"
CLASSES = "app.classes.views.controller"
TAS = "app.tas.views.controller"

ROUTES = [
    pytest.param(
        "patch",
        f"/api/classes/{CLASS}/status",
        {"json": {"status": "complete"}},
        f"{CLASSES}.update_class_status",
        {},
        id="class-status",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/invite",
        {"json": {"student_email": "ann@ucsc.edu"}},
        f"{CLASSES}.invite_student_to_class",
        {"message": "ok"},
        id="invite",
    ),
    pytest.param(
        "get",
        f"/api/classes/{CLASS}/roster/timeline",
        {},
        f"{CLASSES}.get_class_roster_timeline",
        {"students": []},
        id="roster-timeline",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/roster",
        {"files": {"file": ("roster.csv", b"Name,Email\n", "text/csv")}},
        f"{CLASSES}.upload_class_roster",
        {"ok": True},
        id="roster-upload",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/roster/manual",
        {"json": {"first_name": "Ann", "last_name": "Lee", "email": "ann@ucsc.edu"}},
        f"{CLASSES}.add_manual_roster_student",
        {"ok": True},
        id="roster-manual-add",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/roster/manual/entry-1",
        {},
        f"{CLASSES}.delete_manual_roster_entry",
        {"ok": True},
        id="roster-manual-delete",
    ),
    pytest.param(
        "get",
        f"/api/classes/{CLASS}/turn-in-stats",
        {},
        f"{CLASSES}.get_class_turn_in_stats",
        None,
        id="turn-in-stats",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/students/{MEMBER}",
        {},
        f"{CLASSES}.remove_student_from_class",
        {"ok": True},
        id="remove-student",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/students/bulk-invite",
        {"json": {"emails": ["ann@ucsc.edu"]}},
        f"{CLASSES}.bulk_invite_students",
        {"results": []},
        id="bulk-invite",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/invites/queue",
        {"json": {"emails": ["ann@ucsc.edu"]}},
        f"{CLASSES}.queue_invite",
        {"job_id": "job-1", "send_at": "2026-09-25T00:00:00+00:00"},
        id="queue-invite",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/invites/job-1",
        {},
        f"{CLASSES}.cancel_invite",
        {"cancelled": True},
        id="cancel-invite",
    ),
    pytest.param(
        "get", f"/api/tas/classes/{CLASS}", {}, f"{TAS}.list_class_tas", [], id="list-tas"
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/promote",
        {"json": {"user_id": MEMBER}},
        f"{TAS}.promote_to_ta",
        {"ok": True},
        id="promote-ta",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/demote",
        {"json": {"user_id": MEMBER}},
        f"{TAS}.demote_ta",
        {"ok": True},
        id="demote-ta",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/review-window",
        {"json": {"open": True}},
        f"{TAS}.set_review_window",
        {"ok": True},
        id="review-window",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/review-zoom",
        {"json": {"zoom_url": "https://zoom.us/j/1"}},
        f"{TAS}.set_review_zoom",
        {"ok": True},
        id="review-zoom",
    ),
    pytest.param(
        "post",
        f"/api/tas/projects/{PROJECT}/review-time",
        {"json": {"scheduled_at": "2026-12-01T20:00:00Z"}},
        f"{TAS}.set_final_review_time",
        {"ok": True},
        id="review-time",
    ),
]


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


@pytest.mark.parametrize(("method", "path", "kwargs", "target", "returns"), ROUTES)
def test_a_class_owner_whose_account_is_a_student_reaches_the_owner_check(
    client: TestClient, monkeypatch, method, path, kwargs, target, returns
):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    calls: list[tuple[str, ...]] = []

    def controller(*args, **_kwargs):
        calls.append(tuple(str(a) for a in args))
        return returns

    monkeypatch.setattr(target, controller)
    res = getattr(client, method)(path, headers=_as(OWNER), **kwargs)

    assert res.status_code == 200, res.text
    assert len(calls) == 1 and OWNER in calls[0]


def test_creating_a_class_still_needs_the_instructor_role(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    res = client.post(
        "/api/classes",
        headers=_as(OWNER),
        json={"name": "CSE 115A", "term": "Fall", "start_date": "2026-09-24"},
    )
    assert (res.status_code, res.json()["detail"]) == (403, "Instructor role required")


# ------------------------------------------------------------ the roster reminder


@pytest.fixture
def roster_db(monkeypatch):
    """OWNER's account is a student but owns CLASS, which has no roster yet; MEMBER's account
    is an instructor that owns no class (a TA somewhere, say)."""
    fake = FakeSupabase(
        profiles=[
            {"id": OWNER, "email": "owner@ucsc.edu", "role": "student"},
            {"id": MEMBER, "email": "member@ucsc.edu", "role": "instructor"},
        ],
        classes=[{"id": CLASS, "name": "CSE 115A", "created_by": OWNER}],
        roster_entries=[],
        notifications=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def test_the_roster_reminder_goes_to_the_class_instructor_whatever_the_account_role(roster_db):
    ensure_roster_upload_notifications(OWNER)
    ensure_roster_upload_notifications(MEMBER)

    reminders = [(n["user_id"], n["type"], n["entity_id"]) for n in roster_db.rows("notifications")]
    assert reminders == [(OWNER, "upload_roster", CLASS)]
    # Decided by classes.created_by alone: the account role is never read.
    assert "profiles" not in {q["table"] for q in roster_db.queries}


def test_an_account_that_owns_no_class_costs_the_roster_reminder_one_read(roster_db):
    ensure_roster_upload_notifications(MEMBER)
    assert [(q["table"], q["op"]) for q in roster_db.queries] == [("classes", "select")]
