"""The email outbox engine: queue emails as rows, deliver them under a lease, retry with backoff.

Each email is one ``email_outbox`` row (one recipient). Its ``status`` moves:

* ``pending`` -> ``sending`` when a dispatcher leases it: ``claim_email_outbox`` sets
  ``locked_until`` and counts an attempt. A row whose lease runs out (its dispatcher died, or a
  status write failed) is due again.
* ``sending`` -> ``sent``; or back to ``pending`` with a later ``next_attempt_at`` after a
  temporary failure (``BACKOFF_SECONDS``); or ``failed`` (the address was rejected, the row was
  tried ``MAX_ATTEMPTS`` times, or it could not be built); or ``skipped`` (the address is
  suppressed, the recipient switched the category off, the email is no longer relevant).

Two ways in:

* ``dispatch_tick`` runs on a schedule: it lets producers queue scheduled work, then claims due
  rows and delivers them until its time budget is spent.
* A request that queues emails inserts them already leased to itself (``enqueue(owned=True)``)
  and sends them before it answers (``deliver_owned_rows``). What its budget leaves unsent goes
  back to the queue for the dispatcher.

Some failures are not about one email: a transport that refuses us (``EmailMisconfiguredError``:
a wrong key or URL, a blocked IP, no provider at all), or a check before sending that cannot read
the database (the suppression list, a preference, a kind's relevance check: an outage, a missing
grant). Every other row would fail the same way, so the run *pauses* the whole outbox: the row
that met it goes back without spending an attempt, the rows the run had not tried go back
unsent, and every due row waits ``PAUSE_SECONDS``. One error is logged per pause, and the ticks
during it find nothing due. No one is notified and nothing is given up on: a grants mistake holds
emails, it does not lose them.

Before ``2026-09-30_email_outbox.sql`` is applied there is no table and no claim function:
``enqueue`` raises ``OutboxUnavailable`` so the caller can ``deliver_now`` (send directly, as
before the outbox), and ``dispatch_tick`` reports ``unavailable``.

Logs name the kind, the row id, the attempt and the error, never a subject or a body: those
carry names.
"""

from __future__ import annotations

import logging
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from postgrest.types import ReturnMethod

from app.core.db import MISSING_TABLE_CODES, get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.notifications import controller as notifications
from app.outbox import preferences
from app.outbox.kinds import Kind, RenderContext, get_kind
from app.utils import email_transport
from app.utils.email_transport import (
    EmailDeliveryError,
    EmailMessage,
    EmailMisconfiguredError,
    PermanentEmailError,
    TransientEmailError,
    reference_id_for,
)

logger = logging.getLogger(__name__)

#: Attempts before a row that keeps failing temporarily is given up on.
MAX_ATTEMPTS = 6
#: The wait after a temporary failure of attempt 1, 2, ... 5 (the 6th gives up).
BACKOFF_SECONDS = (60, 300, 1800, 7200, 43200)
#: How long a claimed row stays leased. Longer than any one send can take (an SMTP send can
#: spend ~90 s in per-operation timeouts): a send that outlives its lease is sent twice.
LEASE_SECONDS = 300
#: Rows per claim.
CLAIM_BATCH = 10
#: How long a pause holds the outbox (see the module docstring).
PAUSE_SECONDS = 300
#: The table (PGRST205/42P01) or the claim function (PGRST202/42883) does not exist yet.
OUTBOX_MISSING_CODES = MISSING_TABLE_CODES | {"PGRST202", "42883"}

#: Row ids per update when rows are put back (the ids travel in the query string).
_IDS_PER_UPDATE = 100
#: ``last_error`` is cut to this many characters.
_ERROR_LIMIT = 500
#: The end of "the address ..." for each suppression reason, in a notification.
_SUPPRESSED_BECAUSE = {
    "bounced": "bounced before",
    "rejected": "was rejected before",
    "complained": "reported our email as spam",
}
#: ``_deliver_row``'s answer when the run must pause (see the module docstring). Callers see
#: "queued" for that row.
_PAUSED = "paused"
#: The ``dispatch_tick`` counter each row outcome adds to.
_COUNTED_AS = {"sent": "sent", "queued": "retried", "failed": "failed", "skipped": "skipped"}


class OutboxUnavailable(Exception):
    """The outbox table/function is not there yet (pre-migration)."""


def _now() -> datetime:
    """The current time in UTC. Tests replace it."""
    return datetime.now(UTC)


def _monotonic() -> float:
    """A clock for time budgets. Tests replace it."""
    return time.monotonic()


def _text(value: Any) -> str | None:
    """An id as text (a ``uuid.UUID`` included), or ``None``."""
    return None if value is None else str(value)


@dataclass
class OutboxRow:
    """One email to queue: a ``kind`` of email for one address, and what it renders from."""

    kind: str
    to_email: str
    payload: dict
    user_id: str | None = None
    class_id: str | None = None
    batch_id: str | None = None
    created_by: str | None = None
    dedupe_key: str | None = None
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def as_insert(self, *, owned: bool, now: datetime) -> dict:
        """The row to insert, every column written (a bulk insert needs one shape).

        ``owned`` rows are leased to the caller, which is about to send them: ``sending``, one
        attempt counted, ``locked_until`` a lease from ``now``. Others are ``pending`` and due
        at ``now``.
        """
        stamp = now.isoformat()
        return {
            "id": str(self.id),
            "kind": self.kind,
            "to_email": self.to_email.strip().lower(),
            "payload": dict(self.payload or {}),
            "user_id": _text(self.user_id),
            "class_id": _text(self.class_id),
            "batch_id": _text(self.batch_id),
            "created_by": _text(self.created_by),
            "dedupe_key": self.dedupe_key,
            "status": "sending" if owned else "pending",
            "attempts": 1 if owned else 0,
            "next_attempt_at": stamp,
            "locked_until": (now + timedelta(seconds=LEASE_SECONDS)).isoformat() if owned else None,
            "last_error": None,
            "provider_reference_id": None,
            "sent_at": None,
            "delivered_at": None,
            "created_at": stamp,
            "updated_at": stamp,
        }


# -- queueing --------------------------------------------------------------------------------


def enqueue(client, rows: Sequence[OutboxRow], *, owned: bool = False) -> list[dict]:
    """Insert ``rows`` into the outbox. Returns the rows actually inserted.

    One request. A row whose ``dedupe_key`` is already in the table is skipped, and so is one
    repeating the key of an earlier row in ``rows``; rows without a key are all inserted.
    ``owned=True`` inserts them leased to the caller, for ``deliver_owned_rows``. Nothing to
    insert makes no request.

    Raises:
        OutboxUnavailable: the table does not exist yet (send with ``deliver_now`` instead).
        DatabaseError: any other failure.
    """
    unique: list[OutboxRow] = []
    keys: set[str] = set()
    for row in rows:
        if row.dedupe_key is not None:
            if row.dedupe_key in keys:
                continue
            keys.add(row.dedupe_key)
        unique.append(row)
    if not unique:
        return []

    now = _now()
    try:
        result = (
            client.table("email_outbox")
            .upsert(
                [row.as_insert(owned=owned, now=now) for row in unique],
                on_conflict="dedupe_key",
                ignore_duplicates=True,
            )
            .execute()
        )
    except DatabaseError as exc:
        if exc.pg_code in OUTBOX_MISSING_CODES:
            logger.error("email_outbox: table missing, sending directly")
            raise OutboxUnavailable("email_outbox does not exist yet") from exc
        raise
    return list(result.data or [])


# -- delivering ------------------------------------------------------------------------------


def deliver_owned_rows(client, rows: Sequence[dict], *, budget_seconds: float) -> dict[str, str]:
    """Deliver rows leased to the caller (``enqueue(owned=True)``) while time remains.

    Rows not attempted when the budget runs out go back to the queue (``pending``, due now, no
    attempt counted) for the dispatcher. A pause (see the module docstring) puts them back due
    when it ends, with every other due row. Never raises for a single row.

    Returns:
        ``{row_id: "sent" | "queued" | "failed" | "skipped"}``. ``queued``: put back, or a retry
        is scheduled.
    """
    deadline = _monotonic() + budget_seconds
    outcomes, unattempted, paused = _deliver_batch(client, list(rows), deadline)
    due = _pause_outbox(client) if paused else None
    if unattempted:
        _put_back_owned(client, unattempted, due=due)
        outcomes.update({str(row["id"]): "queued" for row in unattempted})
    return outcomes


def dispatch_tick(*, budget_seconds: float) -> dict[str, int | bool]:
    """One run of the dispatcher: queue scheduled work, then deliver due rows until time is up.

    A producer that fails is logged and skipped; the others and delivery go on. Claims
    ``CLAIM_BATCH`` rows at a time until nothing is due or the budget is spent; claimed rows it
    has no time for go back unsent. A pause (see the module docstring) stops the run
    (``paused``). ``unavailable`` when the outbox is not migrated yet. Never raises for a single
    row; a claim that fails for another reason is raised.

    Returns:
        Counts: ``expanded`` (rows producers queued), ``claimed``, ``sent``, ``retried``,
        ``failed``, ``skipped``, and the flags ``unavailable`` and ``paused``.
    """
    deadline = _monotonic() + budget_seconds
    counts: dict[str, int | bool] = {
        "expanded": 0,
        "claimed": 0,
        "sent": 0,
        "retried": 0,
        "failed": 0,
        "skipped": 0,
        "unavailable": False,
        "paused": False,
    }
    client = get_client()

    for producer in _producers():
        try:
            counts["expanded"] += producer(client, deadline)
        except OutboxUnavailable:
            counts["unavailable"] = True
            return counts
        except Exception:
            # One broken producer must not hold up the others, or the emails already queued.
            logger.exception("email_outbox: producer %s failed", _name_of(producer))

    while _monotonic() < deadline:
        rows = _claim(client)
        if rows is None:
            counts["unavailable"] = True
            break
        if not rows:
            break
        counts["claimed"] += len(rows)
        outcomes, unattempted, paused = _deliver_batch(client, rows, deadline)
        for outcome in outcomes.values():
            counts[_COUNTED_AS[outcome]] += 1
        due = _pause_outbox(client) if paused else None
        for row in unattempted:
            _put_back_claimed(client, row, due=due)
        if paused:
            counts["paused"] = True
        if paused or unattempted:
            break
    return counts


def deliver_now(rows: Sequence[OutboxRow]) -> dict[str, str]:
    """Send ``rows`` directly, for when the outbox does not exist yet (``OutboxUnavailable``).

    Nothing is stored and nothing is retried; no one is notified. Once the transport turns out
    to be misconfigured the remaining rows are not tried: they would fail the same way.

    Returns:
        ``{row.id: "sent" | "failed"}``: failed for any delivery error, an unknown kind, or an
        email that could not be built.
    """
    outcomes: dict[str, str] = {}
    paused = False
    for row in rows:
        row_id = str(row.id)
        if paused:
            outcomes[row_id] = "failed"
            continue
        kind = get_kind(row.kind)
        if kind is None:
            logger.error("email_outbox: unknown kind | kind=%s row=%s", row.kind, row_id)
            outcomes[row_id] = "failed"
            continue
        try:
            email_transport.send(_message(kind, row.as_insert(owned=True, now=_now())))
        except EmailMisconfiguredError as err:
            logger.error("email_outbox: transport misconfigured, pausing | error=%s", err)
            paused = True
            outcomes[row_id] = "failed"
        except EmailDeliveryError as err:
            logger.warning(
                "email_outbox: direct send failed | kind=%s row=%s error=%s", kind.name, row_id, err
            )
            outcomes[row_id] = "failed"
        except Exception:
            logger.exception(
                "email_outbox: direct send failed unexpectedly | kind=%s row=%s", kind.name, row_id
            )
            outcomes[row_id] = "failed"
        else:
            outcomes[row_id] = "sent"
    return outcomes


def _producers() -> tuple[Callable[[Any, float], int], ...]:
    """Jobs that turn scheduled work into outbox rows at the start of each tick.

    Each is called with the client and the tick's deadline on the ``_monotonic`` clock, returns
    how many rows it queued, and may raise ``OutboxUnavailable``.
    """
    return ()


def _claim(client) -> list[dict] | None:
    """Lease up to ``CLAIM_BATCH`` due rows. ``None`` when the outbox is not migrated yet."""
    try:
        result = client.rpc(
            "claim_email_outbox",
            {"p_limit": CLAIM_BATCH, "p_lease_seconds": LEASE_SECONDS},
            operation="write",
        ).execute()
    except DatabaseError as exc:
        if exc.pg_code in OUTBOX_MISSING_CODES:
            logger.warning(
                "email_outbox: not migrated yet, nothing dispatched | pg_code=%s", exc.pg_code
            )
            return None
        raise
    return list(result.data or [])


def _deliver_batch(
    client, rows: list[dict], deadline: float
) -> tuple[dict[str, str], list[dict], bool]:
    """Deliver ``rows`` one by one while time remains.

    Suppressions are read once, for all of them, just before the first is attempted. Returns
    ``(outcomes, rows not attempted, paused)``; ``paused`` when a row found that the run must
    pause, which stops the batch (that row's outcome is "queued").
    """
    outcomes: dict[str, str] = {}
    suppressed: Mapping[str, str] | None = None
    lookup_error: Exception | None = None
    for index, row in enumerate(rows):
        if _monotonic() >= deadline:
            return outcomes, rows[index:], False
        if suppressed is None:
            suppressed, lookup_error = _read_suppressions(client, rows)
        outcome = _deliver_row(client, row, suppressed, lookup_error)
        if outcome == _PAUSED:
            outcomes[str(row["id"])] = "queued"
            return outcomes, rows[index + 1 :], True
        outcomes[str(row["id"])] = outcome
    return outcomes, [], False


def _read_suppressions(client, rows: list[dict]) -> tuple[Mapping[str, str], Exception | None]:
    """The suppressed addresses among ``rows``, or ``({}, error)`` when they could not be read."""
    try:
        return preferences.suppression_reasons(client, [row.get("to_email") for row in rows]), None
    except Exception as err:
        return {}, err


def _deliver_row(
    client,
    row: Mapping[str, Any],
    suppressed: Mapping[str, str],
    lookup_error: Exception | None = None,
) -> str:
    """Deliver one leased row and record what happened. Never raises.

    ``suppressed`` maps suppressed addresses to their reason, read once for the batch;
    ``lookup_error`` is why that read failed, if it did. A database error in a check before
    sending pauses the run. Returns "sent", "queued" (a retry is scheduled), "failed",
    "skipped", or ``_PAUSED``.
    """
    kind: Kind | None = None
    try:
        kind = get_kind(row["kind"])
        if kind is None:
            logger.error("email_outbox: unknown kind | kind=%s row=%s", row.get("kind"), row["id"])
            _finish(client, row, "failed", "unknown kind")
            return "failed"
        if isinstance(lookup_error, DatabaseError):
            return _pause_for_check(client, row, "suppressions", lookup_error)
        if lookup_error is not None:
            return _on_error(client, row, kind, lookup_error)

        reason = suppressed.get(_address(row["to_email"]))
        if reason:
            if _finish(client, row, "skipped", f"suppressed: {reason}"):
                because = _SUPPRESSED_BECAUSE.get(reason, "is suppressed")
                _notify_creator(kind, row, f"the address {because}")
            return "skipped"
        if kind.category:
            try:
                wanted = preferences.is_enabled(client, row.get("user_id"), kind.category)
            except DatabaseError as err:
                return _pause_for_check(client, row, "preferences", err)
            if not wanted:
                _finish(client, row, "skipped", "preference")
                return "skipped"
        if kind.still_relevant is not None:
            try:
                relevant = kind.still_relevant(client, row)
            except DatabaseError as err:
                return _pause_for_check(client, row, "relevance", err)
            if not relevant:
                _finish(client, row, "skipped", "no longer relevant")
                return "skipped"
        message = _message(kind, row)
    except Exception as err:
        return _on_error(client, row, kind, err)

    try:
        reference = email_transport.send(message)
    except PermanentEmailError as err:
        logger.error(
            "email_outbox: gave up | kind=%s row=%s attempts=%s error=%s",
            kind.name,
            row["id"],
            _attempts(row),
            err,
        )
        if _finish(client, row, "failed", _error_text(err)):
            _notify_creator(kind, row, "the address was rejected")
        return "failed"
    except Exception as err:
        return _on_error(client, row, kind, err)

    _record(
        client,
        row,
        {
            "status": "sent",
            "sent_at": _now().isoformat(),
            "provider_reference_id": reference,
            "locked_until": None,
            "last_error": None,
        },
        # Recorded whatever happened to the row meanwhile: the email did go out.
        only_if_sending=False,
    )
    return "sent"


def _on_error(client, row: Mapping[str, Any], kind: Kind | None, err: Exception) -> str:
    """What a failure means for the row (the caller has handled ``PermanentEmailError``).

    A misconfigured transport pauses the run; a temporary failure or a database outage
    schedules a retry; anything else is a bug and fails the row.
    """
    if isinstance(err, EmailMisconfiguredError):
        return _pause_row(
            client, row, err, "email_outbox: transport misconfigured, pausing | error=%s", err
        )
    if isinstance(err, TransientEmailError | DatabaseUnavailableError):
        return _retry_later(client, row, kind, err)
    logger.error(
        "email_outbox: delivery failed unexpectedly | kind=%s row=%s attempts=%s",
        row.get("kind"),
        row.get("id"),
        _attempts(row),
        exc_info=err,
    )
    _finish(client, row, "failed", type(err).__name__)
    return "failed"


def _pause_for_check(client, row: Mapping[str, Any], check: str, err: DatabaseError) -> str:
    """A check before sending (``check``: what it reads) cannot read the database: pause."""
    return _pause_row(
        client,
        row,
        err,
        "email_outbox: cannot check %s, pausing | code=%s error=%s",
        check,
        err.pg_code,
        err,
    )


def _pause_row(client, row: Mapping[str, Any], err: Exception, message: str, *args: Any) -> str:
    """Stop the run at ``row``: log ``message`` and put the row back due when the pause ends.

    The row spends no attempt: the one its lease counted is taken back. Logged here because the
    run stops here, so it is logged once per run. The caller pauses the rest.
    """
    logger.error(message, *args)
    _record(
        client,
        row,
        {
            "status": "pending",
            "attempts": max(_attempts(row) - 1, 0),
            "next_attempt_at": (_now() + timedelta(seconds=PAUSE_SECONDS)).isoformat(),
            "locked_until": None,
            "last_error": _error_text(err),
        },
    )
    return _PAUSED


def _retry_later(client, row: Mapping[str, Any], kind: Kind | None, err: Exception) -> str:
    """Schedule the next attempt after a temporary failure, or give up after the last one."""
    attempts = _attempts(row)
    if attempts >= MAX_ATTEMPTS:
        logger.error(
            "email_outbox: gave up | kind=%s row=%s attempts=%s error=%s",
            row.get("kind"),
            row.get("id"),
            attempts,
            err,
        )
        if _finish(client, row, "failed", _error_text(err)):
            _notify_creator(kind, row, "delivery kept failing")
        return "failed"

    wait = BACKOFF_SECONDS[min(max(attempts, 1), len(BACKOFF_SECONDS)) - 1]
    _record(
        client,
        row,
        {
            "status": "pending",
            "next_attempt_at": (_now() + timedelta(seconds=wait)).isoformat(),
            "locked_until": None,
            "last_error": _error_text(err),
        },
    )
    logger.warning(
        "email_outbox: will retry | kind=%s row=%s attempts=%s retry_in=%ss error=%s",
        row.get("kind"),
        row.get("id"),
        attempts,
        wait,
        err,
    )
    return "queued"


def _message(kind: Kind, row: Mapping[str, Any]) -> EmailMessage:
    """Render ``row`` into the message the transport sends.

    An email of a category, to an account, carries unsubscribe links: the page link goes to the
    renderer for the footer, and both links into ``List-Unsubscribe`` (one-click first, which
    ``List-Unsubscribe-Post`` announces when there is one).
    """
    page_url = one_click_url = None
    user_id = row.get("user_id")
    if kind.category and user_id:
        page_url, one_click_url = preferences.unsubscribe_links(user_id, kind.category)
    rendered = kind.render(row.get("payload") or {}, RenderContext(unsubscribe_url=page_url))

    headers: dict[str, str] = {}
    links = [f"<{url}>" for url in (one_click_url, page_url) if url]
    if links:
        headers["List-Unsubscribe"] = ", ".join(links)
    if one_click_url:
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"

    return EmailMessage(
        to=row["to_email"],
        subject=rendered.subject,
        text=rendered.text,
        html=rendered.html,
        cc=tuple(rendered.cc),
        bcc=tuple(rendered.bcc),
        headers=headers,
        tags={"kind": kind.name},
        # A row being sent is on attempt 1 at least; each attempt gets its own id.
        reference_id=reference_id_for(row["id"], max(_attempts(row), 1)),
    )


# -- recording -------------------------------------------------------------------------------


def _record(
    client, row: Mapping[str, Any], fields: Mapping[str, Any], *, only_if_sending: bool = True
) -> bool:
    """Write ``fields`` (and ``updated_at``) to the row. Returns whether a row was updated.

    Never raises: a failed write is logged and the row keeps its lease, so it is tried again
    once the lease runs out. ``only_if_sending`` leaves alone a row that is no longer
    ``sending`` (someone else finished or cancelled it meanwhile).
    """
    try:
        query = (
            client.table("email_outbox")
            .update({**fields, "updated_at": _now().isoformat()})
            .eq("id", str(row["id"]))
        )
        if only_if_sending:
            query = query.eq("status", "sending")
        result = query.execute()
    except Exception:
        logger.exception(
            "email_outbox: could not record the outcome | kind=%s row=%s status=%s",
            row.get("kind"),
            row.get("id"),
            fields.get("status"),
        )
        return False
    return bool(result.data)


def _finish(client, row: Mapping[str, Any], status: str, last_error: str) -> bool:
    """Record a final ``failed`` or ``skipped``. Returns whether it was recorded."""
    return _record(client, row, {"status": status, "last_error": last_error, "locked_until": None})


def _pause_outbox(client) -> str:
    """Hold the outbox for ``PAUSE_SECONDS``: every pending row that is due waits until then.

    One update. Returns the time the pause ends, for the rows the caller puts back. Never
    raises: if the update fails, the next run meets the same error and pauses again.
    """
    now = _now()
    until = (now + timedelta(seconds=PAUSE_SECONDS)).isoformat()
    try:
        client.table("email_outbox").update(
            {"next_attempt_at": until, "updated_at": now.isoformat()},
            returning=ReturnMethod.minimal,
        ).eq("status", "pending").lte("next_attempt_at", now.isoformat()).execute()
    except Exception:
        logger.exception("email_outbox: could not hold the due rows for the pause")
    return until


def _put_back_owned(client, rows: Sequence[Mapping[str, Any]], *, due: str | None = None) -> None:
    """Return owned rows that were never attempted to the queue, no attempt counted.

    Due ``due`` (the end of a pause), else now. One update (per 100 rows). Never raises: rows
    it could not put back keep their lease, and the dispatcher takes them once it runs out.
    """
    now = _now().isoformat()
    ids = [str(row["id"]) for row in rows]
    for start in range(0, len(ids), _IDS_PER_UPDATE):
        chunk = ids[start : start + _IDS_PER_UPDATE]
        try:
            client.table("email_outbox").update(
                {
                    "status": "pending",
                    "attempts": 0,
                    "locked_until": None,
                    "next_attempt_at": due or now,
                    "updated_at": now,
                },
                returning=ReturnMethod.minimal,
            ).in_("id", chunk).eq("status", "sending").execute()
        except Exception:
            logger.exception(
                "email_outbox: could not put rows back, their lease will run out | rows=%d",
                len(chunk),
            )


def _put_back_claimed(client, row: Mapping[str, Any], *, due: str | None = None) -> None:
    """Return a claimed row that was never attempted, uncounting the attempt the claim counted.

    Due ``due`` (the end of a pause), else when it was due before. Never raises (see
    ``_put_back_owned``).
    """
    fields: dict[str, Any] = {
        "status": "pending",
        "attempts": max(_attempts(row) - 1, 0),
        "locked_until": None,
        "updated_at": _now().isoformat(),
    }
    if due is not None:
        fields["next_attempt_at"] = due
    try:
        client.table("email_outbox").update(fields, returning=ReturnMethod.minimal).eq(
            "id", str(row["id"])
        ).eq("status", "sending").execute()
    except Exception:
        logger.exception(
            "email_outbox: could not put a row back, its lease will run out | row=%s",
            row.get("id"),
        )


def _notify_creator(kind: Kind | None, row: Mapping[str, Any], reason: str) -> None:
    """Tell whoever queued the row that it could not be delivered, if its kind says so."""
    if kind is None or not kind.notify_creator_on_failure:
        return
    try:
        notifications.notify_email_undeliverable(
            user_id=_text(row.get("created_by")),
            to_email=row.get("to_email") or "",
            class_id=_text(row.get("class_id")),
            reason=reason,
        )
    except Exception:
        logger.exception(
            "email_outbox: could not notify | kind=%s row=%s", kind.name, row.get("id")
        )


# -- small helpers ---------------------------------------------------------------------------


def _name_of(producer: Callable[..., Any]) -> str:
    """A producer's name, for the log."""
    return getattr(producer, "__name__", None) or repr(producer)


def _address(email: str | None) -> str:
    """``email`` the way suppressions are stored: trimmed and lower-cased."""
    return (email or "").strip().lower()


def _attempts(row: Mapping[str, Any]) -> int:
    """The row's attempt count (0 when it holds none, or nothing usable)."""
    try:
        return int(row.get("attempts") or 0)
    except (TypeError, ValueError):
        return 0


def _error_text(err: BaseException) -> str:
    return str(err)[:_ERROR_LIMIT]
