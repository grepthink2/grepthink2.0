"""The scrum board connector's controller (app/mcp/controller.py): what a connected app may read
and the batch it may add, checked in full before one ``scrum_fill_board`` call."""

from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException

from app.mcp import controller
from app.mcp.controller import FillRejected
from app.mcp.models import FillBoardRequest
from tests.scrum_support import (
    CLASS,
    INSTR,
    OTHER_PID,
    PID,
    RELATIONS,
    TA,
    UID,
    pin_today,
    profile,
    scrum_db,
)

MATE = "00000000-0000-0000-0000-0000000000dd"
SPRINT_PLANNED = "sprint-planned"
SPRINT_DONE = "sprint-done"
SPRINT_OTHER = "sprint-other"

MCP_RELATIONS = {
    **RELATIONS,
    ("project_members", "profiles!project_members_user_id_fkey"): ("user_id", "id", False),
    # the connector's authorization server (app/mcp/oauth.py)
    ("mcp_tokens", "mcp_grants"): ("grant_id", "id", False),
    ("mcp_grants", "mcp_clients"): ("client_id", "client_id", False),
    ("mcp_authorizations", "mcp_clients"): ("client_id", "client_id", False),
}


def _db(monkeypatch, *, fill=None, **tables):
    seed = {
        "classes": [
            {
                "id": CLASS,
                "created_by": INSTR,
                "name": "Software Engineering",
                "course_code": "CSE 115A",
                "term": "Fall",
                "year": 2026,
                "institution_id": None,
            }
        ],
        "project_members": [
            {"id": "pm-1", "project_id": PID, "user_id": UID, "role": "owner"},
            {"id": "pm-2", "project_id": PID, "user_id": MATE, "role": "product owner"},
        ],
        "profiles": [
            profile(UID, "Tony", "Wu"),
            profile(MATE, "Priya", "Rao"),
            profile(INSTR, "Ina"),
            profile(TA, "Tara"),
        ],
        "sprints": [
            {
                "id": SPRINT_PLANNED,
                "project_id": PID,
                "name": "Sprint 1",
                "starts_at": "2026-10-26",
                "ends_at": "2026-11-06",
                "status": "planned",
            },
            {
                "id": SPRINT_DONE,
                "project_id": PID,
                "name": "Sprint 0",
                "starts_at": "2026-10-12",
                "ends_at": "2026-10-23",
                "status": "completed",
            },
            {
                "id": SPRINT_OTHER,
                "project_id": OTHER_PID,
                "name": "Theirs",
                "starts_at": "2026-10-26",
                "ends_at": "2026-11-06",
                "status": "active",
            },
        ],
        "user_stories": [
            {
                "id": "story-1",
                "project_id": PID,
                "sprint_id": None,
                "key": "US-1",
                "title": "Existing story",
                "points": 3,
                "archived_at": None,
                "created_at": "2026-10-20T00:00:00Z",
            }
        ],
        "tasks": [
            {
                "id": "task-1",
                "story_id": "story-1",
                "project_id": PID,
                "key": "GT-1",
                "title": "Existing task",
                "status": "todo",
                "points": 3,
                "created_at": "2026-10-20T00:00:00Z",
            }
        ],
        "sprint_burnup_days": [],
        "institutions": [],
        "mcp_clients": [],
        "mcp_authorizations": [],
        "mcp_grants": [],
        "mcp_tokens": [],
    }
    seed.update(tables)
    fake = scrum_db(monkeypatch, **seed)
    fake.relations.update(MCP_RELATIONS)
    calls: list[dict] = []

    def fill_rpc(params: dict) -> dict:
        calls.append(params)
        if fill is not None:
            return fill(params)
        return {
            "sprints": [
                {"ref": s["ref"], "id": f"new-{s['ref']}", "name": s["name"]}
                for s in params["p_sprints"]
            ],
            "stories": [
                {
                    "id": f"st-{i}",
                    "key": f"US-{i + 2}",
                    "title": s["title"],
                    "sprint_id": s.get("sprint_id") or (s.get("sprint_ref") and "new-x"),
                    "tasks": [],
                }
                for i, s in enumerate(params["p_stories"])
            ],
        }

    fake.rpcs["scrum_fill_board"] = fill_rpc
    fake.fill_calls = calls
    return fake


def _req(**over) -> FillBoardRequest:
    body = {
        "confirmed": True,
        "sprints": [],
        "stories": [
            {
                "title": "Sign in",
                "description_md": "As a student I want to sign in.",
                "points": 5,
                "assignee_id": MATE,
                "tasks": [
                    {
                        "title": "Form",
                        "description_md": "The form.",
                        "points": 3,
                        "estimate_hours": 4,
                        "assignee_id": UID,
                        "tags": ["frontend"],
                    },
                    {
                        "title": "API",
                        "description_md": "The route.",
                        "points": 2,
                        "estimate_hours": 3,
                        "assignee_id": MATE,
                        "tags": ["backend"],
                    },
                ],
            }
        ],
    }
    body.update(over)
    return FillBoardRequest.model_validate(body)


def _fill(req: FillBoardRequest, user_id: str = UID) -> dict:
    return controller.fill_board(
        project_id=PID, user_id=user_id, client_id="client-claude", request=req
    )


# ------------------------------------------------------------------------- reads ----


def test_list_my_projects_only_member_projects(monkeypatch):
    _db(monkeypatch)

    projects = controller.list_my_projects(user_id=UID)

    assert projects == [
        {
            "project_id": PID,
            "name": "Trailhead",
            "class_name": "Software Engineering",
            "course_code": "CSE 115A",
            "term": "Fall",
            "year": 2026,
        }
    ]
    assert controller.list_my_projects(user_id=TA) == []


def test_board_context_member(monkeypatch):
    _db(monkeypatch)
    pin_today(monkeypatch, date(2026, 10, 25))

    ctx = controller.board_context(project_id=PID, user_id=UID)

    assert ctx["can_write"] is True
    assert ctx["estimate_scale"] == "fibonacci"
    assert ctx["allowed_points"] == [1, 2, 3, 5, 8, 13]
    assert ctx["hours_range"] == [1, 15]
    assert "frontend" in ctx["tags"]
    assert ctx["today"] == "2026-10-25"
    assert {m["user_id"]: m["name"] for m in ctx["members"]} == {
        UID: "Tony Wu",
        MATE: "Priya Rao",
    }
    assert [s["id"] for s in ctx["sprints"]] == [SPRINT_DONE, SPRINT_PLANNED]
    assert ctx["existing"] == [
        {
            "key": "US-1",
            "title": "Existing story",
            "sprint_id": None,
            "tasks": [{"key": "GT-1", "title": "Existing task", "status": "todo"}],
        }
    ]


def test_board_context_staff_reads_but_cannot_write(monkeypatch):
    _db(monkeypatch)

    ctx = controller.board_context(project_id=PID, user_id=TA)

    assert ctx["can_write"] is False


# ------------------------------------------------------------------------ writes ----


def test_fill_requires_confirmed(monkeypatch):
    fake = _db(monkeypatch)

    with pytest.raises(FillRejected) as exc:
        _fill(_req(confirmed=False))

    assert exc.value.errors == [controller.NOT_CONFIRMED]
    assert fake.fill_calls == []


def test_fill_staff_forbidden(monkeypatch):
    fake = _db(monkeypatch)

    with pytest.raises(HTTPException) as exc:
        _fill(_req(), user_id=TA)

    assert exc.value.status_code == 403
    assert fake.fill_calls == []


def test_fill_reports_every_error_and_writes_nothing(monkeypatch):
    fake = _db(monkeypatch)
    req = _req(
        sprints=[
            {"ref": "s1", "name": "Sprint 2", "starts_at": "2026-11-10", "ends_at": "2026-11-01"},
            {"ref": "s1", "name": "", "starts_at": "2026-11-10", "ends_at": "2026-11-20"},
        ],
        stories=[
            {"title": "", "points": 7, "assignee_id": TA, "sprint": SPRINT_DONE},
            {"title": "x" * 201, "sprint": SPRINT_OTHER},
            {"title": "ok", "sprint": "nope"},
            {
                "title": "tasks",
                "description_md": "d" * 20001,
                "tasks": [
                    {"title": "t", "estimate_hours": 16, "tags": ["frontend", "magic"]},
                    {"title": "t2", "points": 0, "estimate_hours": 0},
                ],
            },
        ],
    )

    with pytest.raises(FillRejected) as exc:
        _fill(req)

    assert exc.value.errors == [
        "sprints[0]: ends_at must be on or after starts_at",
        "sprints[1].name: must be 1 to 80 characters",
        "sprints[1].ref: 's1' is used by another sprint in this batch",
        "stories[0].title: must be 1 to 200 characters",
        "stories[0].points: 7 is not on the fibonacci scale (1, 2, 3, 5, 8, 13)",
        f"stories[0].assignee_id: {TA} is not on the team",
        "stories[0].sprint: sprint-done is completed; add stories to a planned or active sprint",
        "stories[1].title: must be 1 to 200 characters",
        "stories[1].sprint: no sprint of this project or of this batch has that id or ref",
        "stories[2].sprint: no sprint of this project or of this batch has that id or ref",
        "stories[3].description_md: must be at most 20000 characters",
        "stories[3].tasks[0].estimate_hours: 16 is not a whole number of hours from 1 to 15",
        "stories[3].tasks[0].tags: unknown tag 'magic'",
        "stories[3].tasks[1].points: 0 is not on the fibonacci scale (1, 2, 3, 5, 8, 13)",
        "stories[3].tasks[1].estimate_hours: 0 is not a whole number of hours from 1 to 15",
    ]
    assert fake.fill_calls == []


def test_fill_caps_the_batch(monkeypatch):
    _db(monkeypatch)
    req = _req(
        sprints=[
            {"ref": f"s{i}", "name": "S", "starts_at": "2026-11-01", "ends_at": "2026-11-02"}
            for i in range(11)
        ],
        stories=[{"title": "s", "tasks": [{"title": "t"}] * 6} for _ in range(61)],
    )

    with pytest.raises(FillRejected) as exc:
        _fill(req)

    assert exc.value.errors[:3] == [
        "at most 10 sprints per batch (got 11)",
        "at most 60 stories per batch (got 61)",
        "at most 300 tasks per batch (got 366)",
    ]


def test_fill_needs_a_story_or_sprint(monkeypatch):
    _db(monkeypatch)

    with pytest.raises(FillRejected) as exc:
        _fill(_req(stories=[]))

    assert exc.value.errors == ["nothing to add: send at least one sprint or story"]


def test_fill_warnings(monkeypatch):
    _db(monkeypatch)
    req = _req(
        stories=[
            {
                "title": "Bare story",
                "tasks": [{"title": "Bare task"}],
            },
            {
                "title": "Mismatch",
                "description_md": "d",
                "points": 8,
                "assignee_id": UID,
                "tasks": [
                    {
                        "title": "t",
                        "description_md": "d",
                        "points": 3,
                        "estimate_hours": 2,
                        "assignee_id": UID,
                    }
                ],
            },
        ]
    )

    result = _fill(req)

    assert result["warnings"] == [
        "stories[0] 'Bare story': no points, no assignee, no description",
        "stories[0].tasks[0] 'Bare task': no points, no hours estimate, no assignee, "
        "no description",
        "stories[1] 'Mismatch': its tasks' points add up to 3, not its 8 points",
    ]


def test_fill_calls_rpc_once_and_snapshots(monkeypatch):
    fake = _db(monkeypatch)
    pin_today(monkeypatch, date(2026, 10, 27))
    req = _req(
        sprints=[
            {"ref": "s2", "name": "Sprint 2", "starts_at": "2026-11-09", "ends_at": "2026-11-20"}
        ],
        stories=[
            {"title": "In new", "points": 3, "sprint": "s2"},
            {"title": "In planned", "points": 5, "sprint": SPRINT_PLANNED},
            {"title": "Backlog"},
        ],
    )

    def fill(params):
        return {
            "sprints": [{"ref": "s2", "id": "new-s2", "name": "Sprint 2"}],
            "stories": [
                {"id": "a", "key": "US-2", "title": "In new", "sprint_id": "new-s2", "tasks": []},
                {
                    "id": "b",
                    "key": "US-3",
                    "title": "In planned",
                    "sprint_id": SPRINT_PLANNED,
                    "tasks": [],
                },
                {"id": "c", "key": "US-4", "title": "Backlog", "sprint_id": None, "tasks": []},
            ],
        }

    fake.rpcs["scrum_fill_board"] = lambda p: (fake.fill_calls.append(p), fill(p))[1]

    result = _fill(req)

    assert len(fake.fill_calls) == 1
    params = fake.fill_calls[0]
    assert params["p_project_id"] == PID and params["p_reporter_id"] == UID
    assert params["p_sprints"] == [
        {"ref": "s2", "name": "Sprint 2", "starts_at": "2026-11-09", "ends_at": "2026-11-20"}
    ]
    assert [(s["title"], s.get("sprint_ref"), s.get("sprint_id")) for s in params["p_stories"]] == [
        ("In new", "s2", None),
        ("In planned", None, SPRINT_PLANNED),
        ("Backlog", None, None),
    ]
    assert [s["key"] for s in result["stories"]] == ["US-2", "US-3", "US-4"]
    assert sorted(r["sprint_id"] for r in fake.rows("sprint_burnup_days")) == [
        "new-s2",
        SPRINT_PLANNED,
    ]
    (event,) = fake.rows("events")
    assert event["kind"] == "board_agent_fill"
    assert event["project_id"] == PID
    assert event["meta"] == {
        "sprints": 1,
        "stories": 3,
        "tasks": 0,
        "warnings": 3,
        "client_id": "client-claude",
    }


def test_fill_round_trips(monkeypatch):
    fake = _db(monkeypatch)
    before = fake.executes

    _fill(_req())

    # access check, then the project + sprints + members reads fanned out, the rpc, and the
    # event insert. No sprint touched, so no snapshot.
    assert fake.executes - before == 6
