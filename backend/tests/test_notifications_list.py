"""The notifications list: an Unread and an All view, a cursor, and each row's names.

``GET /api/notifications?view=unread|all&cursor=&limit=``. Unread is every unread row, whatever
its age; All is the last 30 days, read and unread. The unread count is every unread row in both
views. Pages are newest first and the cursor is the last row's ``created_at`` and ``id``, so rows
that share an instant are neither repeated nor skipped. Each row names its class, team and actor
(joined on read, so a renamed team shows its new name, and a deleted one is ``null``), a message
row names its conversation, and every row says how many messages it stands for. Every read is
filtered by the caller's id.
"""

from __future__ import annotations

import base64
from datetime import UTC, datetime

import pytest

from app.notifications import controller as notifications
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase

ME, OTHER = "00000000-0000-4000-8000-0000000000e1", "00000000-0000-4000-8000-0000000000e2"
SAM = "5a300000-0000-4000-8000-000000000001"
NONAME = "5a300000-0000-4000-8000-000000000002"
CLASS = "c1a55000-0000-4000-8000-000000000001"
TEAM = "7ea30000-0000-4000-8000-000000000001"
DM = "c0a70000-0000-4000-8000-000000000001"
TEAM_TA = "c0a70000-0000-4000-8000-000000000002"
TEAM_ALL = "c0a70000-0000-4000-8000-000000000003"
TEAM_INSTR = "c0a70000-0000-4000-8000-000000000004"
NOW = datetime(2026, 11, 25, 12, 0, tzinfo=UTC)
HEADERS = header_for("mia@ucsc.edu", sub=ME)

RELATIONS = {
    ("notifications", "classes"): ("class_id", "id", False),
    ("notifications", "projects"): ("project_id", "id", False),
    ("notifications", "profiles!notifications_actor_id_fkey"): ("actor_id", "id", False),
    ("conversations", "projects"): ("project_id", "id", False),
}


def _id(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


def _row(n: int, created_at: str, *, user_id: str = ME, read_at: str | None = None, **extra):
    return {
        "id": _id(n),
        "user_id": user_id,
        "type": "join_request",
        "title": f"title {n}",
        "body": f"body {n}",
        "entity_type": "project",
        "entity_id": TEAM,
        "read_at": read_at,
        "created_at": created_at,
        **extra,
    }


def _message(n: int, conversation: str, created_at: str, **extra):
    return _row(
        n, created_at, type="message", entity_type="conversation", entity_id=conversation, **extra
    )


@pytest.fixture
def db(monkeypatch):
    """ME's profile is complete and ME owns no class, so a list writes no reminder."""
    fake = FakeSupabase(
        relations=RELATIONS,
        profiles=[
            {
                "id": ME,
                "email": "mia@ucsc.edu",
                "role": "student",
                "first_name": "Mia",
                "last_name": "Ma",
                "edu_email": "mia@ucsc.edu",
            },
            {
                "id": SAM,
                "email": "sam@ucsc.edu",
                "first_name": "Sam",
                "last_name": "Okafor",
                "image_url": "https://img.example/sam.png",
            },
            {"id": NONAME, "email": "nameless@ucsc.edu", "first_name": None, "last_name": " "},
        ],
        classes=[{"id": CLASS, "name": "CSE 115A", "created_by": SAM}],
        projects=[{"id": TEAM, "class_id": CLASS, "name": "Trailhead"}],
        conversations=[
            {"id": DM, "type": "dm", "user_a": ME, "user_b": SAM, "project_id": None},
            {"id": TEAM_TA, "type": "team_ta", "project_id": TEAM},
            {"id": TEAM_ALL, "type": "team_members", "project_id": TEAM},
            {"id": TEAM_INSTR, "type": "team_instructor", "project_id": TEAM},
        ],
        notifications=[],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    monkeypatch.setattr(notifications, "_now", lambda: NOW)
    return fake


def _get(client, **params):
    return client.get("/api/notifications", params=params, headers=HEADERS)


def _ids(res) -> list[str]:
    assert res.status_code == 200, res.text
    return [n["id"] for n in res.json()["notifications"]]


# ------------------------------------------------------------------------------ the views


def test_all_is_the_last_thirty_days_read_and_unread(client, db):
    db.rows("notifications").extend(
        [
            _row(1, "2026-11-24T12:00:00+00:00", read_at="2026-11-24T13:00:00+00:00"),
            _row(2, "2026-11-23T12:00:00+00:00"),
            _row(3, "2026-10-26T12:00:00+00:00"),  # exactly 30 days old: still in
            _row(4, "2026-10-26T11:59:59+00:00", read_at="2026-10-27T00:00:00+00:00"),
            _row(5, "2026-10-15T12:00:00+00:00"),  # unread, but 41 days old
        ]
    )
    assert _ids(_get(client)) == [_id(1), _id(2), _id(3)]
    assert _ids(_get(client, view="all")) == [_id(1), _id(2), _id(3)]


def test_unread_has_no_thirty_day_floor(client, db):
    db.rows("notifications").extend(
        [
            _row(1, "2026-11-24T12:00:00+00:00", read_at="2026-11-24T13:00:00+00:00"),
            _row(2, "2026-11-23T12:00:00+00:00"),
            _row(3, "2026-10-15T12:00:00+00:00"),  # 41 days old
        ]
    )
    assert _ids(_get(client, view="unread")) == [_id(2), _id(3)]


def test_the_count_is_every_unread_row_in_both_views(client, db):
    db.rows("notifications").extend(
        [
            _row(1, "2026-11-24T12:00:00+00:00", read_at="2026-11-24T13:00:00+00:00"),
            _row(2, "2026-11-23T12:00:00+00:00"),
            _row(3, "2026-10-15T12:00:00+00:00"),
        ]
    )
    assert _get(client, view="all").json()["unread_count"] == 2
    assert _get(client, view="unread").json()["unread_count"] == 2


def test_an_unknown_view_is_422(client, db):
    assert _get(client, view="archived").status_code == 422


def test_nobody_is_sent_another_users_rows(client, db):
    db.rows("notifications").extend(
        [
            _row(1, "2026-11-24T12:00:00+00:00"),
            _row(2, "2026-11-24T13:00:00+00:00", user_id=OTHER),
            _row(3, "2026-10-01T12:00:00+00:00", user_id=OTHER),
        ]
    )
    for view in ("all", "unread"):
        res = _get(client, view=view)
        assert _ids(res) == [_id(1)]
        assert res.json()["unread_count"] == 1


# ----------------------------------------------------------------------------- the names


def test_a_row_carries_its_class_team_actor_and_count(client, db):
    db.rows("notifications").append(
        _row(
            1,
            "2026-11-24T12:00:00+00:00",
            title="Sam Okafor asked to join Trailhead",
            body="Sam Okafor requested to join Trailhead.",
            class_id=CLASS,
            project_id=TEAM,
            actor_id=SAM,
        )
    )
    assert _get(client).json() == {
        "notifications": [
            {
                "id": _id(1),
                "type": "join_request",
                "title": "Sam Okafor asked to join Trailhead",
                "body": "Sam Okafor requested to join Trailhead.",
                "entity_type": "project",
                "entity_id": TEAM,
                "read_at": None,
                "created_at": "2026-11-24T12:00:00+00:00",
                "class": {"id": CLASS, "name": "CSE 115A"},
                "team": {"id": TEAM, "name": "Trailhead"},
                "actor": {
                    "id": SAM,
                    "name": "Sam Okafor",
                    "image_url": "https://img.example/sam.png",
                },
                "conversation": None,
                "message_count": 1,
            }
        ],
        "unread_count": 1,
        "next_cursor": None,
    }


def test_a_message_carries_its_conversation(client, db):
    db.rows("notifications").extend(
        [
            _message(1, DM, "2026-11-24T12:00:00+00:00", actor_id=SAM, message_count=3),
            _message(2, TEAM_TA, "2026-11-24T11:00:00+00:00", class_id=CLASS, project_id=TEAM),
            _message(3, TEAM_ALL, "2026-11-24T10:00:00+00:00", class_id=CLASS, project_id=TEAM),
            _message(4, TEAM_INSTR, "2026-11-24T09:00:00+00:00", class_id=CLASS, project_id=TEAM),
            _message(5, "c0a70000-0000-4000-8000-0000000000ff", "2026-11-24T08:00:00+00:00"),
        ]
    )
    rows = _get(client).json()["notifications"]
    assert [(r["conversation"], r["message_count"]) for r in rows] == [
        ({"id": DM, "kind": "direct", "name": ""}, 3),
        ({"id": TEAM_TA, "kind": "team", "name": "Trailhead · TAs"}, 1),
        ({"id": TEAM_ALL, "kind": "team", "name": "Trailhead"}, 1),
        ({"id": TEAM_INSTR, "kind": "team", "name": "Trailhead · Instructor"}, 1),
        (None, 1),  # a conversation deleted since
    ]


def test_a_deleted_class_team_or_actor_reads_as_null(client, db):
    """The foreign keys set a deleted class's, team's or account's id NULL on the row."""
    db.rows("notifications").append(
        _row(1, "2026-11-24T12:00:00+00:00", class_id=None, project_id=None, actor_id=None)
    )
    [row] = _get(client).json()["notifications"]
    assert (row["class"], row["team"], row["actor"], row["title"]) == (None, None, None, "title 1")


def test_an_actor_with_no_name_is_not_named_by_their_email(client, db):
    db.rows("notifications").append(_row(1, "2026-11-24T12:00:00+00:00", actor_id=NONAME))
    res = _get(client)
    [row] = res.json()["notifications"]
    assert row["actor"] == {"id": NONAME, "name": "", "image_url": None}
    assert "@" not in res.text


def test_a_row_written_before_the_columns_counts_one(client, db):
    db.rows("notifications").append(_message(1, DM, "2026-11-24T12:00:00+00:00"))
    [row] = _get(client).json()["notifications"]
    assert row["message_count"] == 1


# -------------------------------------------------------------------------------- paging


def test_pages_do_not_repeat_or_skip_rows_that_share_an_instant(client, db):
    instant = "2026-11-24T12:00:00+00:00"
    db.rows("notifications").extend(_row(n, instant) for n in range(1, 6))
    db.rows("notifications").append(_row(6, "2026-11-24T11:00:00+00:00"))  # older than all five

    pages, cursor = [], None
    while True:
        params = {"limit": 2, **({"cursor": cursor} if cursor else {})}
        body = _get(client, **params).json()
        pages.append([n["id"] for n in body["notifications"]])
        cursor = body["next_cursor"]
        if cursor is None:
            break
    assert pages == [[_id(5), _id(4)], [_id(3), _id(2)], [_id(1), _id(6)]]


def test_the_last_page_has_no_cursor(client, db):
    db.rows("notifications").extend(_row(n, f"2026-11-24T1{n}:00:00+00:00") for n in range(1, 4))
    first = _get(client, limit=2).json()
    assert [n["id"] for n in first["notifications"]] == [_id(3), _id(2)]
    assert first["next_cursor"] is not None
    last = _get(client, limit=2, cursor=first["next_cursor"]).json()
    assert ([n["id"] for n in last["notifications"]], last["next_cursor"]) == ([_id(1)], None)
    exact = _get(client, limit=3).json()
    assert (len(exact["notifications"]), exact["next_cursor"]) == (3, None)


def _b64(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode()).decode().rstrip("=")


@pytest.mark.parametrize(
    "cursor",
    [
        "x",
        "bm9wZQ",  # "nope"
        "",
        _b64("yesterday|" + _id(1)),
        _b64("2026-11-24T12:00:00+00:00|not-a-uuid"),
        _b64("2026-11-24T12:00:00|" + _id(1)),  # no zone: which instant?
        _b64("2026-11-24T12:00:00+00:00|" + _id(1) + "|extra"),
        _b64('2026-11-24T12:00:00+00:00",id.gt.(|' + _id(1)),
    ],
)
def test_a_malformed_cursor_is_422_before_any_request(client, db, cursor):
    res = _get(client, cursor=cursor)
    assert (res.status_code, res.json()["detail"]) == (422, "Invalid cursor")
    assert db.executes == 0


@pytest.mark.parametrize("limit", [0, 101])
def test_the_limit_is_bounded(client, db, limit):
    assert _get(client, limit=limit).status_code == 422


def test_a_cursor_reads_round_trip():
    cursor = notifications._encode_cursor("2026-11-24T12:00:00.123456+00:00", _id(7))
    assert notifications._decode_cursor(cursor) == ("2026-11-24T12:00:00.123456+00:00", _id(7))


# --------------------------------------------------------------------------- round trips


def test_the_list_costs_the_reminders_the_page_and_the_count_and_one_more_for_messages(db):
    db.rows("notifications").append(_row(1, "2026-11-24T12:00:00+00:00"))
    notifications.list_notifications(ME)
    # ME's profile and its reminder's cleanup, the classes ME owns, then the page and the count.
    assert db.executes == 5

    db.rows("notifications").append(_message(2, DM, "2026-11-24T13:00:00+00:00"))
    db.reset_counter()
    notifications.list_notifications(ME)
    assert db.executes == 6  # and the page's conversations
    assert [q["table"] for q in db.queries][-1] == "conversations"


# ------------------------------------------------------------ what a cursor writes into a filter


def _cursor_terms(db) -> list:
    """The cursor's terms in the page read, as the fake recorded the ``or`` filter."""
    [terms] = [
        f[1]
        for q in db.queries
        if q["table"] == "notifications" and q["op"] == "select"
        for f in q["filters"]
        if f[0] == "or"
    ]
    return terms


@pytest.mark.parametrize(
    ("stamp", "utc"),
    [
        ("2026-11-24T12:00:00+23:59", "2026-11-23T12:01:00+00:00"),  # the widest offset there is
        ("2026-11-24T12:00:00+00:00:30", "2026-11-24T11:59:30+00:00"),  # an offset with seconds
        ("2026-11-24T04:00:00-08:00", "2026-11-24T12:00:00+00:00"),
    ],
)
def test_a_cursors_instant_reaches_the_filter_in_utc(client, db, stamp, utc):
    res = _get(client, cursor=_b64(f"{stamp}|{_id(1)}"))
    assert res.status_code == 200, res.text
    assert _cursor_terms(db) == [
        ("created_at", "lt", utc),
        ("and", [("created_at", "eq", utc), ("id", "lt", _id(1))]),
    ]


@pytest.mark.parametrize("stamp", ["0001-01-01T00:00:00+23:59", "9999-12-31T23:59:59-23:59"])
def test_a_cursors_instant_with_no_utc_equivalent_is_422(client, db, stamp):
    res = _get(client, cursor=_b64(f"{stamp}|{_id(1)}"))
    assert (res.status_code, res.json()["detail"]) == (422, "Invalid cursor")
    assert db.executes == 0


@pytest.mark.parametrize(
    "spelling",
    ["{" + _id(1) + "}", "urn:uuid:" + _id(1), _id(1).replace("-", ""), _id(1).upper()],
    ids=["braces", "urn", "no hyphens", "upper case"],
)
def test_a_cursors_id_reaches_the_filter_in_its_canonical_form(client, db, spelling):
    """Any spelling Python reads as a UUID is accepted on purpose, and the filter only ever
    sees the canonical one."""
    res = _get(client, cursor=_b64(f"2026-11-24T12:00:00+00:00|{spelling}"))
    assert res.status_code == 200, res.text
    assert _cursor_terms(db)[1] == (
        "and",
        [("created_at", "eq", "2026-11-24T12:00:00+00:00"), ("id", "lt", _id(1))],
    )


def test_a_later_page_runs_no_reminders(db):
    """The reminders are written for the first page; a later one is the page and the count."""
    db.rows("notifications").extend(_row(n, f"2026-11-24T1{n}:00:00+00:00") for n in range(1, 4))
    first = notifications.list_notifications(ME, limit=2)
    db.reset_counter()
    notifications.list_notifications(ME, limit=2, cursor=first["next_cursor"])
    assert db.executes == 2
    assert {(q["table"], q["op"]) for q in db.queries} == {("notifications", "select")}
