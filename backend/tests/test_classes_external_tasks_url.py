"""A class's "Tasks - External" link: what the API accepts, and who may change it.

The link is the class's task board elsewhere; the web client shows it as a "Tasks - External"
item in the class's sidebar and opens it in a new tab. Because it becomes a link's ``href``, only
a full ``http(s)://`` address with a host is stored: a ``javascript:`` or ``data:`` URL would run
in GrepThink's origin when clicked. Blank means no link, so the item stays hidden. The
``classes_external_tasks_url_valid`` CHECK refuses the same shapes in the database, and the API's
length cap must not exceed the column's (2048), or a link the API accepts would fail as a 500.

The instructor sets it when creating the class and changes or removes it later from Class
Settings (``PATCH /api/classes/{class_id}/external-tasks-url``). Who may call that is pinned with
the other instructor-only routes in ``test_classes_authz.py`` and ``test_class_scoped_roles.py``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.classes import controller as classes
from app.classes.models import CreateClassRequest, UpdateClassExternalTasksUrlRequest
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

INSTR = "10000000-0000-0000-0000-000000000001"
CLASS = "c0000000-0000-0000-0000-000000000001"
EXISTING = "https://tasks.grepthink2.com/cse115a"
NEW_CLASS = {"name": "CSE 115A", "term": "Fall", "start_date": "2026-09-24"}

#: The web client's cases too: what the web accepts, the API must accept (else a 422 in the
#: dialog), so both suites read one table.
CASES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "frontend/src/lib/__tests__/fixtures/external-tasks-url-cases.json"
    ).read_text(encoding="utf-8")
)
#: Exactly the column's limit: "https://example.org/" is 20 characters.
LONGEST = "https://example.org/" + "a" * 2028

ACCEPTED = [*map(tuple, CASES["accepted"]), (LONGEST, LONGEST)]
BLANK = [None, *CASES["blank"]]
REFUSED = [*CASES["refused"], LONGEST + "a"]

MODELS = [
    pytest.param(lambda url: CreateClassRequest(**NEW_CLASS, external_tasks_url=url), id="create"),
    pytest.param(
        lambda url: UpdateClassExternalTasksUrlRequest(external_tasks_url=url), id="update"
    ),
]


@pytest.mark.parametrize("build", MODELS)
@pytest.mark.parametrize(("raw", "stored"), ACCEPTED)
def test_a_full_http_address_is_kept_as_typed_less_surrounding_spaces(build, raw, stored):
    assert build(raw).external_tasks_url == stored


@pytest.mark.parametrize("build", MODELS)
@pytest.mark.parametrize("raw", BLANK)
def test_a_blank_link_means_no_link(build, raw):
    assert build(raw).external_tasks_url is None


@pytest.mark.parametrize("build", MODELS)
@pytest.mark.parametrize("raw", REFUSED)
def test_anything_but_a_full_http_address_is_refused(build, raw):
    with pytest.raises(ValidationError) as exc:
        build(raw)
    assert [error["loc"] for error in exc.value.errors()] == [("external_tasks_url",)]


def test_a_class_is_created_without_a_link_when_none_is_given():
    assert CreateClassRequest(**NEW_CLASS).external_tasks_url is None


def test_the_update_must_say_which_link_so_an_empty_body_never_clears_it():
    with pytest.raises(ValidationError):
        UpdateClassExternalTasksUrlRequest()


# ------------------------------------------------------- the controller


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(
        classes=[
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "CSE 115A",
                "status": "active",
                "external_tasks_url": EXISTING,
            }
        ]
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _stored(db) -> str | None:
    [row] = db.rows("classes")
    return row["external_tasks_url"]


def test_the_instructor_changes_the_link_in_two_round_trips(db):
    updated = classes.update_class_external_tasks_url(CLASS, "https://job191.yeterly.ai/", INSTR)
    assert (updated["id"], updated["external_tasks_url"]) == (CLASS, "https://job191.yeterly.ai/")
    assert _stored(db) == "https://job191.yeterly.ai/"
    assert db.executes == 2  # the owner check, the update


def test_the_instructor_removes_the_link(db):
    updated = classes.update_class_external_tasks_url(CLASS, None, INSTR)
    assert updated["external_tasks_url"] is None
    assert _stored(db) is None


# ------------------------------------------------------------ the route

ROUTE = f"/api/classes/{CLASS}/external-tasks-url"


@pytest.fixture
def calls(monkeypatch) -> list[tuple]:
    recorded: list[tuple] = []

    def controller(class_id, external_tasks_url, instructor_id):
        recorded.append((str(class_id), external_tasks_url, instructor_id))
        return {"id": str(class_id), "external_tasks_url": external_tasks_url}

    monkeypatch.setattr("app.classes.views.controller.update_class_external_tasks_url", controller)
    return recorded


def _as(user_id: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {make_token(sub=user_id)}"}


def test_the_route_hands_the_cleaned_link_to_the_owner_check(client: TestClient, calls):
    res = client.patch(
        ROUTE, headers=_as(INSTR), json={"external_tasks_url": " https://job191.yeterly.ai/ "}
    )
    assert res.status_code == 200, res.text
    assert res.json()["class"] == {"id": CLASS, "external_tasks_url": "https://job191.yeterly.ai/"}
    assert calls == [(CLASS, "https://job191.yeterly.ai/", INSTR)]


def test_the_route_clears_the_link_for_null_or_blank(client: TestClient, calls):
    for body in ({"external_tasks_url": None}, {"external_tasks_url": "  "}):
        assert client.patch(ROUTE, headers=_as(INSTR), json=body).status_code == 200
    assert calls == [(CLASS, None, INSTR), (CLASS, None, INSTR)]


@pytest.mark.parametrize(
    "body",
    [{}, {"external_tasks_url": "javascript:alert(1)"}, {"external_tasks_url": "example.org"}],
    ids=["no-link-named", "javascript", "no-scheme"],
)
def test_the_route_refuses_a_bad_body_before_the_owner_check(client: TestClient, calls, body):
    res = client.patch(ROUTE, headers=_as(INSTR), json=body)
    assert res.status_code == 422, res.text
    assert calls == []


def test_the_create_route_refuses_a_javascript_link_before_creating_anything(
    client: TestClient, monkeypatch
):
    created: list = []
    monkeypatch.setattr(classes, "create_class", lambda *args, **kwargs: created.append(kwargs))
    monkeypatch.setattr("app.auth.controller.get_user_role", lambda _uid: "instructor")
    res = client.post(
        "/api/classes",
        headers=_as(INSTR),
        json={**NEW_CLASS, "external_tasks_url": "javascript:alert(1)"},
    )
    assert res.status_code == 422, res.text
    assert created == []
