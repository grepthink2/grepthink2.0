"""Test doubles for the email outbox, shared by the outbox tests.

* ``Clock``: the outbox's clocks. Patch ``app.outbox.controller._now`` and ``_monotonic`` with
  its methods, and leases, backoff and budgets become exact.
* ``Mailbox``: stands in for ``app.utils.email_transport.send``.
* ``claim_function``: the ``claim_email_outbox`` database function (see
  backend/database/migrations/2026-09-30_email_outbox.sql), in Python, against a FakeSupabase's
  rows. Register it as ``db.rpcs["claim_email_outbox"]``.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from app.utils.email_transport import EmailMessage
from tests.fake_supabase import FakeSupabase

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
START = 1_000.0  # the monotonic clock when a test begins


class Clock:
    """What the outbox reads as the time: a wall clock for timestamps, a monotonic one for budgets."""

    def __init__(self):
        self.wall = NOW
        self.mono = START

    def now(self) -> datetime:
        return self.wall

    def monotonic(self) -> float:
        return self.mono

    def advance(self, seconds: float) -> None:
        self.wall += timedelta(seconds=seconds)
        self.mono += seconds


class Mailbox:
    """Stands in for ``email_transport.send``: records every message and fails on request.

    ``before_send(message)``, when set, runs first. With a ``clock``, each send takes
    ``seconds_per_send`` on it, and ``started`` holds when each began, in seconds from the start
    of the test. A send to an address in ``failures`` raises that error; any other returns
    ``ref-<n>``, n counting the messages sent so far.
    """

    def __init__(self, clock: Clock | None = None):
        self.clock = clock
        self.attempts: list[EmailMessage] = []
        self.sent: list[EmailMessage] = []
        self.started: list[float] = []
        self.failures: dict[str, Exception] = {}
        self.seconds_per_send = 0.0
        self.before_send: Callable[[EmailMessage], Any] | None = None

    def fail(self, address: str, error: Exception) -> None:
        self.failures[address] = error

    def send(self, message: EmailMessage) -> str:
        if self.before_send is not None:
            self.before_send(message)
        self.attempts.append(message)
        if self.clock is not None:
            self.started.append(self.clock.monotonic() - START)
            self.clock.advance(self.seconds_per_send)
        error = self.failures.get(message.to)
        if error is not None:
            raise error
        self.sent.append(message)
        return f"ref-{len(self.sent)}"


def as_datetime(value: Any) -> datetime:
    """A row's timestamp, whether it is stored as ISO text or as a datetime."""
    return datetime.fromisoformat(value) if isinstance(value, str) else value


def claim_function(db: FakeSupabase, clock: Clock) -> Callable[[dict], list[dict]]:
    """``claim_email_outbox(p_limit, p_lease_seconds)`` in Python, against ``db``'s rows."""

    def claim(params: dict) -> list[dict]:
        now = clock.now()
        due = [
            row
            for row in db.rows("email_outbox")
            if (row["status"] == "pending" and as_datetime(row["next_attempt_at"]) <= now)
            or (
                row["status"] == "sending"
                and row["locked_until"] is not None
                and as_datetime(row["locked_until"]) < now
            )
        ]
        due.sort(key=lambda row: as_datetime(row["next_attempt_at"]))
        locked_until = (now + timedelta(seconds=params["p_lease_seconds"])).isoformat()
        claimed = []
        for row in due[: max(params["p_limit"], 0)]:
            row.update(
                status="sending",
                attempts=row["attempts"] + 1,
                locked_until=locked_until,
                updated_at=now.isoformat(),
            )
            claimed.append(dict(row))
        return claimed

    return claim
