"""Story/task creation (key RPC), updates, task delete, tag validation, PR links."""

import pytest
from fastapi import HTTPException

from app.core.db import get_client
from app.scrum import controller
from tests.scrum_support import OTHER_PID, PID, TA, UID, scrum_db

STORY = {"id": "st1", "project_id": PID, "key": "US-1", "title": "Search", "sprint_id": None}
TASK = {
    "id": "t1",
    "story_id": "st1",
    "project_id": PID,
    "key": "GT-1",
    "title": "Endpoint",
    "status": "todo",
    "pr_url": "https://github.com/o/r/pull/42",
}
FOREIGN_SPRINT = {
    "id": "s9",
    "project_id": OTHER_PID,
    "name": "Theirs",
    "starts_at": "2026-08-17",
    "ends_at": "2026-08-30",
    "status": "active",
}


def test_create_story_takes_its_key_from_the_rpc(monkeypatch):
    db = scrum_db(monkeypatch)
    first = controller.create_story(project_id=PID, user_id=UID, fields={"title": "Login flow"})
    second = controller.create_story(project_id=PID, user_id=UID, fields={"title": "Logout"})
    assert (first["key"], second["key"]) == ("US-1", "US-2")
    assert first["reporter_id"] == UID
    assert [q["table"] for q in db.queries].count("rpc:scrum_next_key") == 2


def test_create_story_rejects_a_sprint_from_another_project(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(FOREIGN_SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.create_story(
            project_id=PID, user_id=UID, fields={"title": "x", "sprint_id": "s9"}
        )
    assert (e.value.status_code, e.value.detail) == (404, controller.SPRINT_NOT_FOUND)
    assert db.rows("user_stories") == []


def test_staff_cannot_create_a_story(monkeypatch):
    db = scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.create_story(project_id=PID, user_id=TA, fields={"title": "x"})
    assert e.value.status_code == 403
    assert db.rows("user_stories") == []


def test_create_task_rejects_an_unknown_tag(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    with pytest.raises(HTTPException) as e:
        controller.create_task(story_id="st1", user_id=UID, fields={"title": "x", "tags": ["yolo"]})
    assert e.value.status_code == 422
    assert db.rows("tasks") == []


def test_create_task_inherits_the_story_project_and_gets_a_task_key(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)])
    out = controller.create_task(
        story_id="st1", user_id=UID, fields={"title": "x", "tags": ["backend"]}
    )
    assert (out["key"], out["project_id"], out["tags"]) == ("GT-1", PID, ["backend"])


def test_update_story_rejects_a_sprint_from_another_project(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)], sprints=[dict(FOREIGN_SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="st1", user_id=UID, fields={"sprint_id": "s9"})
    assert e.value.status_code == 404
    assert db.rows("user_stories")[0]["sprint_id"] is None


def test_update_story_archive_sets_the_timestamp(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)])
    controller.update_story(story_id="st1", user_id=UID, fields={"archived": True})
    stored = db.rows("user_stories")[0]
    assert stored["archived_at"] is not None and "archived" not in stored


def test_update_story_rejects_a_null_title(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)])
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="st1", user_id=UID, fields={"title": None})
    assert (e.value.status_code, e.value.detail) == (422, controller.TITLE_REQUIRED)


def test_update_story_404_when_missing(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.update_story(story_id="nope", user_id=UID, fields={"title": "x"})
    assert (e.value.status_code, e.value.detail) == (404, controller.STORY_NOT_FOUND)


def test_delete_task_removes_it(monkeypatch):
    db = scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK)])
    controller.delete_task(task_id="t1", user_id=UID)
    assert db.rows("tasks") == []


def test_pr_fields_fetch_failure_stores_a_null_state(monkeypatch):
    scrum_db(monkeypatch)
    monkeypatch.setattr(controller, "fetch_pr_state", lambda parsed, token: None)
    out = controller._pr_fields(get_client(), "https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_provider"] == "github"
    assert out["pr_state"] is None and out["pr_checked_at"] is None


def test_pr_fields_fetch_success_stamps_the_state(monkeypatch):
    scrum_db(monkeypatch)
    monkeypatch.setattr(controller, "fetch_pr_state", lambda parsed, token: "merged")
    out = controller._pr_fields(get_client(), "https://github.com/o/r/pull/42", project_id=PID)
    assert out["pr_state"] == "merged" and out["pr_checked_at"] is not None


def test_pr_fields_rejects_an_unknown_host(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller._pr_fields(
            get_client(), "https://gitlab.com/o/r/-/merge_requests/1", project_id=PID
        )
    assert e.value.status_code == 422


def test_update_task_skips_the_pr_fetch_when_the_url_is_unchanged(monkeypatch):
    scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK)])
    calls = []
    monkeypatch.setattr(controller, "_pr_fields", lambda *a, **k: calls.append(1) or {})
    out = controller.update_task(task_id="t1", user_id=UID, fields={"pr_url": TASK["pr_url"]})
    assert calls == [] and out["id"] == "t1"
