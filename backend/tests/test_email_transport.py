"""The email transport: ``send`` hands a message to Maileroo's HTTP API (when MAILEROO_API_KEY is
set) or to SMTP, and sorts every failure into "try again later" (``TransientEmailError``) or
"never retry" (``PermanentEmailError``).

Nothing here touches the network: HTTP runs on ``httpx.MockTransport`` and SMTP on a recording
stand-in for ``smtplib.SMTP``. The end of the file covers ``app.utils.email.send_email`` and the
two callers that turn a delivery error into an HTTP answer (the contact form, the class invite).
"""

from __future__ import annotations

import json
import logging
import re
import smtplib
import ssl
import uuid
from email import message_from_string
from types import SimpleNamespace

import httpx
import pytest
from fastapi import HTTPException

from app.classes.invite_email import send_class_invite_email_or_raise
from app.config import settings
from app.contact.controller import submit_contact
from app.utils import email as email_utils
from app.utils import email_transport as transport
from app.utils.email_transport import (
    EmailDeliveryError,
    EmailMessage,
    EmailNotConfiguredError,
    PermanentEmailError,
    TransientEmailError,
)

API_KEY = "test-sending-key"
SENDER = "GrepThink <noreply@grepthink.test>"
PROVIDER_ID = "c843204e3af03193bd14f339"
OUR_ID = "7f3c1e9a1b2d4c5e8f6a0123"


# ── fixtures and helpers ─────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _no_provider(monkeypatch):
    """Every test starts with nothing configured, whatever the developer's .env holds."""
    for name, value in {
        "MAILEROO_API_KEY": "",
        "MAILEROO_API_URL": "https://maileroo.test/api/v2",
        "EMAIL_FROM": "",
        "SMTP_HOST": "",
        "SMTP_PORT": 587,
        "SMTP_USER": "",
        "SMTP_PASSWORD": "",
        "SMTP_FROM": "",
    }.items():
        monkeypatch.setattr(settings, name, value)


def _use_http(monkeypatch, sender: str = SENDER) -> None:
    monkeypatch.setattr(settings, "MAILEROO_API_KEY", API_KEY)
    monkeypatch.setattr(settings, "EMAIL_FROM", sender)


def _use_smtp(monkeypatch, *, host: str = "smtp.example.test", user: str = "mailer") -> None:
    monkeypatch.setattr(settings, "SMTP_HOST", host)
    monkeypatch.setattr(settings, "SMTP_USER", user)
    monkeypatch.setattr(settings, "SMTP_PASSWORD", "s3cret")
    monkeypatch.setattr(settings, "SMTP_FROM", SENDER)


def _message(**overrides) -> EmailMessage:
    fields = {"to": "student@ucsc.edu", "subject": "Hello", "text": "Plain body"}
    return EmailMessage(**{**fields, **overrides})


def _full_message() -> EmailMessage:
    return EmailMessage(
        to="student@ucsc.edu",
        subject="Weekly digest",
        text="Plain body",
        html="<p>Html body</p>",
        cc=("ta@ucsc.edu", "prof@ucsc.edu"),
        bcc=("audit@grepthink.test",),
        reply_to="prof@ucsc.edu",
        headers={"List-Unsubscribe": "<https://api.test/unsubscribe?t=1>"},
        tags={"kind": "digest"},
        reference_id=OUR_ID,
    )


def _accepted(reference_id: str = PROVIDER_ID) -> dict:
    return {
        "success": True,
        "message": "The email has been scheduled for delivery.",
        "data": {"reference_id": reference_id},
    }


def _reply(status: int, body=None):
    """A handler that always answers ``status`` (with ``body`` as JSON when given)."""

    def respond(request: httpx.Request) -> httpx.Response:
        if body is None:
            return httpx.Response(status)
        return httpx.Response(status, json=body)

    return respond


def _http(monkeypatch, respond) -> list[httpx.Request]:
    """Serve the transport's HTTP calls from ``respond(request)``; returns the requests seen."""
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return respond(request)

    monkeypatch.setattr(
        transport, "_http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler))
    )
    return seen


def _no_http(monkeypatch) -> None:
    def forbidden():
        raise AssertionError("the HTTP API must not be used here")

    monkeypatch.setattr(transport, "_http_client", forbidden)


def _fake_smtp(monkeypatch, fail: dict[str, Exception] | None = None) -> SimpleNamespace:
    """Replace ``smtplib.SMTP`` with a recorder. ``fail`` maps a step (``connect``, ``ehlo``,
    ``starttls``, ``login``, ``sendmail``) to the exception that step raises."""
    fail = fail or {}
    log = SimpleNamespace(connections=[], calls=[])

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            log.connections.append((host, port, timeout))
            if "connect" in fail:
                raise fail["connect"]

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            return False

        def _step(self, name, *args):
            log.calls.append((name, *args))
            if name in fail:
                raise fail[name]

        def ehlo(self):
            self._step("ehlo")

        def starttls(self):
            self._step("starttls")

        def login(self, user, password):
            self._step("login", user, password)

        def sendmail(self, sender, recipients, raw):
            self._step("sendmail", sender, list(recipients), raw)
            return {}

    monkeypatch.setattr(transport.smtplib, "SMTP", FakeSMTP)
    return log


def _sendmail(log: SimpleNamespace) -> tuple:
    return next(call for call in log.calls if call[0] == "sendmail")


def _errors(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.levelno >= logging.ERROR]


# ── HTTP: the request ────────────────────────────────────────────────────────────────


def test_http_request_carries_every_field(monkeypatch):
    _use_http(monkeypatch)
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_full_message())

    [request] = seen
    assert request.method == "POST"
    assert str(request.url) == "https://maileroo.test/api/v2/emails"
    assert request.headers["Authorization"] == f"Bearer {API_KEY}"
    assert request.headers["Content-Type"] == "application/json"
    assert json.loads(request.content) == {
        "from": {"address": "noreply@grepthink.test", "display_name": "GrepThink"},
        "to": [{"address": "student@ucsc.edu"}],
        "cc": [{"address": "ta@ucsc.edu"}, {"address": "prof@ucsc.edu"}],
        "bcc": [{"address": "audit@grepthink.test"}],
        "reply_to": {"address": "prof@ucsc.edu"},
        "subject": "Weekly digest",
        "plain": "Plain body",
        "html": "<p>Html body</p>",
        "headers": {"List-Unsubscribe": "<https://api.test/unsubscribe?t=1>"},
        "tags": {"kind": "digest"},
        "reference_id": OUR_ID,
        "tracking": False,  # never on: it rewrites links and reports who opened what
    }


def test_http_request_omits_what_is_not_set(monkeypatch):
    _use_http(monkeypatch, sender="noreply@grepthink.test")  # no display name either
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert json.loads(seen[0].content) == {
        "from": {"address": "noreply@grepthink.test"},
        "to": [{"address": "student@ucsc.edu"}],
        "subject": "Hello",
        "plain": "Plain body",
        "tracking": False,
    }


def test_http_request_treats_empty_values_as_not_set(monkeypatch):
    _use_http(monkeypatch)
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(
        _message(html="", cc=(), bcc=(), reply_to="", headers={}, tags={}, reference_id="")
    )

    body = json.loads(seen[0].content)
    assert set(body) == {"from", "to", "subject", "plain", "tracking"}


def test_the_sender_falls_back_to_smtp_from(monkeypatch):
    monkeypatch.setattr(settings, "MAILEROO_API_KEY", API_KEY)
    monkeypatch.setattr(settings, "SMTP_FROM", "Legacy <legacy@grepthink.test>")
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert json.loads(seen[0].content)["from"] == {
        "address": "legacy@grepthink.test",
        "display_name": "Legacy",
    }


def test_email_from_wins_over_smtp_from(monkeypatch):
    _use_http(monkeypatch, sender="Primary <primary@grepthink.test>")
    monkeypatch.setattr(settings, "SMTP_FROM", "Legacy <legacy@grepthink.test>")
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert json.loads(seen[0].content)["from"]["address"] == "primary@grepthink.test"


def test_a_trailing_slash_on_the_api_url_is_harmless(monkeypatch):
    _use_http(monkeypatch)
    monkeypatch.setattr(settings, "MAILEROO_API_URL", "https://maileroo.test/api/v2/")
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert str(seen[0].url) == "https://maileroo.test/api/v2/emails"


def test_the_http_client_has_short_timeouts():
    with transport._http_client() as client:
        assert client.timeout == httpx.Timeout(10.0, connect=5.0)


# ── HTTP: the answer ─────────────────────────────────────────────────────────────────


def test_http_send_returns_the_providers_reference_id(monkeypatch):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, _accepted(PROVIDER_ID)))

    assert transport.send(_message(reference_id=OUR_ID)) == PROVIDER_ID


@pytest.mark.parametrize(
    "body",
    [
        {"success": True, "message": "queued"},
        {"success": True, "message": "queued", "data": {}},
        {"success": True, "message": "queued", "data": {"reference_id": ""}},
        {"success": True, "message": "queued", "data": "nothing useful"},
    ],
    ids=["no-data", "empty-data", "empty-reference", "data-not-an-object"],
)
def test_http_send_falls_back_to_our_reference_id(monkeypatch, body):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, body))

    assert transport.send(_message(reference_id=OUR_ID)) == OUR_ID


def test_http_send_without_any_reference_id_returns_none(monkeypatch):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, {"success": True, "message": "queued"}))

    assert transport.send(_message()) is None


@pytest.mark.parametrize("status", [400, 422])
def test_a_rejected_email_is_permanent_and_carries_the_servers_message(monkeypatch, status):
    _use_http(monkeypatch)
    body = {"success": False, "message": "The 'to' address is not a valid email address."}
    _http(monkeypatch, _reply(status, body))

    with pytest.raises(PermanentEmailError, match="not a valid email address") as caught:
        transport.send(_message())

    assert str(status) in str(caught.value)


@pytest.mark.parametrize("status", [401, 403, 404])
def test_a_misconfigured_account_waits_and_is_logged_as_an_error(monkeypatch, caplog, status):
    """A wrong key, a blocked IP or a wrong URL is ours to fix: the email must wait, not be lost."""
    _use_http(monkeypatch)
    body = {"success": False, "message": "Something is wrong with the request."}
    _http(monkeypatch, _reply(status, body))

    with caplog.at_level(logging.ERROR), pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert not isinstance(caught.value, PermanentEmailError)
    assert str(status) in str(caught.value)
    [record] = _errors(caplog)
    assert str(status) in record.getMessage()
    assert API_KEY not in caplog.text


@pytest.mark.parametrize("status", [429, 500, 503, 302, 409])
def test_throttling_outages_and_anything_unexpected_are_transient(monkeypatch, status):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(status, {"success": False, "message": "Slow down."}))

    with pytest.raises(TransientEmailError, match=str(status)):
        transport.send(_message())


def test_an_error_without_a_body_is_still_classified(monkeypatch):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(502))

    with pytest.raises(TransientEmailError, match="502"):
        transport.send(_message())


def test_a_proxy_error_page_is_quoted_briefly(monkeypatch):
    _use_http(monkeypatch)
    page = "<html>" + "Bad gateway " * 500 + "</html>"
    _http(monkeypatch, lambda request: httpx.Response(502, text=page))

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert len(str(caught.value)) < 500


@pytest.mark.parametrize(
    "failure",
    [
        httpx.ConnectError("connection refused"),
        httpx.ReadTimeout("read timed out"),
        httpx.DecodingError("corrupt gzip body"),  # a RequestError, but not a TransportError
    ],
    ids=lambda failure: type(failure).__name__,
)
def test_a_network_failure_is_transient_and_keeps_its_cause(monkeypatch, failure):
    _use_http(monkeypatch)

    def respond(request):
        raise failure

    _http(monkeypatch, respond)

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert caught.value.__cause__ is failure


def test_an_api_url_without_a_scheme_is_a_transient_misconfiguration(monkeypatch):
    """A real httpx client rejects the URL before it connects, so this needs no network."""
    _use_http(monkeypatch)
    monkeypatch.setattr(settings, "MAILEROO_API_URL", "maileroo.test/api/v2")

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert isinstance(caught.value.__cause__, httpx.UnsupportedProtocol)


@pytest.mark.parametrize(
    "body",
    [
        {"success": False, "message": "Not sent."},
        {"message": "No verdict at all."},
        {"success": "true", "message": "A string is not a yes."},
        ["not", "an", "object"],
    ],
    ids=["success-false", "no-success", "success-not-boolean", "json-array"],
)
def test_a_200_that_does_not_confirm_the_email_is_transient(monkeypatch, body):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, body))

    with pytest.raises(TransientEmailError):
        transport.send(_message())


def test_a_200_that_is_not_json_is_transient(monkeypatch):
    _use_http(monkeypatch)
    _http(monkeypatch, lambda request: httpx.Response(200, text="<html>maintenance</html>"))

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert isinstance(caught.value.__cause__, ValueError)


# ── configuration ────────────────────────────────────────────────────────────────────


def test_an_api_key_without_a_sender_is_not_configured_and_sends_nothing(monkeypatch):
    monkeypatch.setattr(settings, "MAILEROO_API_KEY", API_KEY)
    seen = _http(monkeypatch, _reply(200, _accepted()))

    with pytest.raises(EmailNotConfiguredError, match="EMAIL_FROM"):
        transport.send(_message())

    assert seen == []


def test_a_sender_without_an_address_is_not_configured(monkeypatch):
    """``parseaddr("GrepThink")`` yields an "address" with no ``@``; Maileroo would answer 400 to
    every email, which would be read as a permanent failure of each one."""
    _use_http(monkeypatch, sender="GrepThink")
    seen = _http(monkeypatch, _reply(200, _accepted()))

    with pytest.raises(EmailNotConfiguredError):
        transport.send(_message())

    assert seen == []


def test_nothing_configured_raises_a_runtime_error_that_names_the_settings():
    with pytest.raises(EmailNotConfiguredError) as caught:
        transport.send(_message())

    error = caught.value
    # RuntimeError keeps every caller that predates the transport working.
    assert isinstance(error, RuntimeError)
    assert isinstance(error, TransientEmailError)
    assert isinstance(error, EmailDeliveryError)
    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAILEROO_API_KEY"):
        assert name in str(error)


def test_the_error_classes_are_distinct_branches_of_one_base():
    assert issubclass(TransientEmailError, EmailDeliveryError)
    assert issubclass(PermanentEmailError, EmailDeliveryError)
    assert not issubclass(PermanentEmailError, TransientEmailError)
    assert not issubclass(TransientEmailError, PermanentEmailError)
    assert not issubclass(PermanentEmailError, RuntimeError)


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        pytest.param({}, False, id="nothing-set"),
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, "EMAIL_FROM": SENDER}, True, id="key-and-sender"
        ),
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, "SMTP_FROM": SENDER}, True, id="key-and-legacy-sender"
        ),
        pytest.param(
            {"SMTP_HOST": "smtp.example.test", "SMTP_USER": "mailer", "SMTP_PASSWORD": "s3cret"},
            True,
            id="smtp",
        ),
        pytest.param({"MAILEROO_API_KEY": API_KEY}, False, id="key-without-sender"),
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, "EMAIL_FROM": "GrepThink"},
            False,
            id="sender-without-address",
        ),
        pytest.param(
            {"SMTP_HOST": "smtp.example.test", "SMTP_USER": "mailer"}, False, id="smtp-no-password"
        ),
    ],
)
def test_is_configured_needs_the_whole_of_either_path(monkeypatch, values, expected):
    for name, value in values.items():
        monkeypatch.setattr(settings, name, value)

    assert transport.is_configured() is expected


def test_the_api_key_picks_http_and_no_smtp_session_is_opened(monkeypatch):
    _use_http(monkeypatch)
    _use_smtp(monkeypatch)  # both are configured: the key decides
    smtp = _fake_smtp(monkeypatch)
    _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert smtp.connections == []


def test_without_an_api_key_smtp_is_used_and_http_is_not(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)
    _no_http(monkeypatch)

    assert transport.send(_message()) is None

    assert len(smtp.connections) == 1


# ── SMTP: the session ────────────────────────────────────────────────────────────────


def test_smtp_send_returns_none_and_walks_the_usual_session(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    assert transport.send(_message()) is None

    assert smtp.connections == [("smtp.example.test", 587, 10)]
    assert [call[0] for call in smtp.calls] == ["ehlo", "starttls", "ehlo", "login", "sendmail"]
    assert _sendmail(smtp)[1] == SENDER
    assert next(call for call in smtp.calls if call[0] == "login")[1:] == ("mailer", "s3cret")


def test_smtp_envelope_is_to_then_cc_then_bcc(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_full_message())

    recipients = _sendmail(smtp)[2]
    assert recipients == [
        "student@ucsc.edu",
        "ta@ucsc.edu",
        "prof@ucsc.edu",
        "audit@grepthink.test",
    ]


def test_smtp_builds_the_mime_message(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_full_message())

    raw = _sendmail(smtp)[3]
    parsed = message_from_string(raw)
    assert parsed.get_content_type() == "multipart/alternative"
    assert parsed["Subject"] == "Weekly digest"
    assert parsed["From"] == SENDER
    assert parsed["To"] == "student@ucsc.edu"
    assert parsed["Cc"] == "ta@ucsc.edu, prof@ucsc.edu"
    assert parsed["Reply-To"] == "prof@ucsc.edu"
    assert parsed["List-Unsubscribe"] == "<https://api.test/unsubscribe?t=1>"
    # A Bcc recipient is on the envelope only: a header would show it to everyone else.
    assert parsed["Bcc"] is None
    assert "audit@grepthink.test" not in raw
    plain, html = parsed.get_payload()
    assert plain.get_content_type() == "text/plain"
    assert plain.get_payload(decode=True).decode() == "Plain body"
    assert html.get_content_type() == "text/html"
    assert html.get_payload(decode=True).decode() == "<p>Html body</p>"


def test_smtp_message_without_html_or_extras_has_only_a_text_part(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_message())

    parsed = message_from_string(_sendmail(smtp)[3])
    assert [part.get_content_type() for part in parsed.get_payload()] == ["text/plain"]
    for header in ("Cc", "Bcc", "Reply-To", "List-Unsubscribe"):
        assert parsed[header] is None


def test_smtp_sends_non_ascii_text_and_subject(monkeypatch):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_message(subject="Résumé ☕", text="Café ☕", html="<p>Café ☕</p>"))

    raw = _sendmail(smtp)[3]
    assert raw.isascii()  # smtplib encodes the message as ASCII
    plain = message_from_string(raw).get_payload()[0]
    assert plain.get_payload(decode=True).decode("utf-8") == "Café ☕"


@pytest.mark.parametrize(
    ("email_from", "smtp_from", "smtp_user", "expected"),
    [
        ("Primary <primary@grepthink.test>", SENDER, "mailer", "Primary <primary@grepthink.test>"),
        ("", SENDER, "mailer", SENDER),
        ("", "", "mailer@grepthink.test", "mailer@grepthink.test"),
    ],
    ids=["email-from", "smtp-from", "smtp-user"],
)
def test_smtp_sender_prefers_email_from_then_smtp_from_then_the_login(
    monkeypatch, email_from, smtp_from, smtp_user, expected
):
    _use_smtp(monkeypatch, user=smtp_user)
    monkeypatch.setattr(settings, "EMAIL_FROM", email_from)
    monkeypatch.setattr(settings, "SMTP_FROM", smtp_from)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_message())

    sendmail = _sendmail(smtp)
    assert sendmail[1] == expected
    assert message_from_string(sendmail[3])["From"] == expected


def test_smtp_login_user_is_resend_on_resends_host(monkeypatch, caplog):
    _use_smtp(monkeypatch, host="smtp.resend.com", user="someone@grepthink.test")
    smtp = _fake_smtp(monkeypatch)

    with caplog.at_level(logging.WARNING):
        transport.send(_message())

    assert next(call for call in smtp.calls if call[0] == "login")[1:] == ("resend", "s3cret")
    assert "Resend SMTP" in caplog.text


@pytest.mark.parametrize(
    ("host", "configured", "expected"),
    [
        ("smtp.resend.com", "resend", "resend"),
        (" SMTP.Resend.com ", "whatever", "resend"),
        ("smtp.example.test", "mailer", "mailer"),
    ],
)
def test_smtp_login_user(host, configured, expected):
    assert transport._smtp_login_user(host, configured) == expected


def test_smtp_logs_the_session_like_the_old_send_email(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch)

    with caplog.at_level(logging.INFO):
        transport.send(_full_message())

    assert "send_email: connecting | host=smtp.example.test port=587 user=mailer" in caplog.text
    assert "bcc_count=1" in caplog.text
    assert "send_email: delivered | to=student@ucsc.edu" in caplog.text
    assert "s3cret" not in caplog.text


# ── SMTP: the failures ───────────────────────────────────────────────────────────────

SMTP_FAILURES = [
    pytest.param(
        "sendmail",
        smtplib.SMTPRecipientsRefused({"student@ucsc.edu": (550, b"no such user")}),
        PermanentEmailError,
        id="recipients-refused",
    ),
    pytest.param(
        "sendmail",
        smtplib.SMTPSenderRefused(550, b"sender not allowed", SENDER),
        PermanentEmailError,
        id="sender-refused",
    ),
    pytest.param(
        "sendmail",
        smtplib.SMTPSenderRefused(451, b"sender not allowed yet", SENDER),
        PermanentEmailError,
        id="sender-refused-4xx",  # a refused sender is permanent whatever the code (spec)
    ),
    pytest.param(
        "sendmail",
        smtplib.SMTPRecipientsRefused({"student@ucsc.edu": (450, b"mailbox busy")}),
        PermanentEmailError,
        id="recipients-refused-4xx",  # likewise for a refused recipient (spec)
    ),
    pytest.param(
        "sendmail", smtplib.SMTPDataError(550, b"x"), PermanentEmailError, id="data-error-550"
    ),
    pytest.param(
        "sendmail", smtplib.SMTPDataError(451, b"x"), TransientEmailError, id="data-error-451"
    ),
    pytest.param(
        "starttls",
        ssl.SSLEOFError(8, "EOF occurred in violation of protocol (_ssl.c:1016)"),
        TransientEmailError,
        id="tls-handshake-eof",  # the PROD Sentry event: an OSError, not an SMTPException
    ),
    pytest.param(
        "login",
        smtplib.SMTPAuthenticationError(535, b"bad credentials"),
        TransientEmailError,
        id="authentication",
    ),
    pytest.param(
        "sendmail",
        smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
        TransientEmailError,
        id="disconnected",
    ),
    pytest.param(
        "sendmail",
        smtplib.SMTPResponseException(421, b"service not available"),
        TransientEmailError,
        id="response-421",
    ),
    pytest.param(
        "connect", ConnectionRefusedError(61, "refused"), TransientEmailError, id="refused"
    ),
    pytest.param("connect", TimeoutError("timed out"), TransientEmailError, id="timeout"),
]


@pytest.mark.parametrize(("step", "failure", "expected"), SMTP_FAILURES)
def test_smtp_failures_are_classified_and_keep_their_cause(monkeypatch, step, failure, expected):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch, fail={step: failure})

    with pytest.raises(expected) as caught:
        transport.send(_message())

    assert caught.value.__cause__ is failure
    assert isinstance(caught.value, EmailDeliveryError)


def test_a_failed_login_is_an_error_log_and_never_shows_the_password(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch, fail={"login": smtplib.SMTPAuthenticationError(535, b"bad")})

    with caplog.at_level(logging.ERROR), pytest.raises(TransientEmailError):
        transport.send(_message())

    [record] = _errors(caplog)
    assert "SMTP_PASSWORD" in record.getMessage()
    assert "s3cret" not in caplog.text


def test_a_message_that_cannot_be_serialised_is_permanent_and_opens_no_session(monkeypatch):
    """A subject carrying a second header line is never going to go out: retrying is pointless."""
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    with pytest.raises(PermanentEmailError):
        transport.send(_message(subject="Hi\r\nBcc: someone@else.test"))

    assert smtp.connections == []


# ── reference ids ────────────────────────────────────────────────────────────────────


def test_reference_id_for_takes_the_first_24_hex_digits_of_a_uuid():
    assert transport.reference_id_for("7f3c1e9a-1b2d-4c5e-8f6a-0123456789ab") == OUR_ID


def test_reference_id_for_lowercases():
    assert transport.reference_id_for("7F3C1E9A-1B2D-4C5E-8F6A-0123456789AB") == OUR_ID


def test_reference_id_for_fits_maileroos_format_for_any_uuid():
    for _ in range(20):
        assert re.fullmatch(r"[0-9a-f]{24}", transport.reference_id_for(str(uuid.uuid4())))


# ── app.utils.email.send_email ───────────────────────────────────────────────────────


def test_send_email_hands_an_email_message_to_the_transport(monkeypatch):
    sent: list[EmailMessage] = []
    monkeypatch.setattr(transport, "send", lambda message: sent.append(message))

    result = email_utils.send_email(
        to="student@ucsc.edu",
        subject="Hello",
        body_text="Plain body",
        body_html="<p>Html body</p>",
        reply_to="prof@ucsc.edu",
        cc=["ta@ucsc.edu"],
        bcc=["audit@grepthink.test"],
    )

    assert result is None
    assert sent == [
        EmailMessage(
            to="student@ucsc.edu",
            subject="Hello",
            text="Plain body",
            html="<p>Html body</p>",
            cc=("ta@ucsc.edu",),
            bcc=("audit@grepthink.test",),
            reply_to="prof@ucsc.edu",
        )
    ]


def test_send_email_defaults_are_an_empty_envelope(monkeypatch):
    sent: list[EmailMessage] = []
    monkeypatch.setattr(transport, "send", lambda message: sent.append(message))

    email_utils.send_email(to="student@ucsc.edu", subject="Hello", body_text="Plain body")

    assert sent == [EmailMessage(to="student@ucsc.edu", subject="Hello", text="Plain body")]


def test_send_email_returns_none_even_when_the_transport_returns_an_id(monkeypatch):
    monkeypatch.setattr(transport, "send", lambda message: PROVIDER_ID)

    assert email_utils.send_email(to="a@ucsc.edu", subject="s", body_text="t") is None


def test_send_email_raises_not_configured_when_no_provider_is_set():
    with pytest.raises(EmailNotConfiguredError) as caught:
        email_utils.send_email(to="student@ucsc.edu", subject="Hello", body_text="Plain body")

    assert isinstance(caught.value, RuntimeError)  # app.profiles.controller catches RuntimeError


@pytest.mark.parametrize("error", [TransientEmailError("later"), PermanentEmailError("never")])
def test_send_email_lets_delivery_errors_through(monkeypatch, error):
    def fail(message):
        raise error

    monkeypatch.setattr(transport, "send", fail)

    with pytest.raises(type(error)) as caught:
        email_utils.send_email(to="a@ucsc.edu", subject="s", body_text="t")

    assert caught.value is error


def test_the_editor_html_helpers_are_untouched():
    html = "<div>hi</div><ul><li>a</li></ul>"
    assert 'style="margin:0;padding:0"' in email_utils.normalize_editor_html_for_email(html)
    assert email_utils.wrap_editor_html_for_email("<div>x</div>").startswith("<html><body")


# ── callers that turn a delivery error into an HTTP answer ───────────────────────────


def _raising(error: Exception):
    def send(**kwargs):
        raise error

    return send


DELIVERY_ERRORS = [
    pytest.param(TransientEmailError("provider down"), id="transient"),
    pytest.param(PermanentEmailError("bad address"), id="permanent"),
    pytest.param(EmailNotConfiguredError("nothing set"), id="not-configured"),
]


@pytest.mark.parametrize("error", DELIVERY_ERRORS)
def test_the_contact_form_answers_502_when_delivery_fails(monkeypatch, error):
    monkeypatch.setattr("app.contact.controller.send_email", _raising(error))

    with pytest.raises(HTTPException) as caught:
        submit_contact(name="Ann", email="ann@example.com", message="Hello there")

    assert caught.value.status_code == 502
    assert caught.value.detail == "Failed to send message"
    assert caught.value.__cause__ is error


INVITE = {
    "class_name": "CSE 115C",
    "course_code": "ABCD1234",
    "instructor_name": "Ina Structor",
    "registered": False,
}


def test_a_class_invite_answers_503_when_email_is_not_configured(monkeypatch):
    error = EmailNotConfiguredError("nothing set")
    monkeypatch.setattr("app.classes.invite_email.send_email", _raising(error))

    with pytest.raises(HTTPException) as caught:
        send_class_invite_email_or_raise(to="student@ucsc.edu", **INVITE)

    assert caught.value.status_code == 503
    assert caught.value.__cause__ is error


@pytest.mark.parametrize(
    "error",
    [TransientEmailError("provider down"), PermanentEmailError("bad address")],
    ids=["transient", "permanent"],
)
def test_a_class_invite_answers_502_when_delivery_fails(monkeypatch, error):
    monkeypatch.setattr("app.classes.invite_email.send_email", _raising(error))

    with pytest.raises(HTTPException) as caught:
        send_class_invite_email_or_raise(to="student@ucsc.edu", **INVITE)

    assert caught.value.status_code == 502
    assert caught.value.detail == "Failed to send invitation email"
    assert caught.value.__cause__ is error
