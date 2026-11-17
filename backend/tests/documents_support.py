"""Shared seed for the project documents tests: the scrum board's world (``tests.scrum_support``) with a
team in every role, and a FakeSupabase that does what the documents migration's functions do.

The world: project ``PID`` as in ``scrum_support``, in class ``CLASS`` (a UUID here, as the class routes
take). ``UID`` is its owner; ``SM``, ``PO``
and ``ADMIN`` hold the other roles that may finalize, ``MEMBER`` holds the plain one and ``NO_ROLE`` none (a
NULL role). ``INSTR``, ``TA`` and ``MEETING_TA`` are staff; ``REVIEW_TA`` is a class TA who is the team's
Review TA. ``STUDENT`` is enrolled on another team and ``OUTSIDER`` in nothing.

``DocumentsFake`` imitates 2026-11-17_project_documents.sql: ``document_create`` (P0002 for a sprint
that is not the project's, 23505 on a second document of a sprint and kind, or a project and kind, 23514
for a kind whose sprint is wrong), ``document_save`` (P0002 for no such document) and
``document_finalize`` (P0002, and 23505 "document changed" unless the revision is the head; it stamps
the snapshot, the time and the finalizer on the revision, and answers None for the finalized revision
again). Its clock is ``deadlines.now_utc``, which the tests pin. What only the database can show (the
locks, the indexes, the CHECKs, pruning) is the migration's rehearsal's to prove.
"""

from __future__ import annotations

import uuid
from datetime import date

from postgrest.exceptions import APIError

from app.assignments import deadlines
from tests.scrum_support import (
    INSTR,
    MEETING_TA,
    OTHER_PID,
    OUTSIDER,
    PID,
    STUDENT,
    TA,
    UID,
    ScrumFake,
    pin_today,
    profile,
)
from tests.scrum_support import RELATIONS as SCRUM_RELATIONS

__all__ = [
    "ADMIN",
    "CLASS",
    "INSTR",
    "MEETING_TA",
    "MEMBER",
    "NO_ROLE",
    "OTHER_PID",
    "OUTSIDER",
    "PID",
    "PO",
    "REVIEW_TA",
    "SM",
    "STUDENT",
    "TA",
    "UID",
    "DocumentsFake",
    "documents_db",
    "pin_today",
    "sprint",
    "story",
    "task",
]

CLASS = "c1000000-0000-4000-8000-000000000001"
SM = "00000000-0000-0000-0000-0000000000a1"
PO = "00000000-0000-0000-0000-0000000000a2"
ADMIN = "00000000-0000-0000-0000-0000000000a3"
MEMBER = "00000000-0000-0000-0000-0000000000a4"
NO_ROLE = "00000000-0000-0000-0000-0000000000a5"
REVIEW_TA = "review-ta-1"

RELATIONS = {
    **SCRUM_RELATIONS,
    ("project_documents", "project_document_revisions"): ("id", "document_id", True),
    ("project_document_revisions", "profiles!project_document_revisions_saved_by_fkey"): (
        "saved_by",
        "id",
        False,
    ),
    ("projects", "project_documents"): ("id", "project_id", True),
    ("project_documents", "sprints"): ("sprint_id", "id", False),
    ("project_documents", "profiles!project_documents_finalized_by_fkey"): (
        "finalized_by",
        "id",
        False,
    ),
}

SPRINT_KINDS = ("sprint_plan", "sprint_report")


def _refusal(code: str, message: str) -> APIError:
    return APIError({"code": code, "message": message, "details": None, "hint": None})


def _now() -> str:
    return deadlines.now_utc().isoformat()


class DocumentsFake(ScrumFake):
    """ScrumFake plus the four functions of the documents migration (see the module docstring)."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.rpcs.update(
            {
                "document_create": self._create,
                "document_save": self._save,
                "document_finalize": self._finalize,
            }
        )

    def _document(self, document_id) -> dict:
        found = next(
            (d for d in self.rows("project_documents") if d["id"] == str(document_id)), None
        )
        if found is None:
            raise _refusal("P0002", "document not found")
        return found

    def _create(self, params: dict) -> str:
        project, kind, sprint_id = params["p_project_id"], params["p_kind"], params["p_sprint_id"]
        if sprint_id is not None and not any(
            s["id"] == sprint_id and s["project_id"] == project for s in self.rows("sprints")
        ):
            raise _refusal("P0002", "sprint not found")
        if (kind in SPRINT_KINDS) != (sprint_id is not None):
            raise _refusal("23514", "project_documents_sprint_shape")
        for d in self.rows("project_documents"):
            same_sprint = sprint_id is not None and d.get("sprint_id") == sprint_id
            same_project = (
                sprint_id is None and d.get("sprint_id") is None and d["project_id"] == project
            )
            if d["kind"] == kind and (same_sprint or same_project):
                raise _refusal("23505", "duplicate key value violates unique constraint")
        document_id, now = str(uuid.uuid4()), _now()
        self.rows("project_documents").append(
            {
                "id": document_id,
                "project_id": project,
                "kind": kind,
                "sprint_id": sprint_id,
                "status": "draft",
                "head_revision": 1,
                "finalized_revision": None,
                "finalized_at": None,
                "finalized_by": None,
                "created_by": params["p_user"],
                "created_at": now,
                "updated_at": now,
            }
        )
        self.rows("project_document_revisions").append(
            {
                "document_id": document_id,
                "number": 1,
                "body": params["p_body"],
                "snapshot": None,
                "source": "seed",
                "saved_by": params["p_user"],
                "saved_at": now,
                "finalized_at": None,
                "finalized_by": None,
            }
        )
        return document_id

    def _save(self, params: dict) -> list[dict]:
        doc = self._document(params["p_document_id"])
        head = doc["head_revision"]
        head_by = next(
            (
                r.get("saved_by")
                for r in self.rows("project_document_revisions")
                if r["document_id"] == doc["id"] and r["number"] == head
            ),
            None,
        )
        now = _now()
        self.rows("project_document_revisions").append(
            {
                "document_id": doc["id"],
                "number": head + 1,
                "body": params["p_body"],
                "snapshot": None,
                "source": params["p_source"],
                "saved_by": params["p_user"],
                "saved_at": now,
                "finalized_at": None,
                "finalized_by": None,
            }
        )
        doc.update(head_revision=head + 1, updated_at=now)
        base = params["p_base"]
        replaced = base is not None and base != head
        return [
            {
                "number": head + 1,
                "overwrote_number": head if replaced else None,
                "overwrote_by": head_by if replaced else None,
            }
        ]

    def _finalize(self, params: dict) -> int | None:
        doc = self._document(params["p_document_id"])
        revision = params["p_revision"]
        if doc["head_revision"] != revision:
            raise _refusal("23505", "document changed")
        if doc.get("finalized_revision") == revision:
            return None
        now = _now()
        for r in self.rows("project_document_revisions"):
            if r["document_id"] == doc["id"] and r["number"] == revision:
                r.update(
                    snapshot=params["p_snapshot"], finalized_at=now, finalized_by=params["p_user"]
                )
        doc.update(
            status="final",
            finalized_revision=revision,
            finalized_at=now,
            finalized_by=params["p_user"],
            updated_at=now,
        )
        return revision


def sprint(sid: str, name: str, starts_at: str, ends_at: str) -> dict:
    return {"id": sid, "project_id": PID, "name": name, "starts_at": starts_at, "ends_at": ends_at}


def story(
    sid: str,
    key: str,
    sprint_id: str | None,
    *,
    rank: int | None = None,
    points: int | None = None,
    criteria: tuple[str, ...] = (),
    title: str | None = None,
    archived: bool = False,
    project_id: str = PID,
) -> dict:
    return {
        "id": sid,
        "project_id": project_id,
        "key": key,
        "title": title or f"Story {key}",
        "sprint_id": sprint_id,
        "points": points,
        "rank": rank,
        "acceptance_criteria": list(criteria),
        "archived_at": "2026-09-01T00:00:00+00:00" if archived else None,
        "reporter_id": UID,
        "created_at": "2026-09-01T00:00:00+00:00",
    }


def task(
    tid: str,
    story_id: str,
    status: str,
    *,
    hours: int | None = None,
    points: int | None = None,
    project_id: str = PID,
) -> dict:
    return {
        "id": tid,
        "story_id": story_id,
        "project_id": project_id,
        "key": f"GT-{tid[-2:]}",
        "title": f"Task {tid[-2:]}",
        "status": status,
        "estimate_hours": hours,
        "points": points,
    }


def documents_db(monkeypatch, **tables) -> DocumentsFake:
    """Install a DocumentsFake seeded with the world above; ``tables`` replace or add tables."""
    seed = {
        "classes": [
            {
                "id": CLASS,
                "created_by": INSTR,
                "institution_id": None,
                "end_date": None,
                "sprint_count": None,
                "sprint_frequency": None,
                "sprints_start_on": None,
            }
        ],
        "projects": [
            {"id": PID, "class_id": CLASS, "name": "Trailhead", "assigned_ta_id": MEETING_TA},
            {"id": OTHER_PID, "class_id": CLASS, "name": "Other team", "assigned_ta_id": None},
        ],
        "project_members": [
            {"id": "pm-1", "project_id": PID, "user_id": UID, "role": "owner"},
            {"id": "pm-2", "project_id": PID, "user_id": SM, "role": "scrum master"},
            {"id": "pm-3", "project_id": PID, "user_id": PO, "role": "product owner"},
            {"id": "pm-4", "project_id": PID, "user_id": ADMIN, "role": "admin"},
            {"id": "pm-5", "project_id": PID, "user_id": MEMBER, "role": "member"},
            {"id": "pm-6", "project_id": PID, "user_id": NO_ROLE, "role": None},
            {"id": "pm-7", "project_id": OTHER_PID, "user_id": STUDENT, "role": "owner"},
        ],
        "class_enrollments": [
            {"class_id": CLASS, "user_id": TA, "enrollment_role": "ta"},
            {"class_id": CLASS, "user_id": REVIEW_TA, "enrollment_role": "ta"},
            {"class_id": CLASS, "user_id": STUDENT, "enrollment_role": "student"},
        ],
        "project_review_tas": [
            {"id": "rt-1", "class_id": CLASS, "project_id": PID, "user_id": REVIEW_TA}
        ],
        "profiles": [
            profile(UID, "Tony", "Wu"),
            profile(SM, "Sam", "Master"),
            profile(PO, "Pat", "Owner"),
            profile(ADMIN, "Ada", "Admin"),
            profile(MEMBER, "Max", "Member"),
            profile(NO_ROLE, "Nia", "None"),
            profile(INSTR, "Ina"),
            profile(TA, "Tara"),
            profile(MEETING_TA, "Mo"),
            profile(REVIEW_TA, "Rey"),
            profile(STUDENT, "Sam"),
        ],
        "sprints": [],
        "user_stories": [],
        "tasks": [],
        "sprint_burnup_days": [],
        "scrum_repos": [],
        "project_documents": [],
        "project_document_revisions": [],
        "notifications": [],
        "email_outbox": [],
        "events": [],
    }
    seed.update(tables)
    fake = DocumentsFake(relations=RELATIONS, **seed)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def new_id() -> str:
    return str(uuid.uuid4())


# ----------------------------------------------------------------- a board to read ----
#
# Sprint 1 (Sep 7-13) holds US-1 (done, with a criterion) and US-2 (one task left). Sprint 2 (Sep 14-27)
# holds US-3 (done, two criteria) and US-4 (no task). The backlog holds US-5 (a criterion). The team has
# one repository, with a token the documents never read.

S1 = "5b000000-0000-4000-8000-000000000001"
S2 = "5b000000-0000-4000-8000-000000000002"
OTHER_SPRINT = "5b000000-0000-4000-8000-0000000000cc"  # a sprint of OTHER_PID
ST1, ST2, ST3, ST4, ST5 = (f"5c000000-0000-4000-8000-00000000000{n}" for n in range(1, 6))
OTHER_STORY = "5c000000-0000-4000-8000-0000000000cc"  # a story of OTHER_PID
REPO = "https://github.com/team/trailhead"
DURING_SPRINT_2 = date(2026, 9, 20)
AFTER_SPRINT_2 = date(2026, 10, 1)

EMPTY_BODIES = {
    "sprint_report": {"stop": [], "start": [], "keep": [], "satisfied_note": ""},
    "release_summary": {"key_story_ids": [], "known_problems": [], "follow_ups": []},
    "test_report": {"scenarios": [], "unit_tests": [], "unit_tests_note": ""},
}


def board_tables() -> dict:
    """The tables of the board above, for ``documents_db(monkeypatch, **board_tables())``."""
    return {
        "sprints": [
            sprint(S1, "Sprint 1", "2026-09-07", "2026-09-13"),
            sprint(S2, "Sprint 2", "2026-09-14", "2026-09-27"),
            {
                **sprint(OTHER_SPRINT, "Sprint 1", "2026-09-07", "2026-09-13"),
                "project_id": OTHER_PID,
            },
        ],
        "user_stories": [
            story(ST1, "US-1", S1, rank=1, points=3, criteria=("Finds a trail by name",)),
            story(ST2, "US-2", S1, rank=2, points=2),
            story(ST3, "US-3", S2, points=5, criteria=("Saves a trail", "Lists saved trails")),
            story(ST4, "US-4", S2),
            story(ST5, "US-5", None, criteria=("Works offline",)),
            story(OTHER_STORY, "US-1", None, project_id=OTHER_PID),
        ],
        "tasks": [
            task("5d000000-0000-4000-8000-000000000001", ST1, "done", hours=4),
            task("5d000000-0000-4000-8000-000000000002", ST2, "done", hours=2),
            task("5d000000-0000-4000-8000-000000000003", ST2, "todo", hours=1),
            task("5d000000-0000-4000-8000-000000000004", ST3, "done", hours=5),
        ],
        "sprint_burnup_days": [
            {
                "sprint_id": S2,
                "day": "2026-09-14",
                "scope_points": 0,
                "completed_points": 0,
                "scope_hours": 5,
                "completed_hours": 0,
            },
            {
                "sprint_id": S2,
                "day": "2026-09-27",
                "scope_points": 0,
                "completed_points": 0,
                "scope_hours": 5,
                "completed_hours": 5,
            },
        ],
        "scrum_repos": [
            {
                "id": "r1",
                "project_id": PID,
                "repo_url": REPO,
                "provider": "github",
                "access_token": "ghp_secret",
                "created_at": "2026-09-01T00:00:00+00:00",
            }
        ],
    }


def add_document(
    db: DocumentsFake,
    kind: str,
    *,
    sprint_id: str | None = None,
    body: dict | None = None,
    saves: int = 0,
    finalize: bool = False,
    snapshot: dict | None = None,
    user: str = UID,
    project_id: str = PID,
) -> str:
    """A document made through the fake's own functions (no round trip counted): created, saved
    ``saves`` more times, and finalized at its head with ``snapshot`` when asked. Its id."""
    body = body if body is not None else EMPTY_BODIES[kind]
    document_id = db.rpcs["document_create"](
        {
            "p_project_id": project_id,
            "p_kind": kind,
            "p_sprint_id": sprint_id,
            "p_body": body,
            "p_user": user,
        }
    )
    for _ in range(saves):
        db.rpcs["document_save"](
            {
                "p_document_id": document_id,
                "p_body": body,
                "p_user": user,
                "p_source": "edit",
                "p_base": None,
            }
        )
    if finalize:
        head = 1 + saves
        db.rpcs["document_finalize"](
            {
                "p_document_id": document_id,
                "p_revision": head,
                "p_snapshot": snapshot if snapshot is not None else {"frozen": True},
                "p_user": user,
            }
        )
    return document_id


def document(db: DocumentsFake, document_id: str) -> dict:
    return next(d for d in db.rows("project_documents") if d["id"] == document_id)


def revisions(db: DocumentsFake, document_id: str) -> list[dict]:
    return sorted(
        (r for r in db.rows("project_document_revisions") if r["document_id"] == document_id),
        key=lambda r: r["number"],
    )


WRITES = {"insert", "update", "upsert", "delete", "rpc"}


def writes(db: DocumentsFake) -> list[dict]:
    """The writes ``db`` saw since its counter was last reset (an rpc counts as one)."""
    return [q for q in db.queries if q["op"] in WRITES]
