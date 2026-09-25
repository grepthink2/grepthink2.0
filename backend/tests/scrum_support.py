"""Shared seed for the scrum board tests: one project, everyone who can reach it, and a
FakeSupabase that does what Postgres does for the scrum tables.

The world: project ``PID`` in class ``CLASS``. ``UID`` is on the team. ``INSTR`` teaches the
class, ``TA`` is one of its TAs and ``MEETING_TA`` runs the team's weekly meeting, so all
three are staff. ``STUDENT`` is enrolled but on another team, and ``OUTSIDER`` is in no
class at all. ``OTHER_PID`` is a second project in the same class.
"""

from __future__ import annotations

from datetime import UTC, datetime

from tests.fake_supabase import FakeSupabase

PID = "00000000-0000-0000-0000-0000000000aa"
OTHER_PID = "00000000-0000-0000-0000-0000000000cc"
UID = "00000000-0000-0000-0000-0000000000bb"
CLASS = "class-1"
INSTR = "instructor-1"
TA = "ta-1"
MEETING_TA = "meeting-ta-1"
STUDENT = "student-1"
OUTSIDER = "outsider-1"

RELATIONS = {("projects", "classes"): ("class_id", "id", False)}


def profile(uid: str, first: str, last: str = "X") -> dict:
    return {
        "id": uid,
        "first_name": first,
        "last_name": last,
        "email": f"{uid}@ucsc.edu",
        "image_url": None,
    }


class ScrumFake(FakeSupabase):
    """FakeSupabase plus what the scrum migration makes Postgres do on a task move
    (2026-08-12_scrum_board.sql): ``task_moves.moved_at`` defaults to now(), and the
    ``scrum_apply_task_move`` BEFORE INSERT trigger copies the task's status into
    ``from_status`` and applies the move to the task. ``scrum_next_key`` hands out
    1, 2, 3… per project and kind, like the counter table behind it.
    """

    def __init__(self, **kwargs):
        counters: dict[tuple[str, str], int] = {}

        def next_key(params: dict) -> int:
            k = (params["p_project_id"], params["p_kind"])
            counters[k] = counters.get(k, 0) + 1
            return counters[k]

        super().__init__(rpc={"scrum_next_key": next_key}, **kwargs)

    def table(self, name):
        query = super().table(name)
        if name != "task_moves":
            return query
        insert = query.insert

        def insert_move(payload):
            now = datetime.now(UTC).isoformat()
            for row in payload if isinstance(payload, list) else [payload]:
                task = next((t for t in self.rows("tasks") if t["id"] == row["task_id"]), None)
                if task is None:  # the trigger raises too
                    raise RuntimeError(f"task {row['task_id']} not found")
                row.setdefault("moved_at", now)
                row["from_status"] = task["status"]
                task.update(
                    status=row["to_status"],
                    moved_by=row.get("moved_by"),
                    moved_at=row["moved_at"],
                    updated_at=row["moved_at"],
                )
            return insert(payload)

        query.insert = insert_move
        return query


def scrum_db(monkeypatch, **tables) -> ScrumFake:
    """Install a ScrumFake seeded with the world above; ``tables`` replace or add tables."""
    seed = {
        "classes": [{"id": CLASS, "created_by": INSTR}],
        "projects": [
            {
                "id": PID,
                "class_id": CLASS,
                "name": "Trailhead",
                "assigned_ta_id": MEETING_TA,
                "estimate_scale": "fibonacci",
            },
            {
                "id": OTHER_PID,
                "class_id": CLASS,
                "name": "Other team",
                "assigned_ta_id": None,
                "estimate_scale": "fibonacci",
            },
        ],
        "project_members": [{"id": "pm-1", "project_id": PID, "user_id": UID, "role": "owner"}],
        "class_enrollments": [
            {"class_id": CLASS, "user_id": TA, "enrollment_role": "ta"},
            {"class_id": CLASS, "user_id": STUDENT, "enrollment_role": "student"},
        ],
        "profiles": [
            profile(UID, "Tony", "Wu"),
            profile(INSTR, "Ina"),
            profile(TA, "Tara"),
            profile(MEETING_TA, "Mo"),
            profile(STUDENT, "Sam"),
        ],
    }
    seed.update(tables)
    fake = ScrumFake(relations=RELATIONS, **seed)
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake
