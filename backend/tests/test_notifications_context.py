"""Each notification records its class, team and actor, and a conversation's row counts its messages.

Every ``notify_*`` writes the ids its notice is about (``class_id``, ``project_id``,
``actor_id``), so the list can name them on read. A new message rewrites its conversation's one
unread row with the latest sender and text and counts on it (``message_count``); once the row is
read, the next message starts a new row at 1. Titles say what happened, with the actor's display
name or "Someone", never an email. A writer that fails never raises to the request behind it.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import pytest

from app.notifications import controller as notifications
from tests.fake_supabase import FakeSupabase

CLASS = "c1a55000-0000-4000-8000-000000000001"
TEAM = "7ea30000-0000-4000-8000-000000000001"
CONV = "c0a70000-0000-4000-8000-000000000001"
DM = "c0a70000-0000-4000-8000-000000000002"
DOC = "d0c00000-0000-4000-8000-000000000001"
SAM = "5a300000-0000-4000-8000-000000000001"  # has a name
NONAME = "5a300000-0000-4000-8000-000000000002"  # only an email
DIEGO = "5a300000-0000-4000-8000-000000000003"
OWNER = "5a300000-0000-4000-8000-000000000004"
INSTR = "5a300000-0000-4000-8000-000000000005"
TA = "5a300000-0000-4000-8000-000000000006"

KEYS = ("type", "title", "class_id", "project_id", "actor_id")


def _install(monkeypatch, **tables) -> FakeSupabase:
    tables.setdefault("notifications", [])
    tables.setdefault(
        "profiles",
        [
            {"id": SAM, "first_name": "Sam", "last_name": "Okafor", "email": "sam@ucsc.edu"},
            {"id": NONAME, "first_name": None, "last_name": None, "email": "anon@ucsc.edu"},
            {"id": DIEGO, "first_name": "Diego", "last_name": "Ramos", "email": "d@ucsc.edu"},
        ],
    )
    fake = FakeSupabase(relations={("projects", "classes"): ("class_id", "id", False)}, **tables)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _only_row(db) -> dict:
    [row] = db.rows("notifications")
    return {key: row.get(key) for key in KEYS}


# --------------------------------------------------------------- what each type stores


def test_a_team_message_records_the_class_the_team_and_the_sender(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_new_message(
        recipient_id=OWNER,
        sender_name="Sam Okafor",
        conversation_id=CONV,
        body="standup at 10",
        sender_id=SAM,
        project_id=TEAM,
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "message",
        "title": "New message from Sam Okafor",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_direct_message_records_only_the_sender(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_new_message(
        recipient_id=OWNER,
        sender_name="Sam Okafor",
        conversation_id=DM,
        body="hi",
        sender_id=SAM,
        project_id=None,
        class_id=None,
    )
    assert _only_row(db) == {
        "type": "message",
        "title": "New message from Sam Okafor",
        "class_id": None,
        "project_id": None,
        "actor_id": SAM,
    }


def test_a_mention_records_the_class_the_team_and_the_author(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_mention(
        recipient_ids=[OWNER],
        author_name="Sam Okafor",
        label="GT-12",
        project_name="Trailhead",
        body_md="can you review?",
        entity_type="scrum_task",
        entity_id=f"{TEAM}:t1",
        author_id=SAM,
        project_id=TEAM,
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "mention",
        "title": "Sam Okafor mentioned you on GT-12",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_join_request_names_the_requester_and_the_team(monkeypatch):
    db = _install(
        monkeypatch,
        project_members=[{"project_id": TEAM, "user_id": OWNER, "role": "product owner"}],
    )
    notifications.notify_join_request(
        project_id=TEAM,
        project_name="Trailhead",
        request_id="r1",
        requester_id=SAM,
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "join_request",
        "title": "Sam Okafor asked to join Trailhead",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_request_nobody_on_the_team_can_review_asks_the_instructor(monkeypatch):
    db = _install(
        monkeypatch,
        project_members=[],
        projects=[{"id": TEAM, "class_id": CLASS, "name": "Trailhead"}],
        classes=[{"id": CLASS, "created_by": INSTR}],
    )
    notifications.notify_join_request(
        project_id=TEAM,
        project_name="Trailhead",
        request_id="r1",
        requester_id=SAM,
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "join_request_unreviewed",
        "title": "Sam Okafor's request to join Trailhead needs your review",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_requester_with_no_name_is_someone_never_their_email(monkeypatch):
    db = _install(
        monkeypatch,
        project_members=[{"project_id": TEAM, "user_id": OWNER, "role": "owner"}],
    )
    notifications.notify_join_request(
        project_id=TEAM,
        project_name="Trailhead",
        request_id="r1",
        requester_id=NONAME,
        class_id=CLASS,
    )
    row = db.rows("notifications")[0]
    assert row["title"] == "Someone asked to join Trailhead"
    assert "@" not in row["title"]


def test_a_declined_request_names_the_team_and_no_actor(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_join_request_rejected(
        requester_id=SAM, project_id=TEAM, project_name="Trailhead", class_id=CLASS
    )
    assert _only_row(db) == {
        "type": "join_rejected",
        "title": "Trailhead declined your request to join",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": None,
    }


def test_a_new_team_names_the_student_who_created_it(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_project_created_by_student(
        instructor_id=INSTR,
        student_id=SAM,
        project_id=TEAM,
        project_name="Trailhead",
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "project_created",
        "title": "Sam Okafor created Trailhead",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_member_who_left_for_another_team_is_filed_as_member_removed(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_member_departure(
        recipient_ids=[OWNER],
        leaver_name="Diego Ramos",
        old_project_id=TEAM,
        old_project_name="Trailhead",
        new_project_name="Night Owls",
        leaver_id=DIEGO,
        class_id=CLASS,
    )
    assert _only_row(db) == {
        "type": "member_removed",
        "title": "Diego Ramos left Trailhead",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": DIEGO,
    }
    assert db.rows("notifications")[0]["body"] == (
        'Diego Ramos has left "Trailhead" to join "Night Owls".'
    )


def test_a_member_with_no_name_who_left_is_someone(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_member_departure(
        recipient_ids=[OWNER],
        leaver_name="",
        old_project_id=TEAM,
        old_project_name="Trailhead",
        new_project_name="Night Owls",
        leaver_id=NONAME,
        class_id=CLASS,
    )
    row = db.rows("notifications")[0]
    assert row["title"] == "Someone left Trailhead"
    assert row["body"] == 'A student has left "Trailhead" to join "Night Owls".'


def test_a_document_handed_in_names_the_team_the_document_and_who_handed_it_in(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_document_finalized(
        recipient_ids=[TA],
        project_name="Night Owls",
        document_title="Sprint 2 report",
        document_id=DOC,
        project_id=TEAM,
        class_id=CLASS,
        finalizer_id=SAM,
    )
    assert _only_row(db) == {
        "type": "document_finalized",
        "title": "Night Owls handed in its Sprint 2 report",
        "class_id": CLASS,
        "project_id": TEAM,
        "actor_id": SAM,
    }


def test_a_late_window_records_its_class_only(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_late_window_opened(
        recipient_ids=[SAM],
        class_id=CLASS,
        assignment_title="TSR 1",
        accept_until=datetime(2027, 1, 12, 8, tzinfo=UTC),
        tz=ZoneInfo("Etc/GMT+8"),
    )
    assert _only_row(db) == {
        "type": "late_window_opened",
        "title": "Late submissions open for TSR 1",
        "class_id": CLASS,
        "project_id": None,
        "actor_id": None,
    }


def test_the_roster_reminder_records_its_class_only(monkeypatch):
    db = _install(monkeypatch, classes=[{"id": CLASS, "name": "CSE 115A", "created_by": INSTR}])
    notifications.ensure_roster_upload_notifications(INSTR)
    assert _only_row(db) == {
        "type": "upload_roster",
        "title": "Upload your class roster",
        "class_id": CLASS,
        "project_id": None,
        "actor_id": None,
    }


def test_an_undeliverable_invite_records_its_class_only(monkeypatch):
    db = _install(monkeypatch)
    notifications.notify_email_undeliverable(
        user_id=INSTR, to_email="x@ucsc.edu", class_id=CLASS, reason="the mail server refused it"
    )
    assert _only_row(db) == {
        "type": "email_undeliverable",
        "title": "An email couldn't be delivered",
        "class_id": CLASS,
        "project_id": None,
        "actor_id": None,
    }


def test_the_profile_reminder_records_nothing_else(monkeypatch):
    db = _install(monkeypatch, profiles=[{"id": SAM, "email": "sam@gmail.com"}], classes=[])
    notifications.ensure_profile_completion_notification(SAM)
    assert _only_row(db) == {
        "type": "complete_profile",
        "title": "Complete your profile",
        "class_id": None,
        "project_id": None,
        "actor_id": None,
    }


def test_ids_are_written_as_text(monkeypatch):
    """A UUID object would not survive the request's JSON encoding, and the notice would be lost."""
    db = _install(monkeypatch)
    notifications.notify_join_request_rejected(
        requester_id=SAM,
        project_id=uuid.UUID(TEAM),
        project_name="Trailhead",
        class_id=uuid.UUID(CLASS),
    )
    row = db.rows("notifications")[0]
    assert (row["project_id"], row["class_id"]) == (TEAM, CLASS)
    assert all(isinstance(row[key], str) for key in ("project_id", "class_id", "entity_id"))


# ------------------------------------------------------------ a conversation's message count


def _message(db_sender: str, text: str) -> None:
    notifications.notify_new_message(
        recipient_id=OWNER,
        sender_name={SAM: "Sam Okafor", DIEGO: "Diego Ramos"}[db_sender],
        conversation_id=CONV,
        body=text,
        sender_id=db_sender,
        project_id=TEAM,
        class_id=CLASS,
    )


def test_a_first_message_counts_one(monkeypatch):
    db = _install(monkeypatch)
    _message(SAM, "hello")
    [row] = db.rows("notifications")
    assert row["message_count"] == 1


def test_a_second_message_before_the_first_is_read_counts_two_on_one_row(monkeypatch):
    db = _install(monkeypatch)
    _message(SAM, "hello")
    _message(DIEGO, "standup at 10")
    [row] = db.rows("notifications")
    assert row["message_count"] == 2
    assert (row["actor_id"], row["title"], row["body"]) == (
        DIEGO,
        "New message from Diego Ramos",
        "standup at 10",
    )


def test_the_same_text_again_still_counts(monkeypatch):
    db = _install(monkeypatch)
    _message(SAM, "ok")
    _message(SAM, "ok")
    [row] = db.rows("notifications")
    assert row["message_count"] == 2


def test_a_message_after_the_row_is_read_starts_a_new_row_at_one(monkeypatch):
    db = _install(monkeypatch)
    _message(SAM, "hello")
    _message(SAM, "again")
    db.rows("notifications")[0]["read_at"] = "2026-11-25T10:00:00+00:00"
    _message(DIEGO, "new day")
    read, unread = sorted(db.rows("notifications"), key=lambda r: r.get("read_at") is None)
    assert (read["message_count"], unread["message_count"]) == (2, 1)
    assert (unread["actor_id"], unread["body"]) == (DIEGO, "new day")


def test_a_row_written_before_the_count_counts_on_from_one(monkeypatch):
    db = _install(
        monkeypatch,
        notifications=[
            {
                "id": "n-old",
                "user_id": OWNER,
                "type": "message",
                "title": "New message from Sam Okafor",
                "body": "hello",
                "entity_type": "conversation",
                "entity_id": CONV,
                "read_at": None,
                "created_at": "2026-11-20T10:00:00+00:00",
            }
        ],
    )
    _message(DIEGO, "standup at 10")
    [row] = db.rows("notifications")
    assert (row["id"], row["message_count"], row["actor_id"]) == ("n-old", 2, DIEGO)


def test_a_message_costs_two_requests_at_most(monkeypatch):
    db = _install(monkeypatch)
    _message(SAM, "hello")  # the read of the unread row, then the insert
    assert db.executes == 2
    db.reset_counter()
    _message(DIEGO, "again")  # the read, then the update
    assert db.executes == 2


# ------------------------------------------------------------------ writers never raise


def _failing_writes(db: FakeSupabase, monkeypatch) -> None:
    real = db.table

    def table(name):
        query = real(name)
        if name == "notifications":

            def fail(*_a, **_k):
                raise RuntimeError("write failed")

            query.insert = fail
            query.update = fail
        return query

    monkeypatch.setattr(db, "table", table)


@pytest.mark.parametrize(
    "write",
    [
        lambda: _message(SAM, "hello"),
        lambda: notifications.notify_join_request_rejected(
            requester_id=SAM, project_id=TEAM, project_name="Trailhead", class_id=CLASS
        ),
        lambda: notifications.notify_member_departure(
            recipient_ids=[OWNER],
            leaver_name="Diego Ramos",
            old_project_id=TEAM,
            old_project_name="Trailhead",
            new_project_name="Night Owls",
            leaver_id=DIEGO,
            class_id=CLASS,
        ),
        lambda: notifications.notify_document_finalized(
            recipient_ids=[TA],
            project_name="Night Owls",
            document_title="Sprint 2 report",
            document_id=DOC,
            project_id=TEAM,
            class_id=CLASS,
            finalizer_id=SAM,
        ),
    ],
    ids=["message", "declined", "departure", "document"],
)
def test_a_writer_that_fails_never_raises(monkeypatch, write):
    db = _install(monkeypatch)
    _failing_writes(db, monkeypatch)
    write()  # never raises
    assert db.rows("notifications") == []
