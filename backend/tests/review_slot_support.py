"""Python twins of the final-review slot functions, shared by the slot tests.

``book_function`` and ``release_function`` are ``book_final_review_slot`` and
``release_final_review_slot``
(backend/database/migrations/2026-10/2026-10-18_final_review_slots.sql) in Python, against a
FakeSupabase's rows, in the same order as the SQL: the early returns, free the team's old slot,
claim, set ``projects.final_review_at``, then drop the Review TA only when an old slot was freed.
A slot is free exactly when its ``project_id`` is None. Register them as
``db.rpcs["book_final_review_slot"]`` and ``db.rpcs["release_final_review_slot"]``.

Both serialise their params first, as supabase-py does before sending them, so a ``UUID`` or a
``datetime`` that reaches ``.rpc()`` raises ``TypeError`` here as it would against PostgREST.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime

from tests.fake_supabase import FakeSupabase

SLOT_TABLE = "final_review_slots"


def _free(slot: dict) -> None:
    slot.update(project_id=None, booked_by=None, booked_at=None)


def _drop_review_ta(db: FakeSupabase, project_id: str) -> None:
    db.rows("project_review_tas")[:] = [
        r for r in db.rows("project_review_tas") if r["project_id"] != project_id
    ]


def book_function(db: FakeSupabase) -> Callable[[dict], str]:
    """``book_final_review_slot(p_slot, p_project, p_actor)`` in Python, against ``db``'s rows."""

    def book(params: dict) -> str:
        json.dumps(params)
        slot_id, project_id = params["p_slot"], params["p_project"]
        project = next((p for p in db.rows("projects") if p["id"] == project_id), None)
        slot = next((s for s in db.rows(SLOT_TABLE) if s["id"] == slot_id), None)
        if project is None or slot is None or slot["class_id"] != project["class_id"]:
            return "not_found"
        if slot["project_id"] == project_id:
            return "booked"
        if slot["project_id"] is not None:
            return "slot_taken"

        freed = [s for s in db.rows(SLOT_TABLE) if s["project_id"] == project_id]
        for old in freed:
            _free(old)
        slot.update(
            project_id=project_id,
            booked_by=params["p_actor"],
            booked_at=datetime.now(UTC).isoformat(),
        )
        project["final_review_at"] = slot["starts_at"]
        if not freed:
            return "booked"
        _drop_review_ta(db, project_id)
        return "moved"

    return book


def release_function(db: FakeSupabase) -> Callable[[dict], bool]:
    """``release_final_review_slot(p_project)`` in Python, against ``db``'s rows."""

    def release(params: dict) -> bool:
        json.dumps(params)
        project_id = params["p_project"]
        freed = [s for s in db.rows(SLOT_TABLE) if s["project_id"] == project_id]
        if not freed:
            return False
        for slot in freed:
            _free(slot)
        for project in db.rows("projects"):
            if project["id"] == project_id:
                project["final_review_at"] = None
        _drop_review_ta(db, project_id)
        return True

    return release
