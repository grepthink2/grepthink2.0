"""Comments: staff may post, the parent kind picks the column, the mention seam runs,
and authors come back by name."""

import pytest
from fastapi import HTTPException

from app.scrum import controller
from tests.scrum_support import INSTR, OUTSIDER, PID, UID, scrum_db

STORY = {"id": "st1", "project_id": PID, "key": "US-3", "title": "Search"}
TASK = {"id": "t1", "story_id": "st1", "project_id": PID, "key": "GT-12", "status": "todo"}


def _board(monkeypatch):
    return scrum_db(monkeypatch, user_stories=[dict(STORY)], tasks=[dict(TASK)])


def test_staff_can_comment(monkeypatch):
    db = _board(monkeypatch)
    out = controller.create_comment(
        parent_kind="story", parent_id="st1", user_id=INSTR, body_md="hello"
    )
    assert out["author_name"] == "Ina X"
    assert db.rows("scrum_comments")[0]["story_id"] == "st1"


def test_a_task_comment_goes_on_the_task_and_reaches_the_mention_seam(monkeypatch):
    db = _board(monkeypatch)
    seam = []
    monkeypatch.setattr(controller, "_fanout_mentions", lambda client, **kw: seam.append(kw))
    controller.create_comment(parent_kind="task", parent_id="t1", user_id=UID, body_md="hello")

    [stored] = db.rows("scrum_comments")
    assert stored["task_id"] == "t1" and "story_id" not in stored
    [call] = seam
    assert (call["parent_kind"], call["parent_key"]) == ("task", "GT-12")


def test_outsiders_cannot_comment(monkeypatch):
    db = _board(monkeypatch)
    with pytest.raises(HTTPException) as e:
        controller.create_comment(
            parent_kind="story", parent_id="st1", user_id=OUTSIDER, body_md="hi"
        )
    assert e.value.status_code == 403
    assert db.rows("scrum_comments") == []


def test_list_comments_names_each_author(monkeypatch):
    scrum_db(
        monkeypatch,
        user_stories=[dict(STORY)],
        scrum_comments=[
            {"id": "c1", "story_id": "st1", "author_id": UID, "body_md": "a", "created_at": "1"},
            {"id": "c2", "story_id": "st1", "author_id": "gone", "body_md": "b", "created_at": "2"},
        ],
    )
    out = controller.list_comments(parent_kind="story", parent_id="st1", user_id=INSTR)
    assert [(c["id"], c["author_name"]) for c in out] == [("c1", "Tony Wu"), ("c2", "Unknown")]
