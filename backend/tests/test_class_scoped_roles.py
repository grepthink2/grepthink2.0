"""Class endpoints are gated by the class, not by the account role.

Each endpoint below used to sit behind ``require_instructor``, which refused an account whose
``profiles.role`` is ``student`` even when it owned the class. Now the route only authenticates
and the controller's owner check decides (pinned per endpoint, with an enrolled student, in
``test_authz_status_policy.py``). Here the controller is replaced, so a 200 proves the route no
longer looks at the account role, and the recorded arguments, bound to the real controller's
parameters by name, prove the caller's id reaches the owner check and the path's id its scope.

Only creating a class still depends on the account role, and a walk over every route pins that.
The roster-upload reminder follows the same rule as the endpoints: it goes to whoever created
the class.
"""

from __future__ import annotations

import inspect
import pydoc

import pytest
from fastapi.routing import APIRoute, iter_route_contexts
from fastapi.testclient import TestClient

from app.dependencies import require_instructor
from app.main import app as fastapi_app
from app.notifications.controller import ensure_roster_upload_notifications
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

OWNER = "0e3c2f9e-0000-4000-8000-000000000001"
MEMBER = "0e3c2f9e-0000-4000-8000-000000000002"
CLASS = "0e3c2f9e-0000-4000-8000-0000000000c1"
PROJECT = "0e3c2f9e-0000-4000-8000-0000000000b1"
JOB = "0e3c2f9e-0000-4000-8000-0000000000f1"  # a pending_invites id
CLASSES = "app.classes.views.controller"
TAS = "app.tas.views.controller"

ROUTES = [
    pytest.param(
        "patch",
        f"/api/classes/{CLASS}/status",
        {"json": {"status": "complete"}},
        f"{CLASSES}.update_class_status",
        {},
        ("instructor_id", "class_id"),
        id="class-status",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/invite",
        {"json": {"student_email": "ann@ucsc.edu"}},
        f"{CLASSES}.invite_student_to_class",
        {"message": "ok"},
        ("instructor_id", "class_id"),
        id="invite",
    ),
    pytest.param(
        "get",
        f"/api/classes/{CLASS}/roster/timeline",
        {},
        f"{CLASSES}.get_class_roster_timeline",
        {"students": []},
        ("instructor_id", "class_id"),
        id="roster-timeline",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/roster",
        {"files": {"file": ("roster.csv", b"Name,Email\n", "text/csv")}},
        f"{CLASSES}.upload_class_roster",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="roster-upload",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/roster/manual",
        {"json": {"first_name": "Ann", "last_name": "Lee", "email": "ann@ucsc.edu"}},
        f"{CLASSES}.add_manual_roster_student",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="roster-manual-add",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/roster/manual/entry-1",
        {},
        f"{CLASSES}.delete_manual_roster_entry",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="roster-manual-delete",
    ),
    pytest.param(
        "get",
        f"/api/classes/{CLASS}/turn-in-stats",
        {},
        f"{CLASSES}.get_class_turn_in_stats",
        None,
        ("user_id", "class_id"),
        id="turn-in-stats",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/students/{MEMBER}",
        {},
        f"{CLASSES}.remove_student_from_class",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="remove-student",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/students/bulk-invite",
        {"json": {"emails": ["ann@ucsc.edu"]}},
        f"{CLASSES}.bulk_invite_students",
        {"results": []},
        ("instructor_id", "class_id"),
        id="bulk-invite",
    ),
    pytest.param(
        "post",
        f"/api/classes/{CLASS}/invites/queue",
        {"json": {"emails": ["ann@ucsc.edu"]}},
        f"{CLASSES}.queue_invite",
        {"job_id": "job-1", "send_at": "2026-09-25T00:00:00+00:00"},
        ("instructor_id", "class_id"),
        id="queue-invite",
    ),
    pytest.param(
        "delete",
        f"/api/classes/{CLASS}/invites/{JOB}",
        {},
        f"{CLASSES}.cancel_invite",
        {"cancelled": True},
        ("instructor_id", "class_id"),
        id="cancel-invite",
    ),
    pytest.param(
        "get",
        f"/api/tas/classes/{CLASS}",
        {},
        f"{TAS}.list_class_tas",
        [],
        ("instructor_id", "class_id"),
        id="list-tas",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/promote",
        {"json": {"user_id": MEMBER}},
        f"{TAS}.promote_to_ta",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="promote-ta",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/demote",
        {"json": {"user_id": MEMBER}},
        f"{TAS}.demote_ta",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="demote-ta",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/review-window",
        {"json": {"open": True}},
        f"{TAS}.set_review_window",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="review-window",
    ),
    pytest.param(
        "post",
        f"/api/tas/classes/{CLASS}/review-zoom",
        {"json": {"zoom_url": "https://zoom.us/j/1"}},
        f"{TAS}.set_review_zoom",
        {"ok": True},
        ("instructor_id", "class_id"),
        id="review-zoom",
    ),
    pytest.param(
        "post",
        f"/api/tas/projects/{PROJECT}/review-time",
        {"json": {"scheduled_at": "2026-12-01T20:00:00Z"}},
        f"{TAS}.set_final_review_time",
        {"ok": True},
        ("instructor_id", "project_id"),
        id="review-time",
    ),
]


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


#: The id each scope parameter must carry: the class or project the request path names.
SCOPES = {"class_id": CLASS, "project_id": PROJECT}


@pytest.mark.parametrize(("method", "path", "kwargs", "target", "returns", "params"), ROUTES)
def test_a_class_owner_whose_account_is_a_student_reaches_the_owner_check(
    client: TestClient, monkeypatch, method, path, kwargs, target, returns, params
):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    real = pydoc.locate(target)  # before the patch below replaces it
    assert callable(real), target
    calls: list[inspect.BoundArguments] = []

    def controller(*call_args, **call_kwargs):
        calls.append(inspect.signature(real).bind(*call_args, **call_kwargs))
        return returns

    monkeypatch.setattr(target, controller)
    res = getattr(client, method)(path, headers=_as(OWNER), **kwargs)

    assert res.status_code == 200, res.text
    [call] = calls
    owner, scope = params
    # By name, not "somewhere in the call": a view that swapped the caller with an id from the
    # body (promote_to_ta(data.user_id, class_id, user_id)) would let a student promote
    # themselves by posting the owner's id, and must fail here.
    assert str(call.arguments[owner]) == OWNER
    assert str(call.arguments[scope]) == SCOPES[scope]


def test_cancelling_an_invite_with_a_job_id_that_is_not_a_uuid_answers_422(
    client: TestClient, monkeypatch
):
    # pending_invites.id is a uuid: anything else would only fail in the database, as a 500.
    calls = []
    monkeypatch.setattr(f"{CLASSES}.cancel_invite", lambda *args, **kwargs: calls.append(args))
    res = client.delete(f"/api/classes/{CLASS}/invites/job-1", headers=_as(OWNER))
    assert res.status_code == 422, res.text
    assert calls == []


def test_creating_a_class_still_needs_the_instructor_role(client: TestClient, monkeypatch):
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "student")
    res = client.post(
        "/api/classes",
        headers=_as(OWNER),
        json={"name": "CSE 115A", "term": "Fall", "start_date": "2026-09-24"},
    )
    assert (res.status_code, res.json()["detail"]) == (403, "Instructor role required")


def _dependency_calls(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _dependency_calls(sub)


def test_only_creating_a_class_depends_on_the_account_role():
    """``require_instructor`` reads ``profiles.role``, which now only decides who may create
    classes. Fails if any other route (a class endpoint above, or a new one) gates on it again."""
    routes = [
        route
        for route in iter_route_contexts(fastapi_app.routes)
        if isinstance(route.original_route, APIRoute)
    ]
    assert len(routes) > 100  # the walk sees the whole app, or the check below proves nothing

    gated = {
        (method, route.path)
        for route in routes
        if require_instructor in set(_dependency_calls(route.dependant))
        for method in route.methods
    }
    assert gated == {("POST", "/api/classes")}


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
