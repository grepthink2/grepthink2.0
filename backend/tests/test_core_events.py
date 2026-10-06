"""``app.core.events.record``: one insert per event, never raising on a database failure."""

from __future__ import annotations

import logging

import pytest

from app.core import events
from app.core.errors import DatabaseError
from tests.fake_supabase import FakeSupabase


@pytest.fixture
def db(monkeypatch):
    fake = FakeSupabase(events=[])
    monkeypatch.setattr("app.core.db.service_client", fake, raising=False)
    return fake


def _without_id(row: dict) -> dict:
    """``row`` minus the ``id`` that FakeSupabase assigns to every inserted row."""
    return {k: v for k, v in row.items() if k != "id"}


def test_record_inserts_one_row_with_ids_only(db):
    events.record(
        "tsr_submitted", actor_id="s1", class_id="c1", project_id="p1", meta={"assignment_id": "a1"}
    )
    assert [_without_id(r) for r in db.rows("events")] == [
        {
            "kind": "tsr_submitted",
            "actor_id": "s1",
            "class_id": "c1",
            "project_id": "p1",
            "meta": {"assignment_id": "a1"},
        }
    ]
    assert db.executes == 1


def test_record_defaults_scope_to_null_and_meta_to_empty(db):
    events.record("login", actor_id="u1")
    assert [_without_id(r) for r in db.rows("events")] == [
        {"kind": "login", "actor_id": "u1", "class_id": None, "project_id": None, "meta": {}}
    ]


def test_record_refuses_a_kind_the_registry_does_not_know(db):
    with pytest.raises(ValueError):
        events.record("made_up_kind", actor_id="u1")
    assert db.rows("events") == []


class _Failing:
    def table(self, _name):
        raise DatabaseError(operation="write", target="events", pg_code="42P01", pg_message="gone")


def test_record_swallows_a_database_failure(monkeypatch, caplog):
    monkeypatch.setattr("app.core.db.service_client", _Failing(), raising=False)
    with caplog.at_level(logging.WARNING, logger="app.core.events"):
        events.record("login", actor_id="u1")  # must not raise
    assert "could not record login" in caplog.text


def test_every_registered_kind_matches_the_database_check():
    import re

    pattern = re.compile(r"^[a-z][a-z0-9_]{1,39}$")
    assert events.KINDS and all(pattern.match(k) for k in events.KINDS)
