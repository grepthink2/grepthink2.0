"""Tests for app.core.db.fan_out — the helper controllers use to run independent
Supabase reads concurrently instead of one after another."""

from __future__ import annotations

import threading

import pytest

from app.core.db import fan_out


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
