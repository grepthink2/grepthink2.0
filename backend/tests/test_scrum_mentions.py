"""M3 (issue #191): a scrum comment notifies the team members and staff it @-mentions.

The shared world's staff ids (``instructor-1``…) are not UUIDs, so these tests seed
UUID users of their own into it: a teammate, the instructor, a class TA, the meeting TA,
a student on another team and someone outside the class.
"""

import pytest

from app.scrum import controller
from tests.scrum_support import CLASS, OTHER_PID, PID, UID, profile, scrum_db

ANA = "a0000000-0000-4000-8000-000000000001"  # on the team
INSTR_U = "a0000000-0000-4000-8000-000000000002"  # teaches the class
TA_U = "a0000000-0000-4000-8000-000000000003"  # a TA of the class
MEET_U = "a0000000-0000-4000-8000-000000000004"  # the team's meeting TA
STUDENT_U = "a0000000-0000-4000-8000-000000000005"  # on another team
OUTSIDER_U = "a0000000-0000-4000-8000-000000000006"  # in no class

STORY = {"id": "st1", "project_id": PID, "key": "US-3", "title": "Search"}
TASK = {"id": "t1", "story_id": "st1", "project_id": PID, "key": "GT-12", "status": "todo"}


def _mention(uid: str, name: str = "Someone") -> str:
    return f"[@{name}](mention:{uid})"


def _world(monkeypatch):
    return scrum_db(
        monkeypatch,
        classes=[{"id": CLASS, "created_by": INSTR_U}],
        projects=[
            {"id": PID, "class_id": CLASS, "name": "Trailhead", "assigned_ta_id": MEET_U},
            {"id": OTHER_PID, "class_id": CLASS, "name": "Other team", "assigned_ta_id": None},
        ],
        project_members=[
            {"id": "pm-1", "project_id": PID, "user_id": UID, "role": "owner"},
            {"id": "pm-2", "project_id": PID, "user_id": ANA, "role": "member"},
            {"id": "pm-3", "project_id": OTHER_PID, "user_id": STUDENT_U, "role": "owner"},
        ],
        class_enrollments=[
            {"class_id": CLASS, "user_id": UID, "enrollment_role": "student"},
            {"class_id": CLASS, "user_id": ANA, "enrollment_role": "student"},
            {"class_id": CLASS, "user_id": TA_U, "enrollment_role": "ta"},
            {"class_id": CLASS, "user_id": MEET_U, "enrollment_role": "ta"},
            {"class_id": CLASS, "user_id": STUDENT_U, "enrollment_role": "student"},
        ],
        profiles=[
            profile(UID, "Tony", "Wu"),
            profile(ANA, "Ana"),
            profile(INSTR_U, "Ina"),
            profile(TA_U, "Tara"),
            profile(MEET_U, "Mo"),
            profile(STUDENT_U, "Sam"),
        ],
        user_stories=[dict(STORY)],
        tasks=[dict(TASK)],
        notifications=[],
    )


def _comment(kind: str, body: str, user_id: str = UID) -> dict:
    parent_id = "st1" if kind == "story" else "t1"
    return controller.create_comment(
        parent_kind=kind, parent_id=parent_id, user_id=user_id, body_md=body
    )


def test_a_task_comment_notifies_the_mentioned_teammate(monkeypatch):
    db = _world(monkeypatch)
    body = f"{_mention(ANA, 'Ana')} can you review?"
    out = _comment("task", body)

    assert set(out) == {"id", "author_id", "body_md", "task_id", "author_name"}
    assert (out["body_md"], out["author_name"]) == (body, "Tony Wu")
    [row] = db.rows("notifications")
    assert row["user_id"] == ANA
    assert row["type"] == "mention"
    assert row["title"] == "Tony Wu mentioned you on GT-12"
    assert row["body"] == "Trailhead: @Ana can you review?"
    assert (row["entity_type"], row["entity_id"]) == ("scrum_task", f"{PID}:t1")


def test_a_story_comment_points_at_the_story(monkeypatch):
    db = _world(monkeypatch)
    _comment("story", _mention(ANA))
    [row] = db.rows("notifications")
    assert row["title"] == "Tony Wu mentioned you on US-3"
    assert (row["entity_type"], row["entity_id"]) == ("scrum_story", f"{PID}:st1")


@pytest.mark.parametrize(
    "staff", [INSTR_U, TA_U, MEET_U], ids=["instructor", "class-ta", "meeting-ta"]
)
def test_staff_are_notified(monkeypatch, staff):
    db = _world(monkeypatch)
    _comment("task", _mention(staff))
    assert [r["user_id"] for r in db.rows("notifications")] == [staff]


@pytest.mark.parametrize(
    "nobody", [UID, STUDENT_U, OUTSIDER_U], ids=["author", "other-team", "outsider"]
)
def test_the_author_and_people_off_the_board_are_not_notified(monkeypatch, nobody):
    db = _world(monkeypatch)
    _comment("task", _mention(nobody))
    assert db.rows("notifications") == []


def test_one_comment_notifies_only_the_eligible_mentions_once_each(monkeypatch):
    db = _world(monkeypatch)
    body = " ".join(
        _mention(u) for u in [ANA, ANA, UID, STUDENT_U, OUTSIDER_U, INSTR_U, TA_U, MEET_U]
    )
    _comment("task", body)
    notified = sorted(r["user_id"] for r in db.rows("notifications"))
    assert notified == sorted([ANA, INSTR_U, TA_U, MEET_U])


def test_staff_can_mention_too(monkeypatch):
    db = _world(monkeypatch)
    _comment("task", _mention(ANA), user_id=TA_U)
    [row] = db.rows("notifications")
    assert (row["user_id"], row["title"]) == (ANA, "Tara X mentioned you on GT-12")


def test_an_uppercase_mention_still_reaches_the_teammate(monkeypatch):
    db = _world(monkeypatch)
    _comment("task", _mention(ANA.upper()))
    assert [r["user_id"] for r in db.rows("notifications")] == [ANA]


def test_a_comment_without_mentions_costs_no_extra_round_trips(monkeypatch):
    db = _world(monkeypatch)
    _comment("task", "plain text")
    baseline = db.executes

    db.reset_counter()
    _comment("task", "@Ana typed by hand, no token")
    assert db.executes == baseline
    assert db.rows("notifications") == []


def test_mentioning_only_ineligible_people_skips_the_writes(monkeypatch):
    db = _world(monkeypatch)
    _comment("task", "plain text")
    baseline = db.executes

    db.reset_counter()
    _comment("task", _mention(OUTSIDER_U))
    # project + members + class TAs; no name lookup and no insert for nobody
    assert db.executes == baseline + 3
    assert db.rows("notifications") == []


def test_the_comment_survives_a_failing_notification_insert(monkeypatch):
    db = _world(monkeypatch)
    real = db.table

    def table(name):
        query = real(name)
        if name == "notifications":

            def boom(_payload):
                raise RuntimeError("insert failed")

            query.insert = boom
        return query

    monkeypatch.setattr(db, "table", table)
    out = _comment("task", f"{_mention(ANA)} {_mention(INSTR_U)}")
    assert out["author_name"] == "Tony Wu"
    assert [c["id"] for c in db.rows("scrum_comments")] == [out["id"]]
    assert db.rows("notifications") == []


def test_the_comment_survives_a_failing_recipient_lookup(monkeypatch):
    db = _world(monkeypatch)
    real = db.table

    def table(name):
        if name == "class_enrollments":
            raise RuntimeError("lookup failed")
        return real(name)

    monkeypatch.setattr(db, "table", table)
    out = _comment("task", _mention(INSTR_U) + _mention(TA_U))
    assert [c["id"] for c in db.rows("scrum_comments")] == [out["id"]]
    assert db.rows("notifications") == []
