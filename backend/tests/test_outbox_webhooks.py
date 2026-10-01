"""The Maileroo webhook (``POST /api/email/webhooks/maileroo``, app.outbox.webhooks).

Maileroo signs each request with the shared secret (hex HMAC-SHA256 of the raw body) and sends an
event that does not get a 200 again (8 times over about 14 hours), so every event must be safe to
handle twice. The events below have the shape Maileroo documents: a ``failed`` event's
``event_data`` holds ``to`` and ``reason``, a ``rejected`` one a list of ``to`` addresses and a
``reject_reason``. Everything runs against FakeSupabase; no request leaves the process.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.config import settings
from app.core.db import get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.limiter import limiter
from app.outbox import controller as outbox
from app.outbox import views, webhooks
from app.outbox.kinds import KINDS, Kind, Rendered
from tests.fake_supabase import FakeSupabase

URL = "/api/email/webhooks/maileroo"
SECRET = "maileroo-webhook-secret-for-tests"

NOW = datetime(2026, 9, 30, 12, 0, tzinfo=UTC)
EVENT_TIME = 1_790_000_000  # 2026-09-21T14:13:20Z, as Maileroo sends it: Unix seconds
REF = "c843204e3af03193bd14f339"  # the reference id the outbox row was sent under
OTHER_REF = "0123456789abcdef01234567"

INSTRUCTOR = "11111111-2222-4333-8444-555555555555"
CLASS = "c1a55000-0000-4000-8000-000000000001"
STUDENT = "student@ucsc.edu"
BOUNCE = "550 5.1.1 <student@ucsc.edu>: no such user"
REJECTED_WHY = "One or more of the recipients are on the suppression list."

TABLES = ("email_outbox", "email_suppressions", "notifications")

#: When the fake's clock says a row was last written, before any event arrives.
SENT_AT = (NOW - timedelta(hours=1)).isoformat()


# -- the database, the clock and the request ------------------------------------------------------


class FailingDb(FakeSupabase):
    """FakeSupabase whose requests for which ``fails(table, op)`` holds raise ``make(...)``."""

    def __init__(self, fails, make, **tables):
        super().__init__(**tables)
        self._fails = fails
        self._make = make

    def table(self, name):
        query = super().table(name)
        execute = query.execute

        def maybe_fail():
            if self._fails(name, query._op):
                raise self._make("read" if query._op == "select" else "write", name)
            return execute()

        query.execute = maybe_fail
        return query


def missing_table(operation, target):
    return DatabaseError(
        operation=operation,
        target=target,
        pg_code="PGRST205",
        pg_message=f"Could not find the table 'public.{target}' in the schema cache",
    )


def outage(operation, target):
    return DatabaseUnavailableError(
        operation=operation,
        target=target,
        pg_code="57014",
        pg_message="canceling statement due to statement timeout",
    )


def denied(operation, target):
    return DatabaseError(
        operation=operation,
        target=target,
        pg_code="42501",
        pg_message=f"permission denied for table {target}",
    )


class Clock:
    def __init__(self):
        self.wall = NOW

    def now(self) -> datetime:
        return self.wall

    def advance(self, seconds: float) -> None:
        self.wall += timedelta(seconds=seconds)


@pytest.fixture(autouse=True)
def _configured(monkeypatch):
    """The webhook is configured, and no rate-limit count is left over from another test."""
    monkeypatch.setattr(settings, "MAILEROO_WEBHOOK_SECRET", SECRET)
    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def clock(monkeypatch) -> Clock:
    clock = Clock()
    monkeypatch.setattr(webhooks, "_now", clock.now)
    return clock


def install(monkeypatch, db: FakeSupabase) -> FakeSupabase:
    monkeypatch.setattr("app.core.db.service_client", db, raising=False)
    return db


def sent_row(to: str = STUDENT, *, ref: str = REF, kind: str = "class_invite", **columns) -> dict:
    """An outbox row Maileroo accepted under ``ref``, queued by the instructor for the class."""
    row = outbox.OutboxRow(
        kind=kind,
        to_email=to,
        payload={},
        class_id=CLASS,
        created_by=INSTRUCTOR,
    ).as_insert(owned=False, now=NOW - timedelta(hours=1))
    row.update(status="sent", attempts=1, provider_reference_id=ref, sent_at=SENT_AT)
    row.update(columns)
    return row


@pytest.fixture
def db(monkeypatch, clock) -> FakeSupabase:
    tables = {name: [] for name in TABLES}
    tables["email_outbox"] = [sent_row()]
    return install(monkeypatch, FakeSupabase(**tables))


def event(event_type: str, *, ref: str | None = REF, event_time=EVENT_TIME, **event_data) -> dict:
    """One event as Maileroo posts it."""
    return {
        "event_id": "5a0b6f8c1d2e3f405a6b7c8d9e0f1a2b",
        "event_type": event_type,
        "event_time": event_time,
        "inserted_at": "2026-09-21T14:13:21Z",
        "message_reference_id": ref,
        "message_id": "<c843204e3af03193bd14f339@maileroo.com>",
        "event_data": event_data,
        "domain_id": 1,
        "tags": None,
        "user_id": 1,
    }


def failed(to=STUDENT, *, reason=BOUNCE, **fields) -> dict:
    return event("failed", to=to, reason=reason, **fields)


def rejected(to=(STUDENT,), *, reason=REJECTED_WHY) -> dict:
    """A rejection as Maileroo documents it: ``to`` (and ``from``) are lists."""
    return event("rejected", to=list(to), reject_reason=reason, **{"from": ["noreply@x.com"]})


def sign(body: bytes, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


_SIGNED = object()


def post(client, payload=None, *, body: bytes | None = None, signature=_SIGNED):
    """POST ``payload`` (as JSON) or ``body`` (raw), signed unless ``signature`` says otherwise."""
    raw = json.dumps(payload).encode() if body is None else body
    headers = {"Content-Type": "application/json"}
    if signature is _SIGNED:
        headers["x-maileroo-signature"] = sign(raw)
    elif signature is not None:
        headers["x-maileroo-signature"] = signature
    return client.post(URL, content=raw, headers=headers)


def outbox_row(db: FakeSupabase, ref: str = REF) -> dict:
    [row] = [row for row in db.rows("email_outbox") if row["provider_reference_id"] == ref]
    return row


def suppressions(db: FakeSupabase) -> dict[str, tuple[str, str | None]]:
    return {row["email"]: (row["reason"], row["detail"]) for row in db.rows("email_suppressions")}


def notes(db: FakeSupabase) -> list[str]:
    return [note["body"] for note in db.rows("notifications")]


# -- verify_signature ----------------------------------------------------------------------------


def test_the_signature_is_the_hex_hmac_sha256_of_the_raw_body():
    body = b'{"event_type": "failed"}'
    assert webhooks.verify_signature(SECRET, body, sign(body))
    # Hex digits in either case, and stray whitespace around them, are the same signature.
    assert webhooks.verify_signature(SECRET, body, f"  {sign(body).upper()}\n")


@pytest.mark.parametrize(
    ("secret", "signature"),
    [
        (SECRET, sign(b'{"event_type": "delivered"}')),  # another body's
        (SECRET, sign(b'{"event_type": "failed"}', "another-secret")),  # another key's
        (SECRET, sign(b'{"event_type": "failed"}')[:-1]),  # cut short
        (SECRET, None),
        (SECRET, ""),
        (SECRET, "é" * 64),  # not ASCII: compare_digest would raise on it
        ("", sign(b'{"event_type": "failed"}', "")),  # no secret configured
    ],
    ids=["other-body", "other-key", "truncated", "none", "empty", "non-ascii", "no-secret"],
)
def test_any_other_signature_is_refused(secret, signature):
    assert webhooks.verify_signature(secret, b'{"event_type": "failed"}', signature) is False


def test_the_signature_is_compared_in_constant_time(monkeypatch):
    # Not observable through behaviour, so pin it: a plain == would leak how much matched.
    compared = []
    real = hmac.compare_digest

    def spy(a, b):
        compared.append((a, b))
        return real(a, b)

    monkeypatch.setattr(hmac, "compare_digest", spy)
    body = b"{}"
    assert webhooks.verify_signature(SECRET, body, sign(body))
    assert compared == [(sign(body), sign(body))]


# -- the request: configuration, signature, body ---------------------------------------------------


def test_without_a_secret_the_webhook_answers_503_so_maileroo_sends_the_event_again(
    client, db, monkeypatch
):
    monkeypatch.setattr(settings, "MAILEROO_WEBHOOK_SECRET", "")
    res = post(client, failed())
    assert res.status_code == 503
    assert res.json() == {"detail": "Webhook not configured"}
    assert suppressions(db) == {}


@pytest.mark.parametrize(
    "signature",
    [None, "0" * 64, sign(b"something else"), sign(json.dumps(failed()).encode(), "wrong")],
    ids=["missing", "zeros", "other-body", "other-key"],
)
def test_a_request_without_a_valid_signature_is_refused_and_changes_nothing(client, db, signature):
    before = [dict(row) for row in db.rows("email_outbox")]
    res = post(client, failed(), signature=signature)
    assert res.status_code == 401
    assert res.json() == {"detail": "Invalid signature"}
    assert db.executes == 0
    assert db.rows("email_outbox") == before


def test_a_tampered_body_is_refused(client, db):
    # Signed for one body, sent with another: the signature covers the raw bytes.
    original = json.dumps(event("delivered")).encode()
    res = post(client, body=json.dumps(failed()).encode(), signature=sign(original))
    assert res.status_code == 401
    assert db.executes == 0


@pytest.mark.parametrize(
    "body", [b"not json", b"", b"\xff\xfe\x00junk"], ids=["text", "empty", "bytes"]
)
def test_a_signed_body_that_is_not_json_is_a_400(client, db, body):
    res = post(client, body=body)
    assert res.status_code == 400
    assert db.executes == 0


def test_the_webhook_is_rate_limited():
    [rule] = limiter._route_limits["app.outbox.views.maileroo_webhook"]
    assert str(rule.limit) == "600 per 1 minute"


# -- the size of the body ---------------------------------------------------------------------


def padded_to(size: int) -> bytes:
    """A delivered event whose JSON is exactly ``size`` bytes."""
    payload = {**event("delivered", to=STUDENT), "padding": ""}
    payload["padding"] = "x" * (size - len(json.dumps(payload).encode()))
    body = json.dumps(payload).encode()
    assert len(body) == size
    return body


def test_the_limit_is_256_kib():
    assert views.MAX_WEBHOOK_BODY == 262_144


def test_a_body_at_the_limit_is_read(client, db):
    assert post(client, body=padded_to(views.MAX_WEBHOOK_BODY)).status_code == 200
    assert outbox_row(db)["delivered_at"] is not None


def test_a_body_declared_over_the_limit_is_refused_before_it_is_read(client, db, monkeypatch):
    checked = []
    monkeypatch.setattr(webhooks, "verify_signature", lambda *args: checked.append(args))

    res = post(client, body=padded_to(views.MAX_WEBHOOK_BODY + 1))

    assert res.status_code == 413
    assert res.json() == {"detail": "The body is too large"}
    assert checked == []  # never got as far as the signature
    assert db.executes == 0


def test_a_body_without_a_length_is_read_up_to_the_limit(client, db):
    # Sent in chunks (Transfer-Encoding: chunked), with no Content-Length to check first.
    for body, status in (
        (padded_to(views.MAX_WEBHOOK_BODY + 1), 413),
        (json.dumps(event("delivered", to=STUDENT)).encode(), 200),
    ):
        res = client.post(
            URL,
            content=iter([body]),
            headers={"Content-Type": "application/json", "x-maileroo-signature": sign(body)},
        )
        assert res.request.headers.get("content-length") is None
        assert res.status_code == status
    assert outbox_row(db)["delivered_at"] is not None


def body_request(headers: list[tuple[bytes, bytes]], pulled: list[int]) -> Request:
    """A request whose body never ends, 100 000 bytes per chunk; ``pulled`` counts the chunks
    read. Past ten chunks the reading is a failure, not an endless loop."""

    async def receive():
        pulled.append(100_000)
        if len(pulled) > 10:
            raise AssertionError("read far past the limit")
        return {"type": "http.request", "body": b"x" * 100_000, "more_body": True}

    return Request({"type": "http", "method": "POST", "path": URL, "headers": headers}, receive)


def test_reading_a_body_without_a_length_stops_as_soon_as_it_passes_the_limit():
    pulled: list[int] = []

    with pytest.raises(HTTPException) as caught:
        asyncio.run(views._read_body(body_request([], pulled)))

    assert caught.value.status_code == 413
    assert len(pulled) == 3  # 300 000 bytes: past 262 144, so nothing more is asked for


def test_a_declared_length_over_the_limit_is_refused_without_reading_anything():
    pulled: list[int] = []
    request = body_request([(b"content-length", b"262145")], pulled)

    with pytest.raises(HTTPException) as caught:
        asyncio.run(views._read_body(request))

    assert caught.value.status_code == 413
    assert pulled == []


# -- failed and rejected: bounced rows, suppressed addresses ---------------------------------------


def test_a_failed_email_bounces_its_row_suppresses_the_address_and_tells_the_instructor(
    client, db, clock
):
    res = post(client, failed("Student@UCSC.edu"))

    assert res.status_code == 200
    assert res.json() == {"ok": True}
    row = outbox_row(db)
    assert (row["status"], row["last_error"], row["updated_at"]) == (
        "bounced",
        BOUNCE,
        NOW.isoformat(),
    )
    assert row["sent_at"] == SENT_AT  # it did go out; it bounced afterwards
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}
    [note] = db.rows("notifications")
    assert {key: value for key, value in note.items() if key != "id"} == {
        "user_id": INSTRUCTOR,
        "type": "email_undeliverable",
        "title": "An email couldn't be delivered",
        "body": f"Your invite to {STUDENT} couldn't be delivered (the address bounced).",
        "entity_type": "class",
        "entity_id": CLASS,
    }


def test_a_replayed_bounce_changes_nothing_and_notifies_nobody_again(client, db, clock):
    assert post(client, failed()).status_code == 200
    row_after, suppressed_after = dict(outbox_row(db)), suppressions(db)
    clock.advance(600)  # Maileroo retries minutes later

    assert post(client, failed()).status_code == 200

    assert outbox_row(db) == row_after
    assert suppressions(db) == suppressed_after
    assert len(db.rows("notifications")) == 1


def test_a_bounce_counted_by_a_concurrent_delivery_of_the_event_notifies_nobody(monkeypatch, clock):
    # The read saw the row as sent, but another delivery of the same event bounced it before
    # this one's update: the update changes nothing, so nobody hears twice.
    db = FakeSupabase(**{name: [] for name in TABLES})
    db.rows("email_outbox").append(sent_row())
    table = db.table

    def bounced_meanwhile(name):
        query = table(name)
        if name == "email_outbox":
            execute = query.execute

            def execute_after_the_other():
                if query._op == "update":
                    outbox_row(db)["status"] = "bounced"
                return execute()

            query.execute = execute_after_the_other
        return query

    monkeypatch.setattr(db, "table", bounced_meanwhile)
    install(monkeypatch, db)

    assert webhooks.handle_event(get_client(), failed()) == "bounced"
    assert db.rows("notifications") == []
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}


@pytest.mark.parametrize(
    "make",
    [lambda: rejected(), lambda: event("rejected", to=STUDENT, reject_reason=REJECTED_WHY)],
    ids=["documented-list", "single-address"],
)
def test_a_rejected_email_suppresses_the_address_as_rejected(client, db, make):
    assert post(client, make()).status_code == 200

    assert suppressions(db) == {STUDENT: ("rejected", REJECTED_WHY)}
    row = outbox_row(db)
    assert (row["status"], row["last_error"]) == ("bounced", REJECTED_WHY)
    assert notes(db) == [
        f"Your invite to {STUDENT} couldn't be delivered (the address was rejected)."
    ]


@pytest.mark.parametrize(
    "reason",
    [
        "Recipient address previously bounced",
        "Address is on the SUPPRESSION list",
        "Recipient Blocked by the receiving server",
        "The recipient address is invalid",
        "Recipient mailbox not found",
        "The mailbox does not exist",
        "Invalid recipient address",
        "550 5.1.1 unknown user",
        "Non-existent mailbox",
        "x" * 600 + " unknown user",  # matched in the whole reason, though only 500 are stored
    ],
    ids=[
        "previously-bounced",
        "suppression-list",
        "recipient-blocked",
        "recipient-address-invalid",
        "mailbox-not-found",
        "mailbox-does-not-exist",
        "invalid-recipient",
        "unknown-user",
        "non-existent-mailbox",
        "long",
    ],
)
def test_a_rejection_whose_reason_names_the_recipient_suppresses_the_address(client, db, reason):
    assert post(client, rejected(reason=reason)).status_code == 200
    assert suppressions(db) == {STUDENT: ("rejected", reason[:500])}
    assert outbox_row(db)["status"] == "bounced"
    assert notes(db) == [
        f"Your invite to {STUDENT} couldn't be delivered (the address was rejected)."
    ]


@pytest.mark.parametrize(
    "data",
    [
        # Found in review: the email, its content or its sender, never the recipient.
        {"reject_reason": "Message blocked as spam content"},
        {"reject_reason": "Blocked by content policy"},
        {"reject_reason": "Sender domain is blocklisted"},
        {"reject_reason": "Sending blocked: account bounce rate too high"},
        {"reject_reason": "Attachment type blocked"},
        {"reject_reason": "Template does not exist"},
        # The sender's address, not the recipient's.
        {"reject_reason": "Sender address is invalid"},
        {"reject_reason": "From address is invalid"},
        {"reject_reason": "Sending IP address blocked"},
        {"reject_reason": "Malformed email: the From header is missing"},
        {"reject_reason": "Message size exceeds the limit"},
        {},
    ],
    ids=[
        "spam-content",
        "content-policy",
        "sender-domain",
        "bounce-rate",
        "attachment",
        "template",
        "sender-address",
        "from-address",
        "sending-ip",
        "malformed",
        "too-large",
        "no-reason",
    ],
)
def test_a_rejection_of_the_email_bounces_the_row_but_suppresses_nobody(client, db, caplog, data):
    # The address may be fine: suppressing it would stop every later email to it.
    with caplog.at_level(logging.WARNING, logger="app.outbox.webhooks"):
        res = post(client, event("rejected", to=[STUDENT], **data))

    assert res.status_code == 200
    assert suppressions(db) == {}
    assert "email_suppressions" not in [query["table"] for query in db.queries]
    assert outbox_row(db)["status"] == "bounced"
    assert notes(db) == [
        f"Your invite to {STUDENT} couldn't be delivered (the mail server rejected the email)."
    ]
    # Logged with the event type and the reference only: a reason can quote the address.
    assert [r.getMessage() for r in caplog.records if r.name == "app.outbox.webhooks"] == [
        "maileroo_webhook: rejected for a reason that is not the recipient, address not "
        f"suppressed | event=rejected ref={REF}"
    ]


SEVERAL_RECIPIENTS = (
    "maileroo_webhook: rejected an email with several recipients, nobody suppressed | "
    f"event=rejected ref={REF}"
)


@pytest.mark.parametrize(
    "copies",
    [{"cc": ["ta@ucsc.edu"], "bcc": []}, {"cc": [], "bcc": ["records@ucsc.edu"]}],
    ids=["cc", "bcc"],
)
def test_a_rejected_email_with_copies_suppresses_nobody(client, monkeypatch, clock, caplog, copies):
    # Which of its recipients made Maileroo refuse it cannot be told, even with a reason that
    # names "the recipients".
    db = install(monkeypatch, FakeSupabase(**{name: [] for name in TABLES}))
    payload = {"subject": "Welcome", "body_text": "Hi", **copies}
    db.rows("email_outbox").append(sent_row(kind="custom_invite", payload=payload))

    with caplog.at_level(logging.WARNING, logger="app.outbox.webhooks"):
        assert post(client, rejected()).status_code == 200

    assert suppressions(db) == {}
    assert outbox_row(db)["status"] == "bounced"
    assert notes(db) == [
        f"Your invite to {STUDENT} couldn't be delivered (the mail server rejected the email)."
    ]
    assert [r.getMessage() for r in caplog.records if r.name == "app.outbox.webhooks"] == [
        SEVERAL_RECIPIENTS
    ]


def test_a_rejected_email_to_several_addresses_suppresses_nobody(client, db, caplog):
    with caplog.at_level(logging.WARNING, logger="app.outbox.webhooks"):
        assert post(client, rejected(to=[STUDENT, "ta@ucsc.edu"])).status_code == 200

    assert suppressions(db) == {}
    assert outbox_row(db)["status"] == "bounced"  # the student's row: the event names them
    assert notes(db) == [
        f"Your invite to {STUDENT} couldn't be delivered (the mail server rejected the email)."
    ]
    assert [r.getMessage() for r in caplog.records if r.name == "app.outbox.webhooks"] == [
        SEVERAL_RECIPIENTS
    ]


@pytest.mark.parametrize(
    ("copies", "to"),
    [
        ({"cc": [], "bcc": []}, [STUDENT]),
        ({"cc": ["  "], "bcc": None}, [STUDENT]),
        ({}, ["Student <student@ucsc.edu>", "STUDENT@ucsc.edu"]),  # one address, twice
    ],
    ids=["empty-copies", "blank-copies", "same-address-twice"],
)
def test_a_rejected_email_with_one_recipient_suppresses_it(client, monkeypatch, clock, copies, to):
    db = install(monkeypatch, FakeSupabase(**{name: [] for name in TABLES}))
    payload = {"subject": "Welcome", "body_text": "Hi", **copies}
    db.rows("email_outbox").append(sent_row(kind="custom_invite", payload=payload))

    assert post(client, rejected(to=to)).status_code == 200

    assert suppressions(db) == {STUDENT: ("rejected", REJECTED_WHY)}


def test_a_rejection_of_the_message_needs_no_suppressions_table(client, monkeypatch, clock):
    # Nothing is suppressed, so a missing table does not hold the event up.
    db = install(
        monkeypatch,
        FailingDb(
            lambda table, op: table == "email_suppressions",
            missing_table,
            email_outbox=[sent_row()],
            notifications=[],
        ),
    )
    res = post(client, event("rejected", to=[STUDENT], reject_reason="Message size exceeds"))
    assert res.status_code == 200
    assert outbox_row(db)["status"] == "bounced"


def test_a_failure_suppresses_the_address_whatever_its_reason(client, db):
    # Maileroo calls "failed" a permanent failure: no reason has to name the recipient.
    reason = "452-4.2.2 The recipient's inbox is out of storage space."
    assert post(client, failed(reason=reason)).status_code == 200
    assert suppressions(db) == {STUDENT: ("bounced", reason)}


def test_a_bounce_of_a_copy_suppresses_the_copy_and_leaves_the_recipients_row_alone(client, db):
    # A custom invite's cc bounced: the student got the email, so their row stays sent and the
    # instructor is not told that the student's invite failed.
    before = dict(outbox_row(db))

    assert post(client, failed("ta@ucsc.edu", reason="550 no such user")).status_code == 200

    assert outbox_row(db) == before
    assert suppressions(db) == {"ta@ucsc.edu": ("bounced", "550 no such user")}
    assert db.rows("notifications") == []


def test_a_bounce_of_an_email_the_outbox_does_not_know_still_suppresses_the_address(client, db):
    before = dict(outbox_row(db))

    assert post(client, failed("someone@ucsc.edu", ref=OTHER_REF)).status_code == 200

    assert outbox_row(db) == before
    assert suppressions(db) == {"someone@ucsc.edu": ("bounced", BOUNCE)}
    assert db.rows("notifications") == []


def test_a_bounce_without_a_reference_suppresses_the_address_without_reading_the_outbox(client, db):
    assert post(client, failed(ref=None)).status_code == 200
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}
    assert outbox_row(db)["status"] == "sent"
    assert [query["table"] for query in db.queries] == ["email_suppressions"]


def test_a_bounce_that_names_no_address_suppresses_its_rows_recipient(client, db):
    assert post(client, event("failed", reason=BOUNCE)).status_code == 200
    assert outbox_row(db)["status"] == "bounced"
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}


def test_a_bounce_without_a_reason_records_the_event_type(client, db):
    assert post(client, event("failed", to=STUDENT)).status_code == 200
    assert suppressions(db) == {STUDENT: ("bounced", "failed")}
    assert outbox_row(db)["last_error"] == "failed"


def test_a_long_reason_is_cut_to_500_characters(client, db):
    assert post(client, failed(reason="x" * 800)).status_code == 200
    assert suppressions(db)[STUDENT] == ("bounced", "x" * 500)
    assert outbox_row(db)["last_error"] == "x" * 500


@pytest.mark.parametrize(
    "to", ["Student <Student@UCSC.edu>", '"One, Student" <student@ucsc.edu>', "<student@ucsc.edu>"]
)
def test_an_address_with_a_display_name_is_read_as_the_address(client, db, to):
    assert post(client, failed(to)).status_code == 200
    assert outbox_row(db)["status"] == "bounced"
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}


@pytest.mark.parametrize("to", ["not an address", "a@ucsc.edu, b@ucsc.edu", ""])
def test_a_to_that_names_no_single_address_counts_as_none(client, db, to):
    # Nothing to compare with the row: like an event without "to", it is about its rows.
    assert post(client, failed(to)).status_code == 200
    assert outbox_row(db)["status"] == "bounced"
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}


@pytest.mark.parametrize("kind", ["no_such_kind", "test_quiet"])
def test_a_bounced_row_whose_kind_does_not_notify_tells_nobody(client, monkeypatch, clock, kind):
    quiet = Kind(name="test_quiet", render=lambda payload, ctx: Rendered(subject="s", text="t"))
    monkeypatch.setitem(KINDS, quiet.name, quiet)
    db = install(monkeypatch, FakeSupabase(**{name: [] for name in TABLES}))
    db.rows("email_outbox").append(sent_row(kind=kind))

    assert post(client, failed()).status_code == 200

    assert outbox_row(db)["status"] == "bounced"
    assert db.rows("notifications") == []


# -- complained and delivered ---------------------------------------------------------------------


def test_a_complaint_suppresses_the_address(client, db):
    before = dict(outbox_row(db))

    assert post(client, event("complained", to="Student <Student@ucsc.edu> ")).status_code == 200

    assert suppressions(db) == {STUDENT: ("complained", "complained")}
    assert outbox_row(db) == before
    assert db.rows("notifications") == []
    assert [query["table"] for query in db.queries] == ["email_suppressions"]  # no outbox read


def test_a_complaint_that_names_no_address_suppresses_its_rows_recipient(client, db):
    before = dict(outbox_row(db))

    assert post(client, event("complained")).status_code == 200

    assert suppressions(db) == {STUDENT: ("complained", "complained")}
    assert outbox_row(db) == before


def test_a_complaint_without_an_address_or_a_known_reference_suppresses_nobody(client, db):
    assert post(client, event("complained", ref=OTHER_REF)).status_code == 200
    assert suppressions(db) == {}


def test_a_delivery_is_recorded_once(client, db, clock):
    assert post(client, event("delivered", to=STUDENT)).status_code == 200
    row = outbox_row(db)
    delivered = datetime.fromtimestamp(EVENT_TIME, UTC).isoformat()
    assert (row["status"], row["delivered_at"], row["updated_at"]) == (
        "sent",
        delivered,
        NOW.isoformat(),
    )

    clock.advance(600)
    later = event("delivered", to=STUDENT, event_time=EVENT_TIME + 3600)
    assert post(client, later).status_code == 200

    assert outbox_row(db)["delivered_at"] == delivered
    assert outbox_row(db)["updated_at"] == NOW.isoformat()
    assert suppressions(db) == {}


@pytest.mark.parametrize("event_time", [None, "yesterday", True, float("inf")])
def test_a_delivery_without_a_readable_time_is_recorded_as_now(client, db, event_time):
    assert post(client, event("delivered", event_time=event_time)).status_code == 200
    assert outbox_row(db)["delivered_at"] == NOW.isoformat()


def test_a_delivery_before_the_outbox_migration_is_ignored(client, monkeypatch, clock):
    install(
        monkeypatch,
        FailingDb(lambda table, op: table == "email_outbox", missing_table, email_suppressions=[]),
    )
    assert post(client, event("delivered")).status_code == 200


def test_the_delivery_of_a_copy_does_not_stamp_the_recipients_row(client, db):
    before = dict(outbox_row(db))
    assert post(client, event("delivered", to="ta@ucsc.edu")).status_code == 200
    assert outbox_row(db) == before


def test_a_delivery_after_a_bounce_is_not_recorded(client, db, clock):
    assert post(client, failed()).status_code == 200
    bounced = dict(outbox_row(db))
    clock.advance(60)
    db.reset_counter()

    assert post(client, event("delivered", to=STUDENT)).status_code == 200

    assert outbox_row(db) == bounced
    assert bounced["delivered_at"] is None
    assert [(q["table"], q["op"]) for q in db.queries] == [("email_outbox", "select")]  # no write


def test_a_delivery_that_meets_a_bounce_recorded_meanwhile_stamps_nothing(monkeypatch, clock):
    # Read as sent, bounced by a concurrent event before this update: the update checks again.
    db = FakeSupabase(**{name: [] for name in TABLES})
    db.rows("email_outbox").append(sent_row())
    table = db.table

    def bounced_meanwhile(name):
        query = table(name)
        if name == "email_outbox":
            execute = query.execute

            def execute_after_the_bounce():
                if query._op == "update":
                    outbox_row(db)["status"] = "bounced"
                return execute()

            query.execute = execute_after_the_bounce
        return query

    monkeypatch.setattr(db, "table", bounced_meanwhile)
    install(monkeypatch, db)

    assert webhooks.handle_event(get_client(), event("delivered", to=STUDENT)) == "delivered"
    assert outbox_row(db)["delivered_at"] is None


# -- other events, other bodies -------------------------------------------------------------------


@pytest.mark.parametrize("event_type", ["accepted", "deferred", "opened", "clicked", "unknown"])
def test_other_events_are_acknowledged_and_ignored(client, db, event_type):
    before = [dict(row) for row in db.rows("email_outbox")]
    assert post(client, event(event_type, to=STUDENT)).status_code == 200
    assert db.rows("email_outbox") == before
    assert suppressions(db) == {}
    assert db.executes == 0


@pytest.mark.parametrize(
    ("payload", "label"),
    [
        (failed(), "bounced"),
        (rejected(), "bounced"),
        (rejected(reason="Message size exceeds the limit"), "bounced"),
        (event("complained", to=STUDENT), "suppressed"),
        (event("delivered", to=STUDENT), "delivered"),
        (event("opened", to=STUDENT), "ignored"),
        (event("FAILED", to=STUDENT), "bounced"),  # the type is read in any case
        ({**failed(), "event_type": None}, "ignored"),
        ({**failed(), "event_data": ["student@ucsc.edu"]}, "ignored"),
        ("failed", "ignored"),
        (None, "ignored"),
    ],
    ids=[
        "failed",
        "rejected",
        "rejected-message",
        "complained",
        "delivered",
        "opened",
        "upper-case",
        "no-type",
        "data-not-an-object",
        "not-an-object",
        "null",
    ],
)
def test_what_each_event_comes_to(db, payload, label):
    assert webhooks.handle_event(get_client(), payload) == label


def test_a_list_of_events_is_handled_event_by_event(client, db):
    body = [failed(), event("complained", to="other@ucsc.edu", ref=OTHER_REF), "junk"]

    assert post(client, body).status_code == 200

    assert suppressions(db) == {
        STUDENT: ("bounced", BOUNCE),
        "other@ucsc.edu": ("complained", "complained"),
    }
    assert outbox_row(db)["status"] == "bounced"


def test_the_log_names_the_event_and_the_reference_never_the_address_or_the_reason(
    client, db, caplog
):
    payloads = (
        failed(),
        rejected(),
        rejected(reason="Message size exceeds the limit"),
        rejected(to=[STUDENT, "ta@ucsc.edu"]),
        event("complained", to=STUDENT),
        event("delivered"),
    )
    with caplog.at_level(logging.DEBUG):
        for payload in payloads:
            assert post(client, payload).status_code == 200

    logged = "\n".join(r.getMessage() for r in caplog.records if r.name.startswith("app."))
    assert f"maileroo_webhook: bounced | event=failed ref={REF} rows=1" in logged
    assert SEVERAL_RECIPIENTS in logged
    for private in (STUDENT, "ta@ucsc.edu", "no such user", "suppression list", "Message size"):
        assert private not in logged


# -- what cannot be recorded --------------------------------------------------------------------


def test_before_the_outbox_migration_a_bounce_still_suppresses_the_address(
    client, monkeypatch, clock
):
    db = install(
        monkeypatch,
        FailingDb(
            lambda table, op: table == "email_outbox",
            missing_table,
            email_suppressions=[],
            notifications=[],
        ),
    )
    assert post(client, failed()).status_code == 200
    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}
    assert db.rows("notifications") == []


@pytest.mark.parametrize("payload", [failed(), rejected(), event("complained", to=STUDENT)])
def test_without_the_suppressions_table_the_event_is_refused_so_maileroo_retries(
    client, monkeypatch, clock, payload
):
    db = install(
        monkeypatch,
        FailingDb(
            lambda table, op: table == "email_suppressions" and op == "upsert",
            missing_table,
            email_outbox=[sent_row()],
            notifications=[],
        ),
    )
    res = post(client, payload)
    assert res.status_code == 503
    assert res.json() == {"detail": "Could not record the event"}
    assert db.rows("email_suppressions") == []


def test_a_bounce_retried_after_a_503_is_recorded_without_a_second_notification(
    client, monkeypatch, clock
):
    suppressions_table_exists = False
    db = install(
        monkeypatch,
        FailingDb(
            lambda table, op: table == "email_suppressions" and not suppressions_table_exists,
            missing_table,
            email_outbox=[sent_row()],
            notifications=[],
        ),
    )
    assert post(client, failed()).status_code == 503
    # The row was bounced and the instructor told before the suppression failed.
    assert outbox_row(db)["status"] == "bounced"
    assert len(db.rows("notifications")) == 1

    suppressions_table_exists = True
    assert post(client, failed()).status_code == 200

    assert suppressions(db) == {STUDENT: ("bounced", BOUNCE)}
    assert len(db.rows("notifications")) == 1


@pytest.mark.parametrize(
    ("make", "level"),
    [(outage, logging.WARNING), (denied, logging.ERROR)],
    ids=["outage", "denied"],
)
def test_an_outbox_that_cannot_be_read_is_a_503(client, monkeypatch, clock, caplog, make, level):
    db = install(
        monkeypatch,
        FailingDb(lambda table, op: table == "email_outbox", make, email_suppressions=[]),
    )
    with caplog.at_level(logging.WARNING, logger="app.outbox.views"):
        res = post(client, failed())

    assert res.status_code == 503
    assert res.json() == {"detail": "Could not record the event"}
    assert db.rows("email_suppressions") == []
    [logged] = [r for r in caplog.records if r.name == "app.outbox.views"]
    assert logged.levelno == level
    assert STUDENT not in logged.getMessage()
