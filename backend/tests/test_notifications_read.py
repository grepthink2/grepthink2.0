"""Marking a notification read, and the list with its unread count.

``POST /api/notifications/{id}/read`` is one update filtered by the id and the owner: a
notification that is gone, or another user's, matches nothing and answers 404, and an id
that is not a UUID is refused (422) before any query. The list and the unread count are
independent reads, run in one wave after the reminders they must see.
"""

from __future__ import annotations

import threading
from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from app.notifications import controller as notifications
from tests.conftest import header_for
from tests.fake_supabase import FakeSupabase

ME, OTHER = "user-me", "user-other"
N1, N2, N3, N4 = (f"00000000-0000-0000-0000-00000000000{i}" for i in range(1, 5))
GONE = "00000000-0000-0000-0000-0000000000ff"


def _notification(nid: str, user_id: str, created_at: str, read_at: str | None = None) -> dict:
    return {
        "id": nid,
        "user_id": user_id,
        "type": "message",
        "title": f"title {nid}",
        "body": f"body {nid}",
        "entity_type": "conversation",
        "entity_id": f"conv-{nid}",
        "read_at": read_at,
        "created_at": created_at,
    }


@pytest.fixture
def db(monkeypatch):
    """ME's profile is complete and ME owns no class, so a list writes no reminder. ME has
    two unread notifications and a read one; OTHER has one, unread."""
    fake = FakeSupabase(
        relations={
            ("notifications", "classes"): ("class_id", "id", False),
            ("notifications", "projects"): ("project_id", "id", False),
            ("notifications", "profiles!notifications_actor_id_fkey"): ("actor_id", "id", False),
        },
        profiles=[
            {
                "id": ME,
                "email": "mia@ucsc.edu",
                "role": "student",
                "first_name": "Mia",
                "last_name": "Ma",
                "edu_email": "mia@ucsc.edu",
            }
        ],
        classes=[],
        notifications=[
            _notification(N1, ME, "2026-10-01T00:00:00+00:00"),
            _notification(N2, ME, "2026-10-03T00:00:00+00:00", "2026-10-04T00:00:00+00:00"),
            _notification(N3, ME, "2026-10-02T00:00:00+00:00"),
            _notification(N4, OTHER, "2026-10-05T00:00:00+00:00"),
        ],
    )
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    # All lists the last 30 days: a day after the newest row, every row is in it.
    monkeypatch.setattr(notifications, "_now", lambda: datetime(2026, 10, 6, tzinfo=UTC))
    return fake


def _read_at(db, nid: str) -> str | None:
    return next(r for r in db.rows("notifications") if r["id"] == nid)["read_at"]


def test_marking_a_notification_read_is_one_update(db, client):
    res = client.post(f"/api/notifications/{N1}/read", headers=header_for("mia@ucsc.edu", sub=ME))
    assert res.status_code == 204
    assert _read_at(db, N1) is not None
    assert [(q["table"], q["op"]) for q in db.queries] == [("notifications", "update")]


def test_marking_an_unknown_notification_read_is_404(db, client):
    res = client.post(f"/api/notifications/{GONE}/read", headers=header_for("mia@ucsc.edu", sub=ME))
    assert (res.status_code, res.json()["detail"]) == (404, "Notification not found")


def test_marking_a_malformed_id_read_is_refused_before_any_query(db, client):
    res = client.post(
        "/api/notifications/not-a-uuid/read", headers=header_for("mia@ucsc.edu", sub=ME)
    )
    assert res.status_code == 422
    assert db.executes == 0


def test_marking_another_users_notification_read_is_404_and_leaves_it_unread(db):
    with pytest.raises(HTTPException) as exc:
        notifications.mark_notification_read(N4, ME)
    assert (exc.value.status_code, exc.value.detail) == (404, "Notification not found")
    assert _read_at(db, N4) is None


def test_the_list_and_unread_count_come_back_with_each_rows_names(db):
    out = notifications.list_notifications(ME)
    assert [n["id"] for n in out["notifications"]] == [N2, N3, N1]  # newest first
    assert set(out["notifications"][0]) == {
        "id",
        "type",
        "title",
        "body",
        "entity_type",
        "entity_id",
        "read_at",
        "created_at",
        "class",
        "team",
        "actor",
        "conversation",
        "message_count",
    }
    assert out["unread_count"] == 2
    # ME's profile and its reminder's cleanup, the classes ME owns, then the list and the count.
    # (These rows' conversation ids are not UUIDs, so there is no conversation to read.)
    assert db.executes == 5


def test_the_list_and_its_unread_count_are_read_in_one_wave(db):
    """Each notifications read waits until the other is in flight too. Read one after the
    other, the first would time out with ``BrokenBarrierError``."""
    barrier = threading.Barrier(2, timeout=1)
    make_query = db.table

    def table(name):
        query = make_query(name)
        if name == "notifications":
            run = query.execute

            def execute():
                if query._op == "select":  # the reminders' cleanup is a delete
                    barrier.wait()
                return run()

            query.execute = execute
        return query

    db.table = table
    assert notifications.list_notifications(ME)["unread_count"] == 2


def test_get_profile_without_a_row_is_empty(db):
    # supabase-py 2.x answers None, not an empty response, when maybe_single() finds no row.
    assert notifications._get_profile("nobody") == {}


# ------------------------------------------------- POST /api/notifications/read: several at once


def _mark(client, ids, *, headers=None):
    return client.post(
        "/api/notifications/read",
        json={"ids": ids},
        headers=headers if headers is not None else header_for("mia@ucsc.edu", sub=ME),
    )


def test_several_of_my_notifications_are_marked_read_in_one_update(db, client):
    res = _mark(client, [N1, N3])
    assert (res.status_code, res.content) == (204, b"")
    assert _read_at(db, N1) is not None and _read_at(db, N3) is not None
    assert [(q["table"], q["op"]) for q in db.queries] == [("notifications", "update")]


def test_a_row_already_read_keeps_when_it_was_read(db, client):
    assert _mark(client, [N2]).status_code == 204
    assert _read_at(db, N2) == "2026-10-04T00:00:00+00:00"


def test_ids_that_are_not_mine_are_ignored_and_the_answer_is_the_same(db, client):
    """Another user's id, or one that matches nothing, answers like the caller's own: the
    answer never says whether a notification exists."""
    mine = _mark(client, [N1])
    theirs = _mark(client, [N4, GONE])
    assert (mine.status_code, mine.content) == (theirs.status_code, theirs.content) == (204, b"")
    assert _read_at(db, N4) is None


@pytest.mark.parametrize(
    "ids",
    [[], ["nope"], [N1] * 101, None, "not-a-list"],
    ids=["empty", "not a uuid", "over 100", "null", "a string"],
)
def test_a_bad_list_is_422_before_any_query(db, client, ids):
    assert _mark(client, ids).status_code == 422
    assert db.executes == 0


def test_a_hundred_is_the_most(db, client):
    assert _mark(client, [N1] * 100).status_code == 204


def test_marking_several_read_needs_a_sign_in(db, client):
    assert _mark(client, [N1], headers={}).status_code == 401
    assert _read_at(db, N1) is None
