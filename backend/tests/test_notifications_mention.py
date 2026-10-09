"""M2 (issue #191): the ``mention`` notification type and ``notify_mention``."""

from __future__ import annotations

from app.notifications import controller as notifications
from tests.fake_supabase import FakeSupabase

ANA = "0f1e2d3c-4b5a-4968-8776-655443322110"
BO = "11111111-2222-4333-8444-555555555555"


def _install(monkeypatch, fake):
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _notify(**overrides):
    kwargs = {
        "recipient_ids": [ANA],
        "author_name": "Tony Wu",
        "label": "GT-12",
        "project_name": "Trailhead",
        "body_md": f"[@Ana](mention:{ANA}) can you review?",
        "entity_type": "scrum_task",
        "entity_id": "p1:t1",
    }
    notifications.notify_mention(**{**kwargs, **overrides})


def test_mention_is_an_allowlisted_type():
    assert "mention" in notifications.NOTIFICATION_TYPES


def test_notify_mention_writes_title_body_and_entity(monkeypatch):
    db = _install(monkeypatch, FakeSupabase(notifications=[]))
    _notify()
    [row] = db.rows("notifications")
    assert row["user_id"] == ANA
    assert row["type"] == "mention"
    assert row["title"] == "Tony Wu mentioned you on GT-12"
    assert row["body"] == "Trailhead: @Ana can you review?"
    assert (row["entity_type"], row["entity_id"]) == ("scrum_task", "p1:t1")


def test_a_long_comment_is_cut_to_about_120_characters(monkeypatch):
    db = _install(monkeypatch, FakeSupabase(notifications=[]))
    _notify(body_md=f"[@Ana](mention:{ANA}) " + "x" * 300)
    [row] = db.rows("notifications")
    preview = row["body"].removeprefix("Trailhead: ")
    assert len(preview) == 120 and preview.startswith("@Ana xxx") and preview.endswith("...")


def test_one_recipient_failing_does_not_stop_the_rest(monkeypatch):
    db = _install(monkeypatch, FakeSupabase(notifications=[]))
    real = db.table

    def table(name):
        query = real(name)
        insert = query.insert

        def insert_once(payload):
            if payload["user_id"] == ANA:
                raise RuntimeError("insert failed")
            return insert(payload)

        query.insert = insert_once
        return query

    monkeypatch.setattr(db, "table", table)
    _notify(recipient_ids=[ANA, BO])  # never raises
    assert [r["user_id"] for r in db.rows("notifications")] == [BO]
