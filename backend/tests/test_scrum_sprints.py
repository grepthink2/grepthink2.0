"""Settings + sprint CRUD."""

import pytest
from fastapi import HTTPException

from app.scrum import controller
from tests.scrum_support import INSTR, PID, UID, scrum_db

SPRINT = {
    "id": "s1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-08-17",
    "ends_at": "2026-08-30",
    "status": "planned",
}


def test_update_settings_writes_scale(monkeypatch):
    db = scrum_db(monkeypatch)
    controller.update_settings(project_id=PID, user_id=UID, estimate_scale="linear")
    assert next(p for p in db.rows("projects") if p["id"] == PID)["estimate_scale"] == "linear"


def test_update_settings_rejects_unknown_scale(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.update_settings(project_id=PID, user_id=UID, estimate_scale="vibes")
    assert e.value.status_code == 422


def test_staff_cannot_change_settings(monkeypatch):
    db = scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.update_settings(project_id=PID, user_id=INSTR, estimate_scale="linear")
    assert e.value.status_code == 403
    assert next(p for p in db.rows("projects") if p["id"] == PID)["estimate_scale"] == "fibonacci"


def test_create_sprint_returns_the_row(monkeypatch):
    db = scrum_db(monkeypatch)
    out = controller.create_sprint(
        project_id=PID, user_id=UID, name="Sprint 1", starts_at="2026-08-17", ends_at="2026-08-30"
    )
    assert out["name"] == "Sprint 1" and out["project_id"] == PID
    assert db.rows("sprints") == [out]


def test_create_sprint_rejects_reversed_dates(monkeypatch):
    db = scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.create_sprint(
            project_id=PID, user_id=UID, name="Bad", starts_at="2026-09-10", ends_at="2026-09-01"
        )
    assert (e.value.status_code, e.value.detail) == (422, controller.BAD_DATE_RANGE)
    assert db.rows("sprints") == []


def test_update_sprint_404_when_missing(monkeypatch):
    scrum_db(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.update_sprint(sprint_id="s-missing", user_id=UID, fields={"status": "active"})
    assert (e.value.status_code, e.value.detail) == (404, controller.SPRINT_NOT_FOUND)


def test_update_sprint_rejects_reversed_effective_dates(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.update_sprint(sprint_id="s1", user_id=UID, fields={"ends_at": "2026-08-01"})
    assert e.value.status_code == 422
    assert db.rows("sprints")[0]["ends_at"] == "2026-08-30"  # nothing written


def test_update_sprint_writes_allowed_fields(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(SPRINT)])
    out = controller.update_sprint(
        sprint_id="s1", user_id=UID, fields={"status": "active", "project_id": "hijack"}
    )
    assert out["status"] == "active"
    assert db.rows("sprints")[0]["project_id"] == PID  # only name/dates/status are writable
