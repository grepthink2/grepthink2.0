"""Tests for app.core.db: fan_out, the helper controllers use to run independent
Supabase reads concurrently instead of one after another, and the DatabaseClient's
conversion of ids and instants into values supabase-py can send as JSON."""

from __future__ import annotations

import json
import threading
from datetime import UTC, date, datetime, time
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.core.db import DatabaseClient, fan_out


def test_fan_out_returns_results_by_key():
    assert fan_out({"a": lambda: 1, "b": lambda: 2, "c": lambda: None}) == {
        "a": 1,
        "b": 2,
        "c": None,
    }
    assert fan_out({}) == {}
    assert fan_out({"only": lambda: "inline"}) == {"only": "inline"}


def test_fan_out_propagates_errors():
    def boom():
        raise ValueError("read failed")

    with pytest.raises(ValueError, match="read failed"):
        fan_out({"ok": lambda: 1, "bad": boom})


def test_fan_out_runs_jobs_concurrently_on_the_query_pool():
    barrier = threading.Barrier(2, timeout=5)

    def wait_for_peer():
        barrier.wait()  # only returns if the other job is running at the same time
        return threading.current_thread().name

    names = fan_out({"x": wait_for_peer, "y": wait_for_peer})
    assert all(n.startswith("supabase-query") for n in names.values())


def test_nested_fan_out_runs_inline_instead_of_waiting_on_the_pool():
    """A job that fans out again must not queue behind itself (pool-exhaustion deadlock)."""

    def outer():
        inner = fan_out({"x": lambda: threading.current_thread().name, "y": lambda: 1})
        return threading.current_thread().name, inner["x"]

    outer_thread, inner_thread = fan_out({"o": outer, "p": lambda: 0})["o"]
    assert outer_thread.startswith("supabase-query")
    assert inner_thread == outer_thread


# supabase-py encodes request bodies with json.dumps, which refuses a UUID or a datetime.
# DatabaseClient converts them first, so controllers can pass the values they hold.

ID = UUID("6f1c2b1e-0d4a-4e8b-9a43-0c1d2e3f4a5b")
OTHER_ID = UUID("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")
AT = datetime(2026, 12, 7, 17, 0, tzinfo=UTC)


class _Recorder:
    """Stands in for the supabase-py client and records each builder call."""

    def __init__(self):
        self.calls = []

    def table(self, name):
        return _Builder(self)

    def rpc(self, fn, params=None, *args, **kwargs):
        self.calls.append(("rpc", (fn, params), kwargs))
        return _Builder(self)


class _Builder:
    def __init__(self, recorder):
        self._recorder = recorder

    def _record(self, method, args, kwargs):
        self._recorder.calls.append((method, args, kwargs))
        return self

    def insert(self, *args, **kwargs):
        return self._record("insert", args, kwargs)

    def update(self, *args, **kwargs):
        return self._record("update", args, kwargs)

    def upsert(self, *args, **kwargs):
        return self._record("upsert", args, kwargs)

    def eq(self, *args, **kwargs):
        return self._record("eq", args, kwargs)

    def in_(self, *args, **kwargs):
        return self._record("in_", args, kwargs)

    def execute(self):
        return SimpleNamespace(data=[])


def test_a_request_body_reaches_the_client_as_json():
    recorder = _Recorder()
    DatabaseClient(recorder).table("t").insert(
        {
            "id": ID,
            "at": AT,
            "day": date(2026, 12, 7),
            "start": time(17, 30),
            "ids": [ID, OTHER_ID],
            "nested": {"by": ID},
            "n": 3,
            "ok": True,
            "none": None,
            "text": "kept",
        }
    ).execute()
    method, args, _ = recorder.calls[0]
    assert method == "insert"
    assert args[0] == {
        "id": str(ID),
        "at": "2026-12-07T17:00:00+00:00",
        "day": "2026-12-07",
        "start": "17:30:00",
        "ids": [str(ID), str(OTHER_ID)],
        "nested": {"by": str(ID)},
        "n": 3,
        "ok": True,
        "none": None,
        "text": "kept",
    }
    json.dumps(args[0])  # what supabase-py does next


def test_update_and_upsert_bodies_are_converted_too():
    recorder = _Recorder()
    client = DatabaseClient(recorder)
    client.table("t").update({"booked_at": AT}).eq("id", ID).execute()
    client.table("t").upsert(
        [{"class_id": ID, "starts_at": AT}], on_conflict="class_id,starts_at"
    ).execute()
    assert recorder.calls == [
        ("update", ({"booked_at": AT.isoformat()},), {}),
        ("eq", ("id", str(ID)), {}),
        (
            "upsert",
            ([{"class_id": str(ID), "starts_at": AT.isoformat()}],),
            {"on_conflict": "class_id,starts_at"},
        ),
    ]


def test_filters_take_ids_as_text():
    recorder = _Recorder()
    DatabaseClient(recorder).table("t").in_("id", [ID, OTHER_ID]).execute()
    DatabaseClient(recorder).table("t").in_("id", (ID,)).execute()
    assert recorder.calls == [
        ("in_", ("id", [str(ID), str(OTHER_ID)]), {}),
        ("in_", ("id", (str(ID),)), {}),
    ]


def test_rpc_params_are_converted():
    recorder = _Recorder()
    DatabaseClient(recorder).rpc(
        "book_final_review_slot", {"p_slot": ID, "p_when": AT}, operation="write"
    ).execute()
    assert recorder.calls == [
        ("rpc", ("book_final_review_slot", {"p_slot": str(ID), "p_when": AT.isoformat()}), {})
    ]
