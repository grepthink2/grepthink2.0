"""Stories' priority order: the board lists a sprint's stories, and the backlog, by rank and then
by key, and PUT /api/projects/{project_id}/scrum/stories/order sets one list's ranks."""

from datetime import date

import pytest
from postgrest.exceptions import APIError

from app.core import authz
from app.scrum import controller
from tests.conftest import header_for
from tests.scrum_support import OTHER_PID, OUTSIDER, PID, TA, UID, pin_today, scrum_db

TODAY = date(2026, 9, 10)
SPRINT = {
    "id": "sp1",
    "project_id": PID,
    "name": "Sprint 1",
    "starts_at": "2026-09-07",
    "ends_at": "2026-09-20",  # holds TODAY
    "status": "planned",
}
BOARD_URL = f"/api/projects/{PID}/scrum/board"


def _story(sid: str, key: str, sprint: str | None, created: str, **extra) -> dict:
    return {
        "id": sid,
        "project_id": PID,
        "key": key,
        "title": key,
        "sprint_id": sprint,
        "reporter_id": UID,
        "created_at": created,
        "archived_at": None,
        **extra,
    }


def test_the_board_lists_ranked_stories_first_then_the_rest_by_key(monkeypatch):
    """In the sprint and in the backlog alike. The stories were created in another order, which
    the board used to keep."""
    pin_today(monkeypatch, TODAY)
    scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("a", "US-10", "sp1", "1"),
            _story("b", "US-2", "sp1", "2", rank=2),
            _story("c", "US-1", "sp1", "3"),
            _story("d", "US-9", "sp1", "4"),
            _story("e", "US-3", "sp1", "5", rank=1),
            _story("f", "US-12", None, "6"),
            _story("g", "US-11", None, "7", rank=1),
            _story("h", "US-5", "sp1", "8", archived_at="2026-09-01T00:00:00Z"),  # legacy: backlog
            _story("i", "US-4", None, "9"),
        ],
        tasks=[],
    )

    board = controller.get_board(project_id=PID, user_id=UID, sprint_id=None)

    assert [s["key"] for s in board["stories"]] == ["US-3", "US-2", "US-1", "US-9", "US-10"]
    assert [s["key"] for s in board["backlog"]] == ["US-11", "US-4", "US-5", "US-12"]


def test_board_stories_carry_their_rank_and_criteria(monkeypatch, client):
    """A row from a database without the two columns reads as unranked, with no criteria."""
    pin_today(monkeypatch, TODAY)
    scrum_db(
        monkeypatch,
        sprints=[dict(SPRINT)],
        user_stories=[
            _story("a", "US-1", "sp1", "1", rank=1, acceptance_criteria=["Finds a trail by name"]),
            _story("b", "US-2", None, "2"),
        ],
        tasks=[],
    )

    body = client.get(BOARD_URL, headers=header_for("tony@ucsc.edu", sub=UID)).json()

    [story] = body["stories"]
    assert (story["rank"], story["acceptance_criteria"]) == (1, ["Finds a trail by name"])
    [backlog] = body["backlog"]
    assert (backlog["rank"], backlog["acceptance_criteria"]) == (None, [])


# --------------------------------------------------------------- the order route ----

URL = f"/api/projects/{PID}/scrum/stories/order"
SP = "00000000-0000-0000-0000-00000000a001"
SP2 = "00000000-0000-0000-0000-00000000a002"
SP_THEIRS = "00000000-0000-0000-0000-00000000a003"
#: Stories US-1 to US-7 of PID, by number, and one of OTHER_PID.
ST = {n: f"00000000-0000-0000-0000-00000000b00{n}" for n in range(1, 8)}
THEIRS = "00000000-0000-0000-0000-00000000c001"
UNKNOWN = "00000000-0000-0000-0000-00000000dead"
#: One id more than an order takes.
TOO_MANY = [f"00000000-0000-0000-0000-{n:012d}" for n in range(201)]


def _sprint(sid: str, project: str) -> dict:
    return {**SPRINT, "id": sid, "project_id": project}


def _seed_lists(monkeypatch):
    """Sprint SP holds US-1 to US-3, ranked in key order. The backlog holds US-4, US-5 and the
    legacy archived US-6, which still names SP. SP2 holds US-7. OTHER_PID's story sits in its
    own sprint."""
    return scrum_db(
        monkeypatch,
        sprints=[_sprint(SP, PID), _sprint(SP2, PID), _sprint(SP_THEIRS, OTHER_PID)],
        user_stories=[
            _story(ST[1], "US-1", SP, "1", rank=1),
            _story(ST[2], "US-2", SP, "2", rank=2),
            _story(ST[3], "US-3", SP, "3", rank=3),
            _story(ST[4], "US-4", None, "4"),
            _story(ST[5], "US-5", None, "5"),
            _story(ST[6], "US-6", SP, "6", archived_at="2026-09-01T00:00:00Z"),
            _story(ST[7], "US-7", SP2, "7"),
            {**_story(THEIRS, "US-1", SP_THEIRS, "8"), "project_id": OTHER_PID},
        ],
    )


def _ranks(db, *ids: str) -> list[int | None]:
    by_id = {s["id"]: s for s in db.rows("user_stories")}
    return [by_id[i].get("rank") for i in ids]


def _put(client, body: dict, user: str = UID):
    return client.put(URL, headers=header_for("tony@ucsc.edu", sub=user), json=body)


def test_ordering_a_sprint_ranks_its_stories_from_one(monkeypatch, client):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": SP, "story_ids": [ST[3], ST[1], ST[2]]})

    assert res.status_code == 200, res.text
    assert res.json() == {"story_ids": [ST[3], ST[1], ST[2]]}
    assert _ranks(db, ST[3], ST[1], ST[2]) == [1, 2, 3]
    # The access check, the sprint's project, and one rpc with the project, the sprint and the ids
    # in their new order: the function checks the list under a lock. No burnup snapshot: the order
    # moves no line.
    assert [q["table"] for q in db.queries] == [
        "project_members",
        "sprints",
        "rpc:scrum_set_story_order",
    ]
    [params] = db.queries[-1]["filters"]
    assert params == {"p_project_id": PID, "p_sprint_id": SP, "p_story_ids": [ST[3], ST[1], ST[2]]}
    assert db.executes == 3


def test_ordering_the_backlog_takes_its_legacy_archived_story_too(monkeypatch, client):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": None, "story_ids": [ST[6], ST[5], ST[4]]})

    assert res.status_code == 200, res.text
    assert _ranks(db, ST[6], ST[5], ST[4]) == [1, 2, 3]
    assert _ranks(db, ST[1], ST[7], THEIRS) == [1, None, None]  # the other lists stay as they were
    # No sprint to check: the access check and the rpc, with a null sprint for the backlog.
    assert [q["table"] for q in db.queries] == ["project_members", "rpc:scrum_set_story_order"]
    [params] = db.queries[-1]["filters"]
    order = [ST[6], ST[5], ST[4]]
    assert params == {"p_project_id": PID, "p_sprint_id": None, "p_story_ids": order}


def test_ids_are_matched_whatever_their_case(monkeypatch, client):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": SP.upper(), "story_ids": [ST[2].upper(), ST[1], ST[3]]})

    assert res.status_code == 200, res.text
    assert res.json() == {"story_ids": [ST[2], ST[1], ST[3]]}
    assert _ranks(db, ST[2], ST[1], ST[3]) == [1, 2, 3]


@pytest.mark.parametrize(
    ("sprint", "ids"),
    [
        pytest.param(SP, [ST[1], ST[2]], id="a story missing"),
        pytest.param(SP, [ST[1], ST[2], ST[3], UNKNOWN], id="an id that is no story"),
        pytest.param(SP, [ST[1], ST[2], ST[7]], id="a story of another sprint"),
        pytest.param(SP, [ST[1], ST[2], ST[3], ST[6]], id="the legacy archived story"),
        pytest.param(SP, [ST[1], ST[2], THEIRS], id="a story of another project"),
        pytest.param(None, [ST[4], ST[5], ST[6], ST[1]], id="a sprint's story in the backlog"),
        pytest.param(None, [ST[4], ST[5]], id="a backlog story missing"),
    ],
)
def test_a_list_that_is_not_the_live_one_is_refused_and_nothing_is_written(
    monkeypatch, client, sprint, ids
):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": sprint, "story_ids": ids})

    # The function compares the ids with the list it locked and refuses (23505): nothing written.
    assert res.status_code == 409
    assert res.json()["detail"] == controller.STORIES_CHANGED
    assert _ranks(db, ST[1], ST[2], ST[3], ST[4], ST[5], ST[6]) == [1, 2, 3, None, None, None]


def test_a_story_moved_out_of_the_list_before_the_save_is_refused(monkeypatch, client):
    """A teammate moves US-3 to Sprint 2 after this client read the board and before its order
    reaches the database: the list is checked where it is locked, so the order is refused rather
    than ranking US-3 in a list it has left."""
    db = _seed_lists(monkeypatch)
    order = db.rpcs["scrum_set_story_order"]

    def moved_first(params):
        next(s for s in db.rows("user_stories") if s["id"] == ST[3])["sprint_id"] = SP2
        return order(params)

    db.rpcs["scrum_set_story_order"] = moved_first

    res = _put(client, {"sprint_id": SP, "story_ids": [ST[3], ST[1], ST[2]]})

    assert (res.status_code, res.json()["detail"]) == (409, controller.STORIES_CHANGED)
    assert _ranks(db, ST[1], ST[2], ST[3]) == [1, 2, 3]


def test_a_failing_order_save_answers_the_database_error(monkeypatch, client):
    """Before the migration the function does not exist: the route answers PostgREST's refusal as
    a failed write, and nothing is written."""
    db = _seed_lists(monkeypatch)

    def missing(_params):
        raise APIError(
            {
                "code": "PGRST202",
                "message": "Could not find the function public.scrum_set_story_order",
                "details": None,
                "hint": None,
            }
        )

    db.rpcs["scrum_set_story_order"] = missing

    res = _put(client, {"sprint_id": SP, "story_ids": [ST[3], ST[1], ST[2]]})

    assert res.status_code == 500
    assert res.json()["code"] == "database_write_failed"
    assert _ranks(db, ST[1], ST[2], ST[3]) == [1, 2, 3]


@pytest.mark.parametrize(
    "body",
    [
        pytest.param({"sprint_id": SP, "story_ids": [ST[1], ST[1], ST[2]]}, id="a repeated id"),
        pytest.param({"sprint_id": SP, "story_ids": [ST[1], ST[1].upper()]}, id="repeated in caps"),
        pytest.param({"sprint_id": SP, "story_ids": []}, id="no ids"),
        pytest.param({"sprint_id": SP, "story_ids": TOO_MANY}, id="201 ids"),
        pytest.param({"story_ids": [ST[1]]}, id="no sprint_id (null for the backlog)"),
        pytest.param({"sprint_id": SP, "story_ids": ["st1"]}, id="an id that is no uuid"),
    ],
)
def test_a_malformed_order_is_a_422_before_any_read(monkeypatch, client, body):
    db = _seed_lists(monkeypatch)

    res = _put(client, body)

    assert res.status_code == 422
    assert db.executes == 0


@pytest.mark.parametrize(
    ("user", "detail"),
    [
        pytest.param(TA, controller.MEMBERS_ONLY, id="staff"),
        pytest.param(OUTSIDER, authz.NOT_PROJECT_MEMBER, id="an outsider"),
    ],
)
def test_only_team_members_order_stories(monkeypatch, client, user, detail):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": SP, "story_ids": [ST[3], ST[2], ST[1]]}, user=user)

    assert (res.status_code, res.json()["detail"]) == (403, detail)
    assert _ranks(db, ST[3], ST[2], ST[1]) == [3, 2, 1]
    assert not [q for q in db.queries if q["op"] == "rpc"]


@pytest.mark.parametrize("sprint", [SP_THEIRS, UNKNOWN])
def test_a_sprint_of_another_project_is_404(monkeypatch, client, sprint):
    db = _seed_lists(monkeypatch)

    res = _put(client, {"sprint_id": sprint, "story_ids": [THEIRS]})

    assert (res.status_code, res.json()["detail"]) == (404, controller.SPRINT_NOT_FOUND)
    assert _ranks(db, THEIRS) == [None]
    assert not [q for q in db.queries if q["op"] == "rpc"]


def test_a_missing_project_is_404(monkeypatch, client):
    _seed_lists(monkeypatch)

    res = client.put(
        "/api/projects/00000000-0000-0000-0000-00000000beef/scrum/stories/order",
        headers=header_for("tony@ucsc.edu", sub=UID),
        json={"sprint_id": None, "story_ids": [ST[4]]},
    )

    assert (res.status_code, res.json()["detail"]) == (404, authz.PROJECT_NOT_FOUND)
