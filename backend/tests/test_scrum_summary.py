"""The project page's sprint summary: GET through the router, the real controller, and a
FakeSupabase.

The summary answers the same people as the board, but it is a pure read: loading the
project page records no board_viewed event (the board_views metric counts board loads) and
takes no burnup snapshot. Its sprint is the one the board opens on, with the status from its
dates (tests/test_scrum_sprint_status.py covers the choice and the status).
"""

from datetime import date

import pytest

from app.core import authz
from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import INSTR, MEETING_TA, OUTSIDER, PID, STUDENT, TA, UID, scrum_db

URL = f"/api/projects/{PID}/scrum/summary"
NO_TASKS = {"todo": 0, "in_progress": 0, "done": 0}
#: A day inside Sprint 2.
TODAY = date(2026, 9, 10)


def _sprint(sid, name, starts, ends):
    """Stored ``planned``, the column's default: the status comes from the dates."""
    return {
        "id": sid,
        "project_id": PID,
        "name": name,
        "starts_at": starts,
        "ends_at": ends,
        "status": "planned",
    }


def _story(sid, sprint, **extra):
    return {
        "id": sid,
        "project_id": PID,
        "key": f"US-{sid}",
        "title": sid,
        "sprint_id": sprint,
        "reporter_id": UID,
        "archived_at": None,
        **extra,
    }


def _task(tid, story, status):
    return {
        "id": tid,
        "story_id": story,
        "project_id": PID,
        "key": f"GT-{tid}",
        "title": tid,
        "status": status,
        "reporter_id": UID,
    }


S1 = _sprint("S1", "Sprint 1", "2026-08-10", "2026-08-23")
S2 = _sprint("S2", "Sprint 2", "2026-09-07", "2026-09-20")
S3 = _sprint("S3", "Sprint 3", "2026-09-21", "2026-10-04")


def _seed(monkeypatch):
    """On TODAY Sprint 2 is under way and Sprint 3 is planned after it. Sprint 2's two live
    stories hold 1 task to do, 2 in progress and 3 done. D has no sprint and E is archived, so
    the backlog holds two stories; their tasks, and those of the other sprints, do not count."""
    monkeypatch.setattr(controller, "_today_la", lambda: TODAY)
    return scrum_db(
        monkeypatch,
        sprints=[S1, S2, S3],
        user_stories=[
            _story("A", "S1"),
            _story("B", "S2"),
            _story("C", "S2"),
            _story("D", None),
            _story("E", "S2", archived_at="2026-09-09T00:00:00Z"),
            _story("F", "S3"),
        ],
        tasks=[
            _task("a1", "A", "done"),
            _task("b1", "B", "todo"),
            _task("b2", "B", "in_progress"),
            _task("b3", "B", "done"),
            _task("c1", "C", "in_progress"),
            _task("c2", "C", "done"),
            _task("c3", "C", "done"),
            _task("d1", "D", "done"),
            _task("e1", "E", "todo"),
            _task("f1", "F", "todo"),
        ],
    )


def test_a_member_gets_the_active_sprint_task_counts_and_the_backlog_size(monkeypatch, client):
    _seed(monkeypatch)
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    assert res.json() == {
        "sprint": {
            "id": "S2",
            "name": "Sprint 2",
            "starts_at": "2026-09-07",
            "ends_at": "2026-09-20",
            "status": "active",
        },
        "counts": {"todo": 1, "in_progress": 2, "done": 3},
        "backlog_stories": 2,
    }


def test_a_project_without_sprints_has_no_sprint_and_no_tasks(monkeypatch, client):
    scrum_db(
        monkeypatch,
        sprints=[],
        user_stories=[_story("D", None)],
        tasks=[_task("d1", "D", "done")],
    )
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    assert res.json() == {"sprint": None, "counts": NO_TASKS, "backlog_stories": 1}


def test_a_sprint_without_live_stories_counts_no_tasks(monkeypatch, client):
    scrum_db(
        monkeypatch,
        sprints=[S2],
        user_stories=[_story("E", "S2", archived_at="2026-09-09T00:00:00Z")],
        tasks=[_task("e1", "E", "done")],
    )
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    body = res.json()
    assert body["sprint"]["id"] == "S2"
    assert (body["counts"], body["backlog_stories"]) == (NO_TASKS, 1)


@pytest.mark.parametrize("uid", [OUTSIDER, STUDENT])
def test_someone_off_the_team_and_staff_gets_403(monkeypatch, client, uid):
    _seed(monkeypatch)
    res = client.get(URL, headers=header_for("x@ucsc.edu", sub=uid))
    assert res.status_code == 403
    assert res.json()["detail"] == authz.NOT_PROJECT_MEMBER


def test_a_project_that_does_not_exist_is_404(monkeypatch, client):
    _seed(monkeypatch)
    res = client.get(
        "/api/projects/00000000-0000-0000-0000-00000000dead/scrum/summary",
        headers=header_for("x@ucsc.edu", sub=OUTSIDER),
    )
    assert res.status_code == 404
    assert res.json()["detail"] == authz.PROJECT_NOT_FOUND


@pytest.mark.parametrize("uid", [INSTR, TA, MEETING_TA])
def test_class_staff_get_the_summary(monkeypatch, client, uid):
    _seed(monkeypatch)
    res = client.get(URL, headers=header_for("staff@ucsc.edu", sub=uid))
    assert res.status_code == 200
    assert res.json()["counts"] == {"todo": 1, "in_progress": 2, "done": 3}


def test_the_summary_records_nothing_and_writes_nothing(monkeypatch, client):
    db = _seed(monkeypatch)
    db.reset_counter()
    res = client.get(URL, headers=header_for("tony@ucsc.edu", sub=UID))
    assert res.status_code == 200
    assert db.store["events"] == []  # no board_viewed: the project page is not a board view
    assert db.rows("sprint_burnup_days") == []  # and no burnup snapshot
    assert {q["op"] for q in db.queries} == {"select"}
    # access 1 + sprints and stories 2 (concurrent) + the live stories' tasks 1
    assert db.executes <= 4
