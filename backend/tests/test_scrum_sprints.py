"""Settings + sprint CRUD. A sprint's status follows its dates (spec D22): the stored column
keeps its default, ``planned``, and every sprint the controller answers carries the derived one."""

from datetime import date

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
#: A day inside SPRINT.
TODAY = date(2026, 8, 20)


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


def test_create_sprint_returns_the_row_with_the_status_of_its_dates(monkeypatch):
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    db = scrum_db(monkeypatch)
    out = controller.create_sprint(
        project_id=PID, user_id=UID, name="Sprint 1", starts_at="2026-08-17", ends_at="2026-08-30"
    )
    assert out["name"] == "Sprint 1" and out["project_id"] == PID
    assert out["status"] == "active"
    # The insert writes no status: the column keeps its default.
    assert db.rows("sprints") == [{k: v for k, v in out.items() if k != "status"}]


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
        controller.update_sprint(sprint_id="s-missing", user_id=UID, fields={"name": "Renamed"})
    assert (e.value.status_code, e.value.detail) == (404, controller.SPRINT_NOT_FOUND)


def test_update_sprint_rejects_reversed_effective_dates(monkeypatch):
    db = scrum_db(monkeypatch, sprints=[dict(SPRINT)])
    with pytest.raises(HTTPException) as e:
        controller.update_sprint(sprint_id="s1", user_id=UID, fields={"ends_at": "2026-08-01"})
    assert e.value.status_code == 422
    assert db.rows("sprints")[0]["ends_at"] == "2026-08-30"  # nothing written


def test_update_sprint_writes_only_the_name_and_dates(monkeypatch):
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    db = scrum_db(monkeypatch, sprints=[dict(SPRINT)])
    out = controller.update_sprint(
        sprint_id="s1",
        user_id=UID,
        fields={"name": "Kickoff", "status": "completed", "project_id": "hijack"},
    )
    [row] = db.rows("sprints")
    assert (row["name"], row["status"], row["project_id"]) == ("Kickoff", "planned", PID)
    assert (out["name"], out["status"]) == ("Kickoff", "active")  # its dates hold TODAY


def _with_class(**cols):
    from tests.scrum_support import CLASS

    row = {
        "id": CLASS,
        "created_by": INSTR,
        "sprint_count": None,
        "sprint_frequency": None,
        "sprints_start_on": None,
        "start_date": None,
        "end_date": None,
    }
    row.update(cols)
    return [row]


def _seed_sprints(n: int) -> list[dict]:
    return [
        {
            "id": f"sp{k}",
            "project_id": PID,
            "name": f"Sprint {k}",
            "starts_at": f"2026-09-{k + 10:02d}",
            "ends_at": f"2026-09-{k + 10:02d}",
            "sequence": k,
        }
        for k in range(1, n + 1)
    ]


def test_create_sprint_refuses_a_team_that_has_all_its_class_sprints(monkeypatch):
    # CSE115A Fall: four biweekly sprints, and the schedule already made all four for the team.
    db = scrum_db(
        monkeypatch,
        classes=_with_class(
            sprint_count=4, sprint_frequency="biweekly", sprints_start_on="2026-09-21"
        ),
        sprints=_seed_sprints(4),
    )
    with pytest.raises(HTTPException) as e:
        controller.create_sprint(
            project_id=PID,
            user_id=UID,
            name="Sprint 5",
            starts_at="2026-11-30",
            ends_at="2026-12-06",
        )
    assert (e.value.status_code, e.value.detail) == (
        409,
        "This class runs 4 sprints, and your team has all of them",
    )
    assert len(db.rows("sprints")) == 4


def test_create_sprint_fills_a_missing_slot_under_the_cap(monkeypatch):
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    db = scrum_db(
        monkeypatch,
        classes=_with_class(
            sprint_count=4, sprint_frequency="biweekly", sprints_start_on="2026-09-21"
        ),
        sprints=_seed_sprints(3),
    )
    controller.create_sprint(
        project_id=PID, user_id=UID, name="Extra", starts_at="2026-11-02", ends_at="2026-11-15"
    )
    assert len(db.rows("sprints")) == 4


def test_create_sprint_has_no_cap_without_a_schedule(monkeypatch):
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    db = scrum_db(monkeypatch, sprints=_seed_sprints(6))
    controller.create_sprint(
        project_id=PID, user_id=UID, name="Sprint 7", starts_at="2026-10-01", ends_at="2026-10-14"
    )
    assert len(db.rows("sprints")) == 7


def test_create_sprint_must_fit_the_class_dates(monkeypatch):
    # Last day of classes Friday Dec 4, 2026: a sprint may run to Sunday Dec 6, not past it.
    db = scrum_db(monkeypatch, classes=_with_class(start_date="2026-09-21", end_date="2026-12-04"))
    for start, end in (("2026-09-14", "2026-09-27"), ("2026-11-30", "2026-12-07")):
        with pytest.raises(HTTPException) as e:
            controller.create_sprint(
                project_id=PID, user_id=UID, name="Out", starts_at=start, ends_at=end
            )
        assert (e.value.status_code, e.value.detail) == (
            422,
            "A sprint must run between Sep 21, 2026 and Dec 6, 2026",
        )
    assert db.rows("sprints") == []
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    controller.create_sprint(
        project_id=PID, user_id=UID, name="Last", starts_at="2026-11-23", ends_at="2026-12-06"
    )
    assert len(db.rows("sprints")) == 1


def test_update_sprint_dates_must_fit_the_class_dates(monkeypatch):
    db = scrum_db(
        monkeypatch,
        classes=_with_class(start_date="2026-09-21", end_date="2026-12-04"),
        sprints=_seed_sprints(1),
    )
    with pytest.raises(HTTPException) as e:
        controller.update_sprint(sprint_id="sp1", user_id=UID, fields={"ends_at": "2026-12-20"})
    assert e.value.status_code == 422
    assert db.rows("sprints")[0]["ends_at"] == "2026-09-11"


def test_board_reports_the_class_sprint_limit(monkeypatch):
    monkeypatch.setattr(controller, "_today", lambda zone: TODAY)
    scrum_db(
        monkeypatch,
        classes=_with_class(
            sprint_count=4, sprint_frequency="biweekly", sprints_start_on="2026-09-21"
        ),
        sprints=_seed_sprints(4),
    )
    board = controller.get_board(project_id=PID, user_id=UID, sprint_id=None)
    assert board["project"]["sprint_limit"] == 4
