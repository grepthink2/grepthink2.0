"""The ⌘K search index: what each caller may see, where each item opens, and what it costs.

One world, three callers. ``UID`` is a student in Alpha on project P1 with ``S2``; ``TA1`` (no
name on the profile) TAs Alpha; ``INSTR`` teaches it. Beta is another instructor's class with
``S3`` and project P3 — nothing from Beta may reach an Alpha caller. ``NOBODY`` is in no class.
"""

from __future__ import annotations

from app.search import controller
from tests.conftest import make_token
from tests.fake_supabase import FakeSupabase

UID = "30000000-0000-0000-0000-000000000001"
S2 = "30000000-0000-0000-0000-000000000002"
S3 = "30000000-0000-0000-0000-000000000003"
INSTR = "10000000-0000-0000-0000-000000000001"
OTHER_INSTR = "10000000-0000-0000-0000-000000000002"
TA1 = "20000000-0000-0000-0000-000000000001"
NOBODY = "40000000-0000-0000-0000-000000000001"
ALPHA, BETA = "class-alpha", "class-beta"
P1, P2, P3 = "proj-1", "proj-2", "proj-3"
SP1 = "sprint-1"

RELATIONS = {
    ("classes", "profiles!classes_created_by_fkey"): ("created_by", "id", False),
    ("classes", "class_enrollments!class_enrollments_class_id_fkey"): ("id", "class_id", True),
    ("class_enrollments", "profiles!class_enrollments_user_id_fkey"): ("user_id", "id", False),
    ("class_enrollments", "classes!class_enrollments_class_id_fkey"): ("class_id", "id", False),
    ("projects", "project_members"): ("id", "project_id", True),
    ("user_stories", "sprints"): ("sprint_id", "id", False),
}


def profile(uid: str, first: str, last: str, email: str) -> dict:
    return {"id": uid, "first_name": first, "last_name": last, "email": email, "image_url": None}


def story(
    sid: str, key: str, title: str, *, sprint_id, reporter, assignee, points=None, archived=None
):
    return {
        "id": sid,
        "key": key,
        "title": title,
        "points": points,
        "project_id": P1,
        "sprint_id": sprint_id,
        "reporter_id": reporter,
        "assignee_id": assignee,
        "updated_at": "2026-10-05T00:00:00Z",
        "archived_at": archived,
    }


def task(tid: str, key: str, title: str, *, story_id, assignee, reporter, status="todo", **extra):
    return {
        "id": tid,
        "key": key,
        "title": title,
        "status": status,
        "points": extra.get("points"),
        "tags": extra.get("tags", []),
        "project_id": P1,
        "story_id": story_id,
        "assignee_id": assignee,
        "reporter_id": reporter,
        "updated_at": "2026-10-06T00:00:00Z",
    }


def rpc_row(cid: str, kind: str, participants: list[dict], **extra) -> dict:
    """A raw ``messages_inbox`` row, as the Postgres function returns it."""
    return {
        "id": cid,
        "type": kind,
        "project_id": extra.get("project_id"),
        "team_name": extra.get("team_name"),
        "participants": participants,
        "last_message": None,
        "unread_count": extra.get("unread", 0),
        "can_send": True,
        "last_message_at": extra.get("last_message_at"),
    }


def participant(uid: str) -> dict:
    p = PROFILES[uid]
    return {**p, "last_read_at": None}


PROFILES = {
    UID: profile(UID, "Tony", "Wu", "tony@ucsc.edu"),
    S2: profile(S2, "Ashton", "Liu", "aliu@ucsc.edu"),
    S3: profile(S3, "Priya", "Raman", "praman@ucsc.edu"),
    INSTR: profile(INSTR, "Richard", "Jullig", "rjullig@ucsc.edu"),
    OTHER_INSTR: profile(OTHER_INSTR, "Other", "Prof", "other@ucsc.edu"),
    TA1: profile(TA1, "", "", "ta1@ucsc.edu"),
}

INBOX = {
    UID: [
        rpc_row(
            "c-dm",
            "dm",
            [participant(UID), participant(S2)],
            unread=1,
            last_message_at="2026-10-07T17:00:00Z",
        ),
        rpc_row("c-ghost", "dm", [participant(UID)]),  # peer profile gone
        rpc_row(
            "c-team",
            "team_members",
            [participant(UID), participant(S2)],
            project_id=P1,
            team_name="Grepthink 2.0",
            unread=3,
            last_message_at="2026-10-08T17:00:00Z",
        ),
        rpc_row(
            "c-instr",
            "team_instructor",
            [participant(UID), participant(INSTR)],
            project_id=P1,
            team_name="Grepthink 2.0",
        ),
    ],
}


def world() -> FakeSupabase:
    return FakeSupabase(
        relations=RELATIONS,
        rpc={"messages_inbox": lambda params: INBOX.get(params["p_user"], [])},
        profiles=list(PROFILES.values()),
        classes=[
            {
                "id": ALPHA,
                "name": "CSE 115B",
                "term": "Fall",
                "year": 2026.0,
                "description": None,
                "created_by": INSTR,
                "created_at": "2026-09-20T00:00:00Z",
            },
            {
                "id": BETA,
                "name": "CSE 101",
                "term": None,
                "year": None,
                "description": "Algorithms",
                "created_by": OTHER_INSTR,
                "created_at": "2026-09-21T00:00:00Z",
            },
        ],
        class_enrollments=[
            {"id": "e1", "class_id": ALPHA, "user_id": UID, "enrollment_role": "student"},
            {"id": "e2", "class_id": ALPHA, "user_id": S2, "enrollment_role": "student"},
            {"id": "e3", "class_id": ALPHA, "user_id": TA1, "enrollment_role": "ta"},
            {"id": "e4", "class_id": BETA, "user_id": S3, "enrollment_role": "student"},
        ],
        projects=[
            {
                "id": P1,
                "name": "Grepthink 2.0",
                "class_id": ALPHA,
                "created_at": "2026-10-01T00:00:00Z",
            },
            {
                "id": P2,
                "name": "Roster Radar",
                "class_id": ALPHA,
                "created_at": "2026-10-02T00:00:00Z",
            },
            {
                "id": P3,
                "name": "Slug Dining",
                "class_id": BETA,
                "created_at": "2026-10-03T00:00:00Z",
            },
        ],
        project_members=[
            {"id": "m1", "project_id": P1, "user_id": UID},
            {"id": "m2", "project_id": P1, "user_id": S2},
            {"id": "m3", "project_id": P2, "user_id": S2},
            {"id": "m4", "project_id": P3, "user_id": S3},
        ],
        sprints=[{"id": SP1, "name": "Sprint 3", "project_id": P1}],
        user_stories=[
            story(
                "st1",
                "US-4",
                "Instructor imports a roster",
                sprint_id=SP1,
                reporter=S2,
                assignee=UID,
                points=8,
            ),
            story(
                "st2",
                "US-9",
                "Student searches the roster",
                sprint_id=None,
                reporter=UID,
                assignee=None,
                points=5,
            ),
            story("st3", "US-2", "Not my story", sprint_id=SP1, reporter=S2, assignee=S2),
            story(
                "st5",
                "US-5",
                "Export roster as CSV",
                sprint_id=SP1,
                reporter=S2,
                assignee=S2,
                points=3,
            ),  # reached only through task t5
            story(
                "st9",
                "US-1",
                "Old idea",
                sprint_id=None,
                reporter=UID,
                assignee=UID,
                points=1,
                archived="2026-09-01T00:00:00Z",
            ),
        ],
        tasks=[
            task(
                "t1",
                "GT-12",
                "Roster CSV importer rejects UTF-8 BOM",
                story_id="st1",
                assignee=UID,
                reporter=S2,
                status="in_progress",
                points=3,
                tags=["backend", "bug"],
            ),
            task(
                "t2",
                "GT-18",
                "Roster table sticky header",
                story_id="st2",
                assignee=None,
                reporter=UID,
                points=2,
            ),
            task("t3", "GT-7", "Someone else's task", story_id="st3", assignee=S2, reporter=S2),
            task(
                "t4",
                "GT-2",
                "Task of an archived story",
                story_id="st9",
                assignee=UID,
                reporter=UID,
            ),
            task(
                "t5",
                "GT-30",
                "Write the CSV exporter",
                story_id="st5",
                assignee=UID,
                reporter=S2,
                status="done",
                points=1,
                tags=["backend"],
            ),
        ],
        assignments=[
            {
                "id": "a1",
                "Title": "TSR 3",
                "assignment_type": "tsr",
                "status": "publish",
                "close_date": "2026-10-12",
                "class_id": ALPHA,
            },
            {
                "id": "a2",
                "Title": "Peer feedback",
                "assignment_type": "feedback",
                "status": "draft",
                "close_date": None,
                "class_id": ALPHA,
            },
            {
                "id": "a3",
                "Title": "Beta TSR",
                "assignment_type": "tsr",
                "status": "publish",
                "close_date": "2026-10-20",
                "class_id": BETA,
            },
            {
                "id": "a4",
                "Title": "Interest form",
                "assignment_type": "interest_form",
                "status": "publish",
                "close_date": "2026-10-20",
                "class_id": ALPHA,
            },
            {
                "id": "a5",
                "Title": "Survey",
                "assignment_type": None,
                "status": "publish",
                "close_date": None,
                "class_id": ALPHA,
            },
        ],
    )


def index_for(monkeypatch, caller: str) -> tuple[list[dict], FakeSupabase]:
    fake = world()
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return controller.build_index(caller)["items"], fake


def summary(items: list[dict]) -> dict:
    """(type, id) → (title, subtitle, href): the three things every row shows and does."""
    return {(i["type"], i["id"]): (i["title"], i.get("subtitle"), i["href"]) for i in items}


def by_id(items: list[dict], item_id: str) -> dict:
    return next(i for i in items if i["id"] == item_id)


BOARD = f"/app/projects/{P1}/board"

EXPECTED_STUDENT = {
    ("person", S2): ("Ashton Liu", "Student · CSE 115B", "/app/messages/c-dm"),
    ("person", INSTR): (
        "Richard Jullig",
        "Instructor · CSE 115B",
        f"/app/messages/compose?to={INSTR}&name=Richard%20Jullig",
    ),
    ("person", TA1): (
        "ta1@ucsc.edu",
        "TA · CSE 115B",
        f"/app/messages/compose?to={TA1}&name=ta1%40ucsc.edu",
    ),
    ("project", P1): ("Grepthink 2.0", "CSE 115B · 2 members", f"/app/projects/{P1}"),
    ("project", P2): ("Roster Radar", "CSE 115B · 1 member", f"/app/projects/{P2}"),
    ("task", "t1"): (
        "Roster CSV importer rejects UTF-8 BOM",
        "Grepthink 2.0",
        f"{BOARD}?sprint={SP1}&task=t1",
    ),
    ("task", "t2"): (
        "Roster table sticky header",
        "Grepthink 2.0",
        f"{BOARD}?view=backlog&task=t2",
    ),
    ("task", "t5"): ("Write the CSV exporter", "Grepthink 2.0", f"{BOARD}?sprint={SP1}&task=t5"),
    ("story", "st1"): (
        "Instructor imports a roster",
        "Sprint 3 · 8 pts · Grepthink 2.0",
        f"{BOARD}?sprint={SP1}&story=st1",
    ),
    ("story", "st2"): (
        "Student searches the roster",
        "5 pts · Grepthink 2.0",
        f"{BOARD}?view=backlog&story=st2",
    ),
    ("story", "st5"): (
        "Export roster as CSV",
        "Sprint 3 · 3 pts · Grepthink 2.0",
        f"{BOARD}?sprint={SP1}&story=st5",
    ),
    ("conversation", "c-dm"): ("Ashton Liu", "Direct message", "/app/messages/c-dm"),
    ("conversation", "c-ghost"): ("Direct message", "Direct message", "/app/messages/c-ghost"),
    ("conversation", "c-team"): ("Grepthink 2.0", "Team channel", "/app/messages/c-team"),
    ("conversation", "c-instr"): ("Grepthink 2.0", "Instructor channel", "/app/messages/c-instr"),
    ("class", ALPHA): ("CSE 115B", "Fall 2026", "/app/home"),
    ("assignment", "a1"): ("TSR 3", "TSR · due Oct 12", "/app/assignments/a1"),
    ("assignment", "a4"): ("Interest form", "Interest form · due Oct 20", "/app/assignments/a4"),
    ("assignment", "a5"): ("Survey", "Assignment", "/app/assignments/a5"),
}


def test_student_sees_own_work_and_class_only_in_two_waves(monkeypatch):
    items, fake = index_for(monkeypatch, UID)

    assert summary(items) == EXPECTED_STUDENT  # nothing from Beta, no t3/t4, no st3/st9, no a2/a3
    assert by_id(items, S2)["same_project"] is True
    assert by_id(items, INSTR)["same_project"] is False
    assert by_id(items, S2)["keywords"] == ["aliu@ucsc.edu"]
    t1 = by_id(items, "t1")
    assert (t1["status"], t1["tags"], t1["points"], t1["project_id"], t1["updated_at"]) == (
        "in_progress",
        ["backend", "bug"],
        3,
        P1,
        "2026-10-06T00:00:00Z",
    )
    assert by_id(items, "t2")["tags"] is None
    assert by_id(items, "st1")["sprint"] == "Sprint 3"
    assert by_id(items, "c-team")["unread"] == 3
    assert by_id(items, "c-team")["last_message_at"] == "2026-10-08T17:00:00Z"
    assert by_id(items, "a1")["due_at"] == "2026-10-12"
    assert by_id(items, ALPHA)["class_id"] == ALPHA
    assert fake.executes <= 8


def test_route_returns_the_index(client, monkeypatch):
    fake = world()
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    headers = {"Authorization": f"Bearer {make_token(sub=NOBODY)}"}

    res = client.get("/api/search/index", headers=headers)

    assert res.status_code == 200
    body = res.json()
    assert body["items"] == []
    assert isinstance(body["generated_at"], str) and body["generated_at"]
