"""The email outbox engine: queue emails as rows, deliver them under a lease, retry with backoff.

Each email is one ``email_outbox`` row (one recipient). Its ``status`` moves:

* ``pending`` -> ``sending`` when a dispatcher leases it: ``claim_email_outbox`` sets
  ``locked_until`` and counts an attempt. A row whose lease runs out (its dispatcher died, or a
  status write failed) is due again.
* ``sending`` -> ``sent``; or back to ``pending`` with a later ``next_attempt_at`` after a
  temporary failure (``BACKOFF_SECONDS``); or ``failed`` (the mail server refused the address,
  the row was tried ``MAX_ATTEMPTS`` times, or it could not be built); or ``skipped`` (the
  address is suppressed, the recipient switched the category off, the email is no longer
  relevant).

Every attempt counts toward ``attempts``, so ``attempts`` names the lease: each write a
dispatcher makes about a row it leased checks both ``status = 'sending'`` and the ``attempts``
it leased the row at. One whose lease ran out, and was taken over, changes nothing.

Two ways in:

* ``dispatch_tick`` runs on a schedule: it lets producers queue scheduled work, then claims due
  rows and delivers them until its time budget is spent.
* A request that queues emails inserts them already leased to itself (``enqueue(owned=True)``)
  and sends them before it answers (``deliver_owned_rows``). What its budget leaves unsent goes
  back to the queue for the dispatcher.

Either way no send starts later than ``SEND_MARGIN_SECONDS`` before its lease runs out, so a
slow send cannot outlive its lease and be sent twice.

Some failures are not about one email: a transport that refuses us (``EmailMisconfiguredError``:
a wrong key or URL, a blocked IP, no provider at all), or a check before sending that cannot read
a shared table (the suppression list or the preferences, for any reason, or a kind's relevance
check during a database outage). Every other row would fail the same way, so the run *pauses*
the whole outbox: the row that met it goes back without spending an attempt, the rows the run
had not tried go back unsent, and every pending row waits at least ``PAUSE_SECONDS``. One error
is logged per pause, and the ticks during it find nothing due. No one is notified and nothing is
given up on: a grants mistake holds emails, it does not lose them.

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

from postgrest.types import CountMethod, ReturnMethod

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
#: How long a claimed (or owned) row stays leased.
LEASE_SECONDS = 300
#: No send starts later than this before its lease runs out: an SMTP send can spend ~90 s in
#: per-operation timeouts, and a send that outlives its lease can be sent twice.
SEND_MARGIN_SECONDS = 120
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
            # Every invite says this until the migration is applied: not a Sentry event each.
            logger.warning("email_outbox: table missing, sending directly")
            raise OutboxUnavailable("email_outbox does not exist yet") from exc
        raise
    return list(result.data or [])


# -- delivering ------------------------------------------------------------------------------


def deliver_owned_rows(client, rows: Sequence[dict], *, budget_seconds: float) -> dict[str, str]:
    """Deliver rows leased to the caller (``enqueue(owned=True)``) while time remains.

    Sends start until the budget is spent or until ``SEND_MARGIN_SECONDS`` before the rows'
    lease runs out, whichever comes first. The rows not attempted go back to the queue
    (``pending``, due now, their attempt uncounted) for the dispatcher. A pause (see the module
    docstring) puts them back due when it ends, with every other pending row. Never raises for a
    single row.

    Returns:
        ``{row_id: "sent" | "queued" | "failed" | "skipped"}``. ``queued``: put back, or a retry
        is scheduled.
    """
    rows = list(rows)
    send_by = min(_monotonic() + budget_seconds, _lease_end(rows) - SEND_MARGIN_SECONDS)
    outcomes, unattempted, paused = _deliver_batch(client, rows, send_by)
    due = _pause_outbox(client) if paused else _now().isoformat()
    if unattempted:
        _put_back(client, unattempted, due=due)
        outcomes.update({str(row["id"]): "queued" for row in unattempted})
    return outcomes


def dispatch_tick(*, budget_seconds: float) -> dict[str, int | bool]:
    """One run of the dispatcher: queue scheduled work, then deliver due rows until time is up.

    First the producers (``_producers``) turn due scheduled jobs into rows, which the same run
    delivers. A producer that fails is logged and skipped; the others and delivery go on. Then
    it claims ``CLAIM_BATCH`` rows at a time while the budget lasts and nothing stops it. The
    sends of a batch start until the budget is spent or until ``SEND_MARGIN_SECONDS`` before the
    batch's lease runs out; its rows not attempted go back unsent. A pause (see the module
    docstring) stops the run (``paused``). ``unavailable`` when the outbox is not migrated yet.
    Never raises for a single row; a claim that fails for another reason is raised.

    Returns:
        Counts: ``expanded`` (scheduled jobs the producers turned into rows, not the rows),
        ``claimed``, ``sent``, ``retried``, ``failed``, ``skipped`` (rows), and the flags
        ``unavailable`` and ``paused``.
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
        claimed_at = _monotonic()  # the lease starts no earlier than the claim does
        rows = _claim(client)
        if rows is None:
            counts["unavailable"] = True
            break
        if not rows:
            break
        counts["claimed"] += len(rows)
        send_by = min(deadline, claimed_at + LEASE_SECONDS - SEND_MARGIN_SECONDS)
        outcomes, unattempted, paused = _deliver_batch(client, rows, send_by)
        for outcome in outcomes.values():
            counts[_COUNTED_AS[outcome]] += 1
        if paused:
            _put_back(client, unattempted, due=_pause_outbox(client))
            counts["paused"] = True
            break
        # Cut short by the budget (the loop ends) or by the lease (the next claim takes them).
        _put_back(client, unattempted, due=None)
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
    how many jobs it turned into rows, and may raise ``OutboxUnavailable``. There is one: the
    scheduled class invites (``app.outbox.invite_jobs``).
    """
    # Imported here, not at the top: invite_jobs imports this module.
    from app.outbox import invite_jobs

    return (invite_jobs.expand_due_invite_jobs,)


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
    client, rows: list[dict], send_by: float
) -> tuple[dict[str, str], list[dict], bool]:
    """Deliver ``rows`` one by one, starting no send at or after ``send_by`` (``_monotonic``).

    Suppressions are read once, for all of them (their cc and bcc too), just before the first
    is attempted. Returns ``(outcomes, rows not attempted, paused)``; ``paused`` when a row found
    that the run must pause, which stops the batch (that row's outcome is "queued").
    """
    outcomes: dict[str, str] = {}
    suppressed: Mapping[str, str] | None = None
    lookup_error: Exception | None = None
    for index, row in enumerate(rows):
        if _monotonic() >= send_by:
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
    """The suppressed addresses among ``rows`` (copies included), or ``({}, why it failed)``."""
    addresses: list[Any] = []
    for row in rows:
        addresses.append(row.get("to_email"))
        addresses.extend(_copies(row))
    try:
        return preferences.suppression_reasons(client, addresses), None
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
    ``lookup_error`` is why that read failed, if it did. Returns "sent", "queued" (a retry is
    scheduled), "failed", "skipped", or ``_PAUSED``.
    """
    if lookup_error is not None:  # first: the pause holds this row too, attempt and all
        return _pause_for_check(client, row, "suppressions", lookup_error)
    kind_name = row.get("kind")
    kind = get_kind(kind_name) if isinstance(kind_name, str) else None
    if kind is None:
        # Perhaps a deploy that knows the kind was just rolled back: retried, given up on later.
        logger.error("email_outbox: unknown kind | kind=%s row=%s", kind_name, row.get("id"))
        return _retry_later(client, row, None, "unknown kind")

    try:
        reason = suppressed.get(preferences.normalize_email(row["to_email"]))
        if reason:
            if _finish(client, row, "skipped", f"suppressed: {reason}"):
                because = _SUPPRESSED_BECAUSE.get(reason, "is suppressed")
                _notify_creator(kind, row, f"the address {because}")
            return "skipped"
        if kind.category:
            try:
                wanted = preferences.is_enabled(client, row.get("user_id"), kind.category)
            except Exception as err:  # a shared table: every row would fail the same way
                return _pause_for_check(client, row, "preferences", err)
            if not wanted:
                _finish(client, row, "skipped", "preference")
                return "skipped"
        if kind.still_relevant is not None:
            try:
                relevant = kind.still_relevant(client, row)
            except DatabaseUnavailableError as err:
                return _pause_for_check(client, row, "relevance", err)
            except Exception as err:  # this kind's problem: this row waits, the others go on
                return _retry_later(client, row, kind, err, exc_info=True)
            if not relevant:
                _finish(client, row, "skipped", "no longer relevant")
                return "skipped"
        message = _message(kind, row, suppressed)
    except Exception as err:
        return _on_error(client, row, kind, err)

    try:
        reference = email_transport.send(message)
    except PermanentEmailError as err:
        # A mistyped address, usually: whoever queued it hears; no developer needs to.
        logger.warning(
            "email_outbox: refused by the mail server | kind=%s row=%s attempts=%s error=%s",
            kind.name,
            row.get("id"),
            _attempts(row),
            err,
        )
        if _finish(client, row, "failed", _error_text(err)):
            _notify_creator(kind, row, "the mail server refused it")
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
        # Recorded whatever happened to the row meanwhile: the email did go out. Writing it
        # again changes nothing, so a failed write is tried once more.
        only_if_sending=False,
        tries=2,
    )
    return "sent"


def _on_error(client, row: Mapping[str, Any], kind: Kind, err: Exception) -> str:
    """What a failure building or sending the email means for the row.

    The caller has handled ``PermanentEmailError``. A misconfigured transport pauses the run; a
    temporary failure schedules a retry; anything else is a bug and fails the row.
    """
    if isinstance(err, EmailMisconfiguredError):
        return _pause_row(
            client, row, err, "email_outbox: transport misconfigured, pausing | error=%s", err
        )
    if isinstance(err, TransientEmailError):
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


def _pause_for_check(client, row: Mapping[str, Any], check: str, err: Exception) -> str:
    """A check before sending (``check``: what it reads) could not be made: pause the run.

    A database error is logged with its code; anything else (a body PostgREST answered that is
    not JSON, say) with its traceback too.
    """
    return _pause_row(
        client,
        row,
        err,
        "email_outbox: cannot check %s, pausing | code=%s error=%s",
        check,
        getattr(err, "pg_code", None),
        err,
        exc_info=None if isinstance(err, DatabaseError) else err,
    )


def _pause_row(
    client,
    row: Mapping[str, Any],
    err: Exception,
    message: str,
    *args: Any,
    exc_info: BaseException | None = None,
) -> str:
    """Stop the run at ``row``: log ``message`` and put the row back due when the pause ends.

    The row spends no attempt: the one its lease counted is taken back. Logged here because the
    run stops here, so it is logged once per run. The caller pauses the rest.
    """
    logger.error(message, *args, exc_info=exc_info)
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


def _retry_later(
    client,
    row: Mapping[str, Any],
    kind: Kind | None,
    error: BaseException | str,
    *,
    exc_info: bool = False,
) -> str:
    """Schedule the next attempt after a temporary failure, or give up after the last one.

    ``exc_info``: log the traceback of ``error`` (a bug, not a delivery problem).
    """
    attempts = _attempts(row)
    traceback = error if exc_info and isinstance(error, BaseException) else None
    if attempts >= MAX_ATTEMPTS:
        logger.error(
            "email_outbox: gave up | kind=%s row=%s attempts=%s error=%s",
            row.get("kind"),
            row.get("id"),
            attempts,
            error,
            exc_info=traceback,
        )
        if _finish(client, row, "failed", _error_text(error)):
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
            "last_error": _error_text(error),
        },
    )
    logger.warning(
        "email_outbox: will retry | kind=%s row=%s attempts=%s retry_in=%ss error=%s",
        row.get("kind"),
        row.get("id"),
        attempts,
        wait,
        error,
        exc_info=traceback,
    )
    return "queued"


def _message(
    kind: Kind, row: Mapping[str, Any], suppressed: Mapping[str, str] | None = None
) -> EmailMessage:
    """Render ``row`` into the message the transport sends.

    An email of a category, to an account, carries unsubscribe links: the page link goes to the
    renderer for the footer, and both links into ``List-Unsubscribe`` (one-click first, which
    ``List-Unsubscribe-Post`` announces when there is one). Copies (cc, bcc) to a ``suppressed``
    address are left out.
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

    cc, bcc = tuple(rendered.cc), tuple(rendered.bcc)
    if suppressed:
        cc = tuple(address for address in cc if not _is_suppressed(address, suppressed))
        bcc = tuple(address for address in bcc if not _is_suppressed(address, suppressed))
        left_out = len(rendered.cc) + len(rendered.bcc) - len(cc) - len(bcc)
        if left_out:
            logger.warning(
                "email_outbox: left suppressed copies out | kind=%s row=%s count=%d",
                kind.name,
                row.get("id"),
                left_out,
            )

    return EmailMessage(
        to=row["to_email"],
        subject=rendered.subject,
        text=rendered.text,
        html=rendered.html,
        cc=cc,
        bcc=bcc,
        headers=headers,
        tags={"kind": kind.name},
        # A row being sent is on attempt 1 at least; each attempt gets its own id.
        reference_id=reference_id_for(row["id"], max(_attempts(row), 1)),
    )


# -- recording -------------------------------------------------------------------------------


def _record(
    client,
    row: Mapping[str, Any],
    fields: Mapping[str, Any],
    *,
    only_if_sending: bool = True,
    tries: int = 1,
) -> int | None:
    """Write ``fields`` (and ``updated_at``) to the row, up to ``tries`` times if the write fails.

    Returns how many rows it changed, or ``None`` when every try failed (logged; never raised:
    the row keeps its lease, so it is tried again once the lease runs out). ``only_if_sending``
    changes the row only while it is still ``sending`` at the ``attempts`` it was leased at, so
    a row someone else finished, cancelled or leased since is left alone (0).
    """
    for attempt in range(1, tries + 1):
        try:
            query = (
                client.table("email_outbox")
                .update(
                    {**fields, "updated_at": _now().isoformat()},
                    count=CountMethod.exact,
                    returning=ReturnMethod.minimal,
                )
                .eq("id", str(row["id"]))
            )
            if only_if_sending:
                query = query.eq("status", "sending").eq("attempts", row.get("attempts"))
            result = query.execute()
        except Exception:
            if attempt < tries:
                logger.warning(
                    "email_outbox: could not record the outcome, trying again | kind=%s row=%s "
                    "status=%s",
                    row.get("kind"),
                    row.get("id"),
                    fields.get("status"),
                    exc_info=True,
                )
                continue
            logger.exception(
                "email_outbox: could not record the outcome | kind=%s row=%s status=%s",
                row.get("kind"),
                row.get("id"),
                fields.get("status"),
            )
            return None
        # PostgREST reports the count in Content-Range. Without one, assume the write applied.
        return result.count if result.count is not None else 1
    return None


def _finish(client, row: Mapping[str, Any], status: str, last_error: str) -> bool:
    """Record a final ``failed`` or ``skipped``. Returns whether it changed the row."""
    return bool(
        _record(client, row, {"status": status, "last_error": last_error, "locked_until": None})
    )


def _pause_outbox(client) -> str:
    """Hold the outbox for ``PAUSE_SECONDS``: no pending row comes due before the pause ends.

    One update (rows due sooner are moved to its end). Returns the time it ends, for the rows
    the caller puts back. Never raises: if the update fails, the next run meets the same error
    and pauses again.
    """
    now = _now()
    until = (now + timedelta(seconds=PAUSE_SECONDS)).isoformat()
    try:
        client.table("email_outbox").update(
            {"next_attempt_at": until, "updated_at": now.isoformat()},
            returning=ReturnMethod.minimal,
        ).eq("status", "pending").lt("next_attempt_at", until).execute()
    except Exception:
        logger.exception("email_outbox: could not hold the pending rows for the pause")
    return until


def _put_back(client, rows: Sequence[Mapping[str, Any]], *, due: str | None) -> None:
    """Return leased rows that were never attempted to the queue, their attempt uncounted.

    ``due`` becomes their ``next_attempt_at`` (``None`` keeps it). One update per distinct
    ``attempts`` (per 100 rows), which it filters on along with ``status``, so a row someone
    else has leased since is left alone; a row that is not ``sending`` was never leased to us and
    is skipped. Never raises: rows it could not put back keep their lease until it runs out.
    """
    now = _now().isoformat()
    by_attempts: dict[Any, list[str]] = {}
    for row in rows:
        if row.get("status") != "sending":
            logger.warning(
                "email_outbox: not putting back a row that was not leased | row=%s status=%s",
                row.get("id"),
                row.get("status"),
            )
            continue
        by_attempts.setdefault(row.get("attempts"), []).append(str(row["id"]))

    for attempts, ids in by_attempts.items():
        fields: dict[str, Any] = {
            "status": "pending",
            "attempts": max(_count(attempts) - 1, 0),
            "locked_until": None,
            "updated_at": now,
        }
        if due is not None:
            fields["next_attempt_at"] = due
        for start in range(0, len(ids), _IDS_PER_UPDATE):
            chunk = ids[start : start + _IDS_PER_UPDATE]
            try:
                client.table("email_outbox").update(fields, returning=ReturnMethod.minimal).in_(
                    "id", chunk
                ).eq("status", "sending").eq("attempts", attempts).execute()
            except Exception:
                logger.exception(
                    "email_outbox: could not put rows back, their lease will run out | rows=%d",
                    len(chunk),
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


def _copies(row: Mapping[str, Any]) -> list[str]:
    """The cc and bcc addresses a row's payload names (custom invites have them)."""
    payload = row.get("payload")
    if not isinstance(payload, Mapping):
        return []
    addresses: list[str] = []
    for key in ("cc", "bcc"):
        value = payload.get(key)
        if isinstance(value, list | tuple):
            addresses.extend(address for address in value if isinstance(address, str))
    return addresses


def _is_suppressed(address: Any, suppressed: Mapping[str, str]) -> bool:
    return isinstance(address, str) and preferences.normalize_email(address) in suppressed


def _lease_end(rows: Sequence[Mapping[str, Any]]) -> float:
    """When the first of the rows' leases runs out, on the ``_monotonic`` clock.

    Read from ``locked_until``; a row without a readable one counts as leased just now.
    """
    now = _now()
    ends = [
        _parse_time(row.get("locked_until")) or now + timedelta(seconds=LEASE_SECONDS)
        for row in rows
    ]
    if not ends:
        return _monotonic() + LEASE_SECONDS
    return _monotonic() + (min(ends) - now).total_seconds()


def _parse_time(value: Any) -> datetime | None:
    """A timestamp as an aware datetime (UTC when it names no zone), or ``None``."""
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None
    return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=UTC)


def _count(value: Any) -> int:
    """A count from the database as an int (0 when it is none, or nothing usable)."""
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _attempts(row: Mapping[str, Any]) -> int:
    """The row's attempt count (0 when it holds none, or nothing usable)."""
    return _count(row.get("attempts"))


def _error_text(error: BaseException | str) -> str:
    return str(error)[:_ERROR_LIMIT]
