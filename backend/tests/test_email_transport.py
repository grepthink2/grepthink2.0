"""The email transport: ``send`` hands a message to Maileroo's HTTP API (when MAILEROO_API_KEY is
set) or to SMTP, and sorts every failure into "never retry" (``PermanentEmailError``), "the
provider refused us, not the message" (``EmailMisconfiguredError``) or "try again later"
(``TransientEmailError``).

HTTP runs on ``httpx.MockTransport``, and most SMTP tests on a recording stand-in for
``smtplib.SMTP``. The tests that need the real ``smtplib`` (what ``sendmail`` returns for a partial
refusal, what QUIT does, what a non-ASCII address does, the certificate check) talk to a scripted
SMTP server on 127.0.0.1 inside the test process: no external network. The end of the file covers
``app.utils.email.send_email`` and the two callers that turn a delivery error into an HTTP answer
(the contact form, the class invite).
"""

from __future__ import annotations

import base64
import datetime
import hashlib
import ipaddress
import json
import logging
import pathlib
import re
import smtplib
import socketserver
import ssl
import subprocess
import sys
import threading
import time
import uuid
from email import message_from_string
from email.errors import HeaderParseError
from types import SimpleNamespace

import httpx
import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID
from fastapi import HTTPException
from sentry_sdk.utils import walk_exception_chain

from app.classes.invite_email import send_class_invite_email_or_raise
from app.config import settings
from app.contact.controller import submit_contact
from app.utils import email as email_utils
from app.utils import email_transport as transport
from app.utils.email_transport import (
    EmailDeliveryError,
    EmailMessage,
    EmailMisconfiguredError,
    EmailNotConfiguredError,
    PermanentEmailError,
    TransientEmailError,
)

API_KEY = "test-sending-key"
SENDER = "GrepThink <noreply@grepthink.test>"
PROVIDER_ID = "c843204e3af03193bd14f339"
OUR_ID = "7f3c1e9a1b2d4c5e8f6a0123"
BACKEND_DIR = pathlib.Path(__file__).resolve().parent.parent


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


def _fake_smtp(
    monkeypatch, fail: dict[str, Exception] | None = None, refused: dict | None = None
) -> SimpleNamespace:
    """Replace ``smtplib.SMTP`` with a recorder.

    ``fail`` maps a step (``connect``, ``ehlo``, ``starttls``, ``login``, ``sendmail``, ``quit``,
    ``close``) to the exception that step raises; ``refused`` is what ``sendmail`` returns (the recipients
    the server refused while taking the message for the others). It is deliberately not a context
    manager: the transport must end the session itself, so that a QUIT cannot replace the error.
    """
    fail = fail or {}
    log = SimpleNamespace(connections=[], calls=[], contexts=[])

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            log.connections.append((host, port, timeout))
            if "connect" in fail:
                raise fail["connect"]

        def _step(self, name, *args):
            log.calls.append((name, *args))
            if name in fail:
                raise fail[name]

        def ehlo(self):
            self._step("ehlo")

        def starttls(self, *, context=None):
            log.contexts.append(context)
            self._step("starttls")

        def login(self, user, password):
            self._step("login", user, password)

        def sendmail(self, sender, recipients, raw):
            self._step("sendmail", sender, list(recipients), raw)
            return dict(refused or {})

        def quit(self):
            self._step("quit")

        def close(self):
            self._step("close")

    monkeypatch.setattr(transport.smtplib, "SMTP", FakeSMTP)
    return log


def _steps(log: SimpleNamespace) -> list[str]:
    return [call[0] for call in log.calls]


def _sendmail(log: SimpleNamespace) -> tuple:
    return next(call for call in log.calls if call[0] == "sendmail")


def _errors(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.levelno >= logging.ERROR]


def _warnings(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.levelno == logging.WARNING]


def _chain_messages(error: BaseException) -> str:
    """Every message Sentry would report for ``error``: it walks causes, and contexts unless
    they are suppressed (``raise ... from None``)."""
    chain = walk_exception_chain((type(error), error, error.__traceback__))
    return "\n".join(str(exc) for _, exc, _ in chain)


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


@pytest.mark.parametrize("status", [200, 201, 202])
def test_any_2xx_that_confirms_the_email_is_success(monkeypatch, status):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(status, _accepted(PROVIDER_ID)))

    assert transport.send(_message(reference_id=OUR_ID)) == PROVIDER_ID


@pytest.mark.parametrize(
    "response",
    [
        pytest.param(
            lambda request: httpx.Response(202, json={"success": False, "message": "No."}),
            id="202-success-false",
        ),
        pytest.param(lambda request: httpx.Response(204), id="204-no-content"),
        pytest.param(lambda request: httpx.Response(201, text="<html>"), id="201-not-json"),
    ],
)
def test_a_2xx_that_does_not_confirm_the_email_is_plain_transient(monkeypatch, response):
    _use_http(monkeypatch)
    _http(monkeypatch, response)

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert not isinstance(caught.value, EmailMisconfiguredError)


def test_http_send_without_any_reference_id_returns_none(monkeypatch):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, {"success": True, "message": "queued"}))

    assert transport.send(_message()) is None


def test_http_send_logs_the_recipient_and_reference_id_but_not_the_subject(monkeypatch, caplog):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(200, _accepted(PROVIDER_ID)))

    with caplog.at_level(logging.INFO):
        transport.send(_full_message())

    assert "to=student@ucsc.edu" in caplog.text
    assert f"reference_id={PROVIDER_ID}" in caplog.text
    assert "Weekly digest" not in caplog.text
    assert API_KEY not in caplog.text


@pytest.mark.parametrize("status", [400, 422])
def test_a_rejected_email_is_permanent_and_carries_the_servers_message(monkeypatch, status):
    _use_http(monkeypatch)
    body = {"success": False, "message": "The 'to' address is not a valid email address."}
    _http(monkeypatch, _reply(status, body))

    with pytest.raises(PermanentEmailError, match="not a valid email address") as caught:
        transport.send(_message())

    assert str(status) in str(caught.value)


@pytest.mark.parametrize("status", [401, 403, 404])
def test_a_refused_account_is_a_misconfiguration_that_waits_and_is_only_warned_about(
    monkeypatch, caplog, status
):
    """A wrong key, a blocked IP or a wrong URL is ours to fix: the email must wait, not be lost.
    Each send warns; the dispatcher logs the one error per run, so Sentry is not flooded."""
    _use_http(monkeypatch)
    body = {"success": False, "message": "Something is wrong with the request."}
    _http(monkeypatch, _reply(status, body))

    with caplog.at_level(logging.WARNING), pytest.raises(EmailMisconfiguredError) as caught:
        transport.send(_message())

    assert not isinstance(caught.value, PermanentEmailError)
    assert str(status) in str(caught.value)
    [record] = _warnings(caplog)
    assert str(status) in record.getMessage()
    assert _errors(caplog) == []
    assert API_KEY not in caplog.text


@pytest.mark.parametrize("status", [429, 500, 503, 302, 409])
def test_throttling_outages_and_anything_unexpected_are_plain_transient(monkeypatch, status):
    _use_http(monkeypatch)
    _http(monkeypatch, _reply(status, {"success": False, "message": "Slow down."}))

    with pytest.raises(TransientEmailError, match=str(status)) as caught:
        transport.send(_message())

    assert not isinstance(caught.value, EmailMisconfiguredError)


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
def test_a_network_failure_is_plain_transient_and_its_message_is_only_the_type(
    monkeypatch, failure
):
    _use_http(monkeypatch)

    def respond(request):
        raise failure

    _http(monkeypatch, respond)

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert not isinstance(caught.value, EmailMisconfiguredError)
    assert str(caught.value) == f"Maileroo could not be reached ({type(failure).__name__})"
    assert caught.value.__cause__ is failure


def test_a_request_error_that_quotes_the_key_reaches_neither_the_message_nor_the_logs(
    monkeypatch, caplog
):
    """h11's LocalProtocolError quotes the Authorization header value, key included."""
    _use_http(monkeypatch)
    failure = httpx.LocalProtocolError(f"Illegal header value b'Bearer {API_KEY}'")

    def respond(request):
        raise failure

    _http(monkeypatch, respond)

    with caplog.at_level(logging.DEBUG), pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert str(caught.value) == "Maileroo could not be reached (LocalProtocolError)"
    assert API_KEY not in caplog.text


@pytest.mark.parametrize(
    ("url", "cause"),
    [
        pytest.param("maileroo.test/api/v2", httpx.UnsupportedProtocol, id="no-scheme"),
        pytest.param("ftp://maileroo.test/api/v2", httpx.UnsupportedProtocol, id="wrong-scheme"),
        pytest.param("https://maileroo.test/api\x00/v2", httpx.InvalidURL, id="control-character"),
    ],
)
def test_an_unusable_api_url_is_a_misconfiguration_not_a_retry_until_the_email_is_lost(
    monkeypatch, caplog, url, cause
):
    """A real httpx client rejects these before it connects, so this needs no network."""
    _use_http(monkeypatch)
    monkeypatch.setattr(settings, "MAILEROO_API_URL", url)

    with caplog.at_level(logging.WARNING), pytest.raises(EmailMisconfiguredError) as caught:
        transport.send(_message())

    assert isinstance(caught.value.__cause__, cause)
    assert "MAILEROO_API_URL" in str(caught.value)
    assert len(_warnings(caplog)) == 1
    assert _errors(caplog) == []


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
    assert isinstance(error, EmailMisconfiguredError)
    assert isinstance(error, TransientEmailError)
    assert isinstance(error, EmailDeliveryError)
    for name in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "MAILEROO_API_KEY"):
        assert name in str(error)


def test_the_error_classes_form_one_tree():
    # Delivery error -> transient -> misconfigured -> not configured, and permanent beside them.
    assert issubclass(TransientEmailError, EmailDeliveryError)
    assert issubclass(PermanentEmailError, EmailDeliveryError)
    assert issubclass(EmailMisconfiguredError, TransientEmailError)
    assert issubclass(EmailNotConfiguredError, EmailMisconfiguredError)
    assert issubclass(EmailNotConfiguredError, RuntimeError)
    assert not issubclass(PermanentEmailError, TransientEmailError)
    assert not issubclass(TransientEmailError, PermanentEmailError)
    assert not issubclass(TransientEmailError, EmailMisconfiguredError)
    assert not issubclass(PermanentEmailError, RuntimeError)
    assert not issubclass(EmailMisconfiguredError, RuntimeError)


SMTP_COMPLETE = {
    "SMTP_HOST": "smtp.example.test",
    "SMTP_USER": "mailer",
    "SMTP_PASSWORD": "s3cret",
}


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
        pytest.param(SMTP_COMPLETE, True, id="smtp"),
        pytest.param({"MAILEROO_API_KEY": API_KEY}, False, id="key-without-sender"),
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, "EMAIL_FROM": "GrepThink"},
            False,
            id="sender-without-address",
        ),
        pytest.param(
            {"SMTP_HOST": "smtp.example.test", "SMTP_USER": "mailer"}, False, id="smtp-no-password"
        ),
        # With a key, send() takes the HTTP path and never falls back to SMTP, so neither does this.
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, **SMTP_COMPLETE}, False, id="key-without-sender-smtp-ok"
        ),
        pytest.param(
            {"MAILEROO_API_KEY": "bad key", "EMAIL_FROM": SENDER, **SMTP_COMPLETE},
            False,
            id="key-with-a-space-smtp-ok",
        ),
        pytest.param(
            {"MAILEROO_API_KEY": API_KEY, "EMAIL_FROM": SENDER, **SMTP_COMPLETE},
            True,
            id="both-complete",
        ),
    ],
)
def test_is_configured_follows_the_path_send_would_take(monkeypatch, values, expected):
    for name, value in values.items():
        monkeypatch.setattr(settings, name, value)

    assert transport.is_configured() is expected


# ── the key is a secret: it never reaches a message, a log or an exception chain ─────────

SECRET = "k3y-must-stay-secret"


@pytest.mark.parametrize(
    "key",
    [
        pytest.param(f"{SECRET}\n", id="trailing-newline"),
        pytest.param(f"{SECRET}\r\n", id="trailing-crlf"),
        pytest.param(f"{SECRET} more", id="inner-space"),
        pytest.param(f"{SECRET}\tmore", id="inner-tab"),
        pytest.param(f"{SECRET}\x00", id="nul"),
        pytest.param(f"{SECRET}\u00e9", id="non-ascii"),
    ],
)
def test_a_key_with_whitespace_or_control_characters_is_not_configured_and_never_quoted(
    monkeypatch, caplog, key
):
    """h11 would refuse such a header value and quote it, key and all, in its error."""
    monkeypatch.setattr(settings, "MAILEROO_API_KEY", key)
    monkeypatch.setattr(settings, "EMAIL_FROM", SENDER)
    seen = _http(monkeypatch, _reply(200, _accepted()))

    with caplog.at_level(logging.DEBUG), pytest.raises(EmailNotConfiguredError) as caught:
        transport.send(_message())

    assert seen == []  # no request was built, let alone sent
    assert "MAILEROO_API_KEY" in str(caught.value)
    assert transport.is_configured() is False
    for text in (str(caught.value), _chain_messages(caught.value), caplog.text):
        assert SECRET not in text


def test_a_key_of_only_spaces_is_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "MAILEROO_API_KEY", "  ")
    monkeypatch.setattr(settings, "EMAIL_FROM", SENDER)
    _http(monkeypatch, _reply(200, _accepted()))

    with pytest.raises(EmailNotConfiguredError):
        transport.send(_message())


def test_the_settings_strip_the_key_and_the_url():
    """Run apart, reloading ``app.config`` here would swap the ``settings`` other tests hold."""
    script = """
import importlib, json, os, sys
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_KEY", "k")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")
import app.config as config
found = []
for key, url in json.loads(sys.argv[1]):
    os.environ["MAILEROO_API_KEY"], os.environ["MAILEROO_API_URL"] = key, url
    importlib.reload(config)
    found.append([config.Settings.MAILEROO_API_KEY, config.Settings.MAILEROO_API_URL])
print(json.dumps(found))
"""
    default = "https://smtp.maileroo.com/api/v2"
    cases = [
        (
            f"  {API_KEY} \n",
            " https://maileroo.test/api/v2/ \n",
            API_KEY,
            "https://maileroo.test/api/v2",
        ),
        (f"\t{API_KEY}", "https://maileroo.test/api/v2//", API_KEY, "https://maileroo.test/api/v2"),
        ("   ", "   ", "", default),
        ("", "", "", default),
    ]
    run = subprocess.run(
        [sys.executable, "-c", script, json.dumps([[key, url] for key, url, _, _ in cases])],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True,
        check=True,
    )

    assert json.loads(run.stdout.strip().splitlines()[-1]) == [[k, u] for _, _, k, u in cases]


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
    # QUIT comes only after sendmail succeeded; close() after that is what ends the socket.
    assert _steps(smtp) == ["ehlo", "starttls", "ehlo", "login", "sendmail", "quit", "close"]
    assert _sendmail(smtp)[1] == SENDER
    assert next(call for call in smtp.calls if call[0] == "login")[1:] == ("mailer", "s3cret")


def test_smtp_checks_the_servers_certificate_and_name(monkeypatch):
    """STARTTLS with a context that refuses an untrusted certificate or a name that does not
    match the host, so the password is never offered to an impostor."""
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    transport.send(_message())

    [context] = smtp.contexts
    assert isinstance(context, ssl.SSLContext)
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert context.check_hostname is True


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


def test_smtp_logs_the_session_with_the_recipient_but_not_the_subject(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch)

    with caplog.at_level(logging.INFO):
        transport.send(_full_message())

    assert "send_email: connecting | host=smtp.example.test port=587 user=mailer" in caplog.text
    assert "bcc_count=1" in caplog.text
    assert "send_email: delivered | to=student@ucsc.edu" in caplog.text
    assert "Weekly digest" not in caplog.text
    assert "s3cret" not in caplog.text


# ── SMTP: Maileroo's relay options ───────────────────────────────────────────────────
#
# On smtp.maileroo.com the API's options travel as headers (Maileroo's "Advanced Message
# Options"): no tracking, our reference id, one X-Tag-<name> per tag. The same header on any other
# host would be noise, and only the relay reports a reference id a bounce webhook can match.

RELAY = "smtp.maileroo.com"


def _relay_headers(monkeypatch, message: EmailMessage, host: str = RELAY):
    _use_smtp(monkeypatch, host=host)
    smtp = _fake_smtp(monkeypatch)
    result = transport.send(message)
    return message_from_string(_sendmail(smtp)[3]), result


def test_the_maileroo_relay_gets_its_options_as_headers_and_reports_our_reference_id(monkeypatch):
    parsed, result = _relay_headers(
        monkeypatch, _message(reference_id=OUR_ID, tags={"kind": "digest", "class_id": "42"})
    )

    assert parsed["X-Maileroo-Track"] == "no"  # student privacy: no open or click tracking
    assert parsed["X-Maileroo-Ref-ID"] == OUR_ID
    assert parsed["X-Tag-kind"] == "digest"
    assert parsed["X-Tag-class_id"] == "42"
    assert result == OUR_ID


@pytest.mark.parametrize("host", [RELAY, " SMTP.Maileroo.COM "])
def test_the_relay_is_recognised_however_the_host_is_written(monkeypatch, host):
    parsed, result = _relay_headers(monkeypatch, _message(reference_id=OUR_ID), host=host)

    assert parsed["X-Maileroo-Track"] == "no"
    assert result == OUR_ID


def test_tracking_is_switched_off_even_when_there_is_nothing_else_to_say(monkeypatch):
    parsed, result = _relay_headers(monkeypatch, _message())

    assert parsed["X-Maileroo-Track"] == "no"
    assert parsed["X-Maileroo-Ref-ID"] is None
    assert result is None


def test_other_smtp_hosts_get_none_of_it_and_report_no_reference_id(monkeypatch):
    parsed, result = _relay_headers(
        monkeypatch,
        _message(reference_id=OUR_ID, tags={"kind": "digest"}),
        host="smtp.example.test",
    )

    for header in ("X-Maileroo-Track", "X-Maileroo-Ref-ID", "X-Tag-kind"):
        assert parsed[header] is None
    assert result is None


@pytest.mark.parametrize(
    "reference_id",
    ["7F3C1E9A1B2D4C5E8F6A0123", "7f3c1e9a1b2d4c5e8f6a012", "7f3c1e9a1b2d4c5e8f6a01234", "x" * 24],
    ids=["uppercase", "too-short", "too-long", "not-hex"],
)
def test_a_reference_id_that_is_not_24_lowercase_hex_is_neither_sent_nor_reported(
    monkeypatch, reference_id
):
    parsed, result = _relay_headers(monkeypatch, _message(reference_id=reference_id))

    assert parsed["X-Maileroo-Ref-ID"] is None
    assert result is None


def test_only_tags_the_relay_accepts_become_headers(monkeypatch):
    tags = {
        "ok-name_1": "fine",
        "exactly": "v" * 768,
        "too-long": "v" * 769,
        "bad key": "x",
        "bad:key": "x",
        "caf\u00e9": "x",
        "": "x",
        "carriage-return": "one\rBcc: x@y.test",
        "line-feed": "one\nBcc: x@y.test",
    }
    parsed, _ = _relay_headers(monkeypatch, _message(tags=tags))

    sent = {name for name in parsed if name.startswith("X-Tag-")}
    assert sent == {"X-Tag-ok-name_1", "X-Tag-exactly"}
    assert len(parsed["X-Tag-exactly"]) == 768


def test_the_relay_options_win_over_the_callers_own_headers(monkeypatch):
    parsed, _ = _relay_headers(monkeypatch, _message(headers={"X-Maileroo-Track": "yes"}))

    assert parsed.get_all("X-Maileroo-Track") == ["no"]


# ── SMTP: the failures ───────────────────────────────────────────────────────────────
#
# Where a failure happens decides what it means. Until ``sendmail`` starts, nothing the server says
# is about the message: it is our login, our settings or the provider's health. A 5xx there is a
# misconfiguration (the email waits, and the dispatcher stops for a while); a 4xx or a dropped
# connection is the provider having a moment. From ``sendmail`` on, a 5xx means the message itself
# was refused (permanent) and a 4xx means try again; a refused sender is our settings again.

# Raised by ``sendmail``: (what smtplib raises, what the transport makes of it).
MESSAGE_FAILURES = [
    pytest.param(
        smtplib.SMTPRecipientsRefused({"a@ucsc.edu": (550, b"no such user")}),
        PermanentEmailError,
        id="recipients-refused-5xx",
    ),
    pytest.param(
        smtplib.SMTPRecipientsRefused(
            {"a@ucsc.edu": (550, b"no such user"), "b@ucsc.edu": (553, b"bad mailbox name")}
        ),
        PermanentEmailError,
        id="every-recipient-refused-5xx",
    ),
    pytest.param(
        smtplib.SMTPRecipientsRefused(
            {"a@ucsc.edu": (550, b"no such user"), "b@ucsc.edu": (450, b"mailbox busy")}
        ),
        TransientEmailError,
        id="one-recipient-refused-4xx",
    ),
    pytest.param(
        smtplib.SMTPRecipientsRefused({"a@ucsc.edu": (450, b"mailbox busy")}),
        TransientEmailError,
        id="recipients-refused-4xx",
    ),
    pytest.param(
        smtplib.SMTPRecipientsRefused({}),
        TransientEmailError,
        id="recipients-refused-no-codes",  # nothing says never, so wait
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(550, b"sender not allowed", SENDER),
        EmailMisconfiguredError,
        id="sender-refused-5xx",  # an unverified From: ours to fix, and every email will hit it
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(552, b"message size exceeds the maximum", SENDER),
        PermanentEmailError,
        id="sender-refused-552",  # too big is the message's fault, not ours
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(553, b"mailbox name not allowed", SENDER),
        EmailMisconfiguredError,
        id="sender-refused-553",  # a sender the server will not accept is ours, like 550
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(554, b"transaction failed", SENDER),
        EmailMisconfiguredError,
        id="sender-refused-554",
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(451, b"try again later", SENDER),
        TransientEmailError,
        id="sender-refused-4xx",
    ),
    pytest.param(
        smtplib.SMTPDataError(550, b"message rejected"), PermanentEmailError, id="data-error-5xx"
    ),
    pytest.param(
        smtplib.SMTPDataError(451, b"try again later"), TransientEmailError, id="data-error-4xx"
    ),
    pytest.param(
        smtplib.SMTPResponseException(554, b"transaction failed"),
        PermanentEmailError,
        id="response-5xx",
    ),
    pytest.param(
        smtplib.SMTPResponseException(500, b"syntax error"),
        PermanentEmailError,
        id="response-500",  # the lowest 5xx is still a 5xx
    ),
    pytest.param(
        smtplib.SMTPRecipientsRefused({"a@ucsc.edu": (500, b"syntax error")}),
        PermanentEmailError,
        id="recipients-refused-500",
    ),
    pytest.param(
        smtplib.SMTPSenderRefused(500, b"syntax error", SENDER),
        EmailMisconfiguredError,
        id="sender-refused-500",
    ),
    pytest.param(
        smtplib.SMTPResponseException(421, b"service not available"),
        TransientEmailError,
        id="response-4xx",
    ),
    pytest.param(
        smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
        TransientEmailError,
        id="disconnected-mid-send",
    ),
]


@pytest.mark.parametrize(("failure", "expected"), MESSAGE_FAILURES)
def test_smtp_message_failures_are_permanent_only_on_a_5xx(monkeypatch, caplog, failure, expected):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch, fail={"sendmail": failure})

    with caplog.at_level(logging.WARNING), pytest.raises(expected) as caught:
        transport.send(_message())

    assert type(caught.value) is expected  # exactly: a misconfiguration is also a transient
    assert caught.value.__cause__ is failure
    assert _errors(caplog) == []
    # Only a misconfiguration is worth a warning: it is the one that repeats for every email.
    assert len(_warnings(caplog)) == (1 if expected is EmailMisconfiguredError else 0)
    # A failure ends the session with close(): a QUIT reply could only replace the real error.
    assert "quit" not in _steps(smtp)
    assert _steps(smtp)[-1] == "close"


# Raised while the session is set up (connect, EHLO, STARTTLS, login): (step, what smtplib
# raises, what the transport makes of it). The message is never at fault, so none is permanent.
SESSION_FAILURES = [
    pytest.param(
        "connect",
        smtplib.SMTPConnectError(554, b"client host blocked"),
        EmailMisconfiguredError,
        id="connect-5xx",
    ),
    pytest.param(
        "connect", smtplib.SMTPConnectError(421, b"too busy"), TransientEmailError, id="connect-4xx"
    ),
    pytest.param(
        "connect", ConnectionRefusedError(61, "refused"), TransientEmailError, id="refused"
    ),
    pytest.param("connect", TimeoutError("timed out"), TransientEmailError, id="timeout"),
    pytest.param(
        "ehlo", smtplib.SMTPHeloError(503, b"bad sequence"), EmailMisconfiguredError, id="helo-5xx"
    ),
    pytest.param("ehlo", smtplib.SMTPHeloError(421, b"busy"), TransientEmailError, id="helo-4xx"),
    pytest.param(
        "ehlo",
        smtplib.SMTPResponseException(550, b"refused"),
        EmailMisconfiguredError,
        id="ehlo-response-5xx",
    ),
    pytest.param(
        "ehlo",
        smtplib.SMTPResponseException(500, b"syntax error"),
        EmailMisconfiguredError,
        id="ehlo-response-500",  # the lowest 5xx is still a 5xx
    ),
    pytest.param(
        "ehlo",
        smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
        TransientEmailError,
        id="ehlo-disconnected",
    ),
    pytest.param(
        "starttls",
        smtplib.SMTPNotSupportedError("STARTTLS extension not supported by server."),
        EmailMisconfiguredError,
        id="no-starttls",
    ),
    pytest.param(
        "starttls",
        smtplib.SMTPResponseException(502, b"command not implemented"),
        EmailMisconfiguredError,
        id="starttls-5xx",
    ),
    pytest.param(
        "starttls",
        smtplib.SMTPResponseException(454, b"TLS not available due to temporary reason"),
        TransientEmailError,
        id="starttls-4xx",
    ),
    pytest.param(
        "starttls",
        ssl.SSLEOFError(8, "EOF occurred in violation of protocol (_ssl.c:1016)"),
        TransientEmailError,
        id="tls-handshake-eof",  # the PROD Sentry event: an OSError, not an SMTPException
    ),
    pytest.param(
        "starttls",
        ssl.SSLCertVerificationError(1, "certificate verify failed"),
        TransientEmailError,
        id="tls-untrusted-certificate",
    ),
    pytest.param(
        "login",
        smtplib.SMTPAuthenticationError(535, b"bad credentials"),
        EmailMisconfiguredError,
        id="authentication",
    ),
    pytest.param(
        "login",
        smtplib.SMTPAuthenticationError(454, b"temporary authentication failure"),
        EmailMisconfiguredError,
        id="authentication-4xx",  # a wrong login is ours to fix whatever the code
    ),
    pytest.param(
        "login",
        smtplib.SMTPNotSupportedError("SMTP AUTH extension not supported by server."),
        EmailMisconfiguredError,
        id="no-auth",
    ),
    pytest.param(
        "login",
        smtplib.SMTPResponseException(550, b"account suspended"),
        EmailMisconfiguredError,
        id="login-5xx",
    ),
    pytest.param(
        "login",
        smtplib.SMTPResponseException(454, b"try later"),
        TransientEmailError,
        id="login-4xx",
    ),
]


@pytest.mark.parametrize(("step", "failure", "expected"), SESSION_FAILURES)
def test_smtp_session_failures_wait_and_a_5xx_is_a_misconfiguration(
    monkeypatch, caplog, step, failure, expected
):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch, fail={step: failure})

    with caplog.at_level(logging.WARNING), pytest.raises(expected) as caught:
        transport.send(_message())

    assert type(caught.value) is expected  # exactly: a misconfiguration is also a transient
    assert caught.value.__cause__ is failure
    assert _errors(caplog) == []
    assert len(_warnings(caplog)) == (1 if expected is EmailMisconfiguredError else 0)
    assert "s3cret" not in caplog.text
    assert "s3cret" not in str(caught.value)
    # The message was never offered, and the session is ended with close(), not QUIT.
    assert "sendmail" not in _steps(smtp)
    assert "quit" not in _steps(smtp)


def test_a_failed_login_is_a_warning_and_never_shows_the_password(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch, fail={"login": smtplib.SMTPAuthenticationError(535, b"bad")})

    with caplog.at_level(logging.WARNING), pytest.raises(EmailMisconfiguredError):
        transport.send(_message())

    [record] = _warnings(caplog)
    assert "SMTP_PASSWORD" in record.getMessage()
    assert _errors(caplog) == []
    assert "s3cret" not in caplog.text


@pytest.mark.parametrize(
    ("failure", "expected"),
    [
        pytest.param(
            smtplib.SMTPConnectError(554, b"client host blocked"),
            EmailMisconfiguredError,
            id="connect-error-5xx",
        ),
        pytest.param(
            smtplib.SMTPConnectError(421, b"too busy"), TransientEmailError, id="connect-error-4xx"
        ),
        pytest.param(
            smtplib.SMTPHeloError(503, b"bad sequence"), EmailMisconfiguredError, id="helo-error"
        ),
        pytest.param(
            smtplib.SMTPNotSupportedError("SMTPUTF8 not supported by server"),
            EmailMisconfiguredError,
            id="not-supported",
        ),
    ],
)
def test_the_session_error_classes_count_as_the_servers_problem_even_while_sending(
    monkeypatch, failure, expected
):
    """They describe the server, not the message, so their class decides, not the stage."""
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch, fail={"sendmail": failure})

    with pytest.raises(expected) as caught:
        transport.send(_message())

    assert type(caught.value) is expected
    assert caught.value.__cause__ is failure


@pytest.mark.parametrize(
    "failure",
    [
        smtplib.SMTPResponseException(250, b"2.0.0 not a goodbye"),
        smtplib.SMTPServerDisconnected("Connection unexpectedly closed"),
        ConnectionResetError(54, "Connection reset by peer"),
    ],
    ids=["odd-reply-to-quit", "disconnected", "reset"],
)
def test_a_failure_saying_goodbye_after_delivery_is_not_a_failure(monkeypatch, caplog, failure):
    """The server already has the message: raising would make the caller send it a second time."""
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch, fail={"quit": failure})

    with caplog.at_level(logging.INFO):
        assert transport.send(_message()) is None

    assert _steps(smtp) == ["ehlo", "starttls", "ehlo", "login", "sendmail", "quit", "close"]
    assert "accepted the message" in caplog.text
    assert "send_email: delivered | to=student@ucsc.edu" in caplog.text


def test_a_close_that_fails_never_hides_the_real_error(monkeypatch):
    _use_smtp(monkeypatch)
    failure = smtplib.SMTPDataError(550, b"message rejected")
    _fake_smtp(monkeypatch, fail={"sendmail": failure, "close": OSError("bad file descriptor")})

    with pytest.raises(PermanentEmailError) as caught:
        transport.send(_message())

    assert caught.value.__cause__ is failure


def test_a_close_that_fails_after_delivery_is_not_a_failure(monkeypatch):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch, fail={"close": OSError("bad file descriptor")})

    assert transport.send(_message()) is None


# ── SMTP: what sendmail returns when only some recipients were refused ───────────────


def test_a_refused_main_recipient_is_permanent_even_though_the_others_got_the_message(
    monkeypatch,
):
    """cc and bcc already have it, so a retry would send it to them again."""
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch, refused={"student@ucsc.edu": (550, b"no such user")})

    with pytest.raises(PermanentEmailError) as caught:
        transport.send(_full_message())

    assert type(caught.value) is PermanentEmailError
    assert "student" not in str(caught.value)
    # The server took the message, so the session still ends politely.
    assert _steps(smtp)[-2:] == ["quit", "close"]


def test_refused_cc_and_bcc_are_a_warning_with_the_count_only(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(
        monkeypatch,
        refused={"ta@ucsc.edu": (550, b"no such user"), "audit@grepthink.test": (550, b"gone")},
    )

    with caplog.at_level(logging.WARNING):
        assert transport.send(_full_message()) is None

    [record] = _warnings(caplog)
    assert "2" in record.getMessage()
    for address in ("ta@ucsc.edu", "audit@grepthink.test", "student@ucsc.edu"):
        assert address not in record.getMessage()
    assert _errors(caplog) == []


def test_nothing_refused_is_no_warning(monkeypatch, caplog):
    _use_smtp(monkeypatch)
    _fake_smtp(monkeypatch)

    with caplog.at_level(logging.WARNING):
        transport.send(_full_message())

    assert _warnings(caplog) == []


# ── SMTP: addresses and settings smtplib cannot carry ────────────────────────────────

NON_ASCII = "jos\u00e9@ucsc.edu"


@pytest.mark.parametrize("field", ["to", "cc", "bcc", "reply_to"])
def test_a_non_ascii_address_is_permanent_before_smtp_connects_and_is_never_quoted(
    monkeypatch, caplog, field
):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)
    value = NON_ASCII if field in ("to", "reply_to") else (NON_ASCII,)

    with caplog.at_level(logging.DEBUG), pytest.raises(PermanentEmailError) as caught:
        transport.send(_message(**{field: value}))

    assert str(caught.value) == "address is not ASCII"
    assert "jos" not in _chain_messages(caught.value) + caplog.text
    assert smtp.connections == []


def test_the_http_path_leaves_non_ascii_addresses_to_the_provider(monkeypatch):
    _use_http(monkeypatch)
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message(to=NON_ASCII))

    assert json.loads(seen[0].content)["to"] == [{"address": NON_ASCII}]


def test_a_non_ascii_character_smtplib_chokes_on_while_sending_is_permanent(monkeypatch, caplog):
    """The backstop for what the address check cannot see. smtplib's UnicodeEncodeError is a
    ValueError, not an SMTPException, and quotes the text."""
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(
        monkeypatch,
        fail={
            "sendmail": UnicodeEncodeError("ascii", NON_ASCII, 3, 4, "ordinal not in range(128)")
        },
    )

    with caplog.at_level(logging.DEBUG), pytest.raises(PermanentEmailError) as caught:
        transport.send(_message())

    assert str(caught.value) == "address is not ASCII"
    assert caught.value.__cause__ is None
    assert "jos" not in _chain_messages(caught.value) + caplog.text
    assert "quit" not in _steps(smtp)


def test_a_non_ascii_smtp_setting_is_a_misconfiguration_and_is_never_quoted(monkeypatch, caplog):
    """A non-ASCII password fails inside ``login``, and that is ours to fix, not the email's."""
    _use_smtp(monkeypatch)
    _fake_smtp(
        monkeypatch,
        fail={"login": UnicodeEncodeError("ascii", "p\u00e4ss", 1, 2, "ordinal not in range(128)")},
    )

    with caplog.at_level(logging.DEBUG), pytest.raises(EmailMisconfiguredError) as caught:
        transport.send(_message())

    assert type(caught.value) is EmailMisconfiguredError
    assert "SMTP_PASSWORD" in str(caught.value)
    assert "\u00e4" not in _chain_messages(caught.value) + caplog.text


def test_an_smtp_sender_without_an_address_is_a_misconfiguration_that_never_connects(
    monkeypatch, caplog
):
    """``SMTP_USER=resend`` and no SMTP_FROM would send "From: resend": the provider refuses every
    email, so say so once instead of trying each."""
    _use_smtp(monkeypatch, user="resend")
    monkeypatch.setattr(settings, "SMTP_FROM", "")
    smtp = _fake_smtp(monkeypatch)

    with caplog.at_level(logging.WARNING), pytest.raises(EmailMisconfiguredError) as caught:
        transport.send(_message())

    assert type(caught.value) is EmailMisconfiguredError
    assert "EMAIL_FROM" in str(caught.value)
    assert len(_warnings(caplog)) == 1
    assert smtp.connections == []


def test_a_non_ascii_smtp_sender_is_a_misconfiguration_not_a_permanent_failure(monkeypatch, caplog):
    """compat32 would encode the whole From value, address included, leaving no address in it.
    It is a setting: every email would hit it, so none may be dropped as permanent."""
    _use_smtp(monkeypatch)
    monkeypatch.setattr(settings, "SMTP_FROM", "Gr\u00e9pthink <noreply@grepthink.test>")
    smtp = _fake_smtp(monkeypatch)

    with caplog.at_level(logging.WARNING), pytest.raises(EmailMisconfiguredError) as caught:
        transport.send(_message())

    assert type(caught.value) is EmailMisconfiguredError
    assert "pthink" not in str(caught.value)
    assert smtp.connections == []


def test_the_http_path_takes_a_non_ascii_sender_name(monkeypatch):
    _use_http(monkeypatch, sender="Gr\u00e9pthink <noreply@grepthink.test>")
    seen = _http(monkeypatch, _reply(200, _accepted()))

    transport.send(_message())

    assert json.loads(seen[0].content)["from"] == {
        "address": "noreply@grepthink.test",
        "display_name": "Gr\u00e9pthink",
    }


# ── header injection ─────────────────────────────────────────────────────────────────
#
# A subject can carry a person's name (a contact-form subject does), and names stay out of logs
# and exception messages: nothing can scrub them. So no path may put a subject, header or address
# in an error, in a log, or in the chain behind an error, and a line break is refused up front.

PERSON = "Ada Lovelace"

LINE_BREAKS = [
    pytest.param({"subject": f"Hello {PERSON}\r\nBcc: x@y.test"}, id="subject-crlf"),
    pytest.param({"subject": f"Hello {PERSON}\nBcc: x@y.test"}, id="subject-lf"),
    pytest.param({"subject": f"Hello {PERSON}\rBcc: x@y.test"}, id="subject-cr"),
    pytest.param({"headers": {"X-Note": f"{PERSON}\nBcc: x@y.test"}}, id="header-value"),
    pytest.param({"headers": {f"X-{PERSON}\r\nBcc": "v"}}, id="header-name"),
    pytest.param({"reply_to": f"{PERSON}@ucsc.edu\r\nBcc: x@y.test"}, id="reply-to"),
    pytest.param({"to": f"{PERSON}@ucsc.edu\r\nBcc: x@y.test"}, id="to"),
    pytest.param({"cc": (f"{PERSON}@ucsc.edu\nx",)}, id="cc"),
    pytest.param({"bcc": (f"{PERSON}@ucsc.edu\nx",)}, id="bcc"),
]


@pytest.mark.parametrize("fields", LINE_BREAKS)
@pytest.mark.parametrize("path", ["http", "smtp"])
def test_a_line_break_in_a_header_is_permanent_on_both_paths_and_nothing_is_quoted(
    monkeypatch, caplog, path, fields
):
    if path == "http":
        _use_http(monkeypatch)
        contacted = _http(monkeypatch, _reply(200, _accepted()))
    else:
        _use_smtp(monkeypatch)
        contacted = _fake_smtp(monkeypatch).connections

    with caplog.at_level(logging.DEBUG), pytest.raises(PermanentEmailError) as caught:
        transport.send(_message(**fields))

    error = caught.value
    assert str(error) == "header contains a line break"
    assert error.__cause__ is None
    assert PERSON not in _chain_messages(error) + caplog.text
    assert contacted == []  # refused before anything was built or sent


@pytest.mark.parametrize(
    "failure",
    [
        HeaderParseError(f"header value appears to contain an embedded header: {PERSON}"),
        ValueError(f"Header field name contains invalid characters: {PERSON!r}"),
    ],
    ids=["header-parse-error", "value-error"],
)
def test_a_message_that_cannot_be_serialised_is_permanent_and_its_chain_is_cut(
    monkeypatch, caplog, failure
):
    _use_smtp(monkeypatch)
    smtp = _fake_smtp(monkeypatch)

    def cannot_serialise(*args, **kwargs):
        raise failure

    monkeypatch.setattr(transport, "_mime", cannot_serialise)

    with caplog.at_level(logging.DEBUG), pytest.raises(PermanentEmailError) as caught:
        transport.send(_message())

    error = caught.value
    assert str(error) == f"The email cannot be serialised ({type(failure).__name__})"
    assert error.__cause__ is None
    assert error.__suppress_context__ is True  # raised `from None`
    assert PERSON not in _chain_messages(error) + caplog.text
    assert smtp.connections == []


def _http_answers(status: int, body=None):
    def arrange(monkeypatch):
        _use_http(monkeypatch)
        _http(monkeypatch, _reply(status, body))

    return arrange


def _smtp_fails(**fail: Exception):
    def arrange(monkeypatch):
        _use_smtp(monkeypatch)
        _fake_smtp(monkeypatch, fail=fail)

    return arrange


@pytest.mark.parametrize(
    "arrange",
    [
        pytest.param(_http_answers(200, _accepted()), id="http-accepted"),
        pytest.param(
            _http_answers(400, {"success": False, "message": "Invalid recipient."}), id="http-400"
        ),
        pytest.param(
            _http_answers(401, {"success": False, "message": "Invalid key."}), id="http-401"
        ),
        pytest.param(_http_answers(503), id="http-503"),
        pytest.param(_smtp_fails(), id="smtp-delivered"),
        pytest.param(_smtp_fails(connect=smtplib.SMTPConnectError(554, b"x")), id="smtp-connect"),
        pytest.param(
            _smtp_fails(login=smtplib.SMTPAuthenticationError(535, b"x")), id="smtp-login"
        ),
        pytest.param(_smtp_fails(sendmail=smtplib.SMTPDataError(550, b"x")), id="smtp-data"),
        pytest.param(
            _smtp_fails(sendmail=smtplib.SMTPRecipientsRefused({"a@ucsc.edu": (550, b"x")})),
            id="smtp-recipients",
        ),
        pytest.param(
            _smtp_fails(quit=smtplib.SMTPResponseException(250, b"x")), id="smtp-quit-after-send"
        ),
    ],
)
def test_no_path_puts_the_subject_in_an_error_or_a_log(monkeypatch, caplog, arrange):
    arrange(monkeypatch)

    with caplog.at_level(logging.DEBUG):
        try:
            transport.send(_message(subject=f"New contact message from {PERSON}"))
        except EmailDeliveryError as error:
            assert PERSON not in _chain_messages(error)

    assert PERSON not in caplog.text


# ── the real smtplib, against a scripted server ──────────────────────────────────────
#
# The fake above answers as we tell it to. These tests run the real ``smtplib`` against a small
# SMTP server in a thread on 127.0.0.1 (an ephemeral port, started and stopped per test) with real
# STARTTLS on a throwaway certificate, for what the fake can only imitate: what ``sendmail``
# returns for a partial refusal, what QUIT does after a failure, what a non-ASCII address does, and
# whether the certificate is really checked.


@pytest.fixture(scope="module")
def tls_files(tmp_path_factory):
    """A throwaway self-signed certificate for 127.0.0.1, written as PEM files."""
    directory = tmp_path_factory.mktemp("smtp-tls")
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    now = datetime.datetime.now(datetime.UTC)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(minutes=5))
        .not_valid_after(now + datetime.timedelta(hours=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_cert_sign=True,
                content_commitment=False,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
        .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
        .sign(key, hashes.SHA256())
    )
    files = SimpleNamespace(cert=directory / "cert.pem", key=directory / "key.pem")
    files.cert.write_bytes(certificate.public_bytes(serialization.Encoding.PEM))
    files.key.write_bytes(
        key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    return files


class ScriptedSmtp:
    """An SMTP server that answers from a script. The attributes are the script (a reply line for
    each step, or None to hang up instead of answering QUIT); ``commands`` and ``delivered``
    record what it saw."""

    def __init__(self, tls_files):
        self.certificate = tls_files.cert
        self.greeting = "220 scripted ESMTP"
        self.auth_reply = "235 2.7.0 accepted"
        self.mail_reply = "250 2.1.0 ok"
        self.rcpt_replies: dict[str, str] = {}  # address -> reply; any other address is accepted
        self.data_reply = "250 2.0.0 queued"
        self.quit_reply: str | None = "221 2.0.0 bye"
        self.commands: list[str] = []
        self.delivered: list[str] = []
        self.connections = 0
        self._finished = 0
        self._tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        self._tls.load_cert_chain(tls_files.cert, tls_files.key)

        scripted = self

        class Handler(socketserver.BaseRequestHandler):
            def handle(self):
                scripted._serve(self.request)

            def finish(self):
                scripted._finished += 1

        class Server(socketserver.ThreadingTCPServer):
            daemon_threads = True

            def handle_error(self, request, client_address):
                pass  # a client that hangs up mid-conversation is part of the script

        self._server = Server(("127.0.0.1", 0), Handler)
        self.port = self._server.server_address[1]
        threading.Thread(
            target=self._server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True
        ).start()

    def verbs(self) -> list[str]:
        return [line.split(" ", 1)[0].upper() for line in self.commands]

    def wait_idle(self) -> None:
        """Wait until every connection has been seen through, so ``commands`` is complete."""
        deadline = time.monotonic() + 5
        while self._finished < self.connections and time.monotonic() < deadline:
            time.sleep(0.005)

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()

    def _serve(self, sock) -> None:
        self.connections += 1
        sock.settimeout(10)
        conn, reader, encrypted = sock, sock.makefile("rb"), False

        def reply(line: str) -> None:
            conn.sendall(f"{line}\r\n".encode())

        try:
            reply(self.greeting)
            if not self.greeting.startswith("220"):
                return
            while line := reader.readline():
                text = line.decode("ascii", "replace").rstrip("\r\n")
                self.commands.append(text)
                verb = text.split(" ", 1)[0].upper()
                if verb == "EHLO":
                    reply("250-scripted")
                    reply("250 AUTH PLAIN" if encrypted else "250 STARTTLS")
                elif verb == "STARTTLS":
                    reply("220 2.0.0 ready")
                    conn = self._tls.wrap_socket(conn, server_side=True)
                    reader, encrypted = conn.makefile("rb"), True
                elif verb == "AUTH":
                    reply(self.auth_reply)
                elif verb == "MAIL":
                    reply(self.mail_reply)
                elif verb == "RCPT":
                    address = text.split(":", 1)[1].strip().strip("<>")
                    reply(self.rcpt_replies.get(address, "250 2.1.5 ok"))
                elif verb == "DATA":
                    reply("354 go ahead")
                    body = []
                    while (chunk := reader.readline()) not in (b".\r\n", b""):
                        body.append(chunk)
                    reply(self.data_reply)
                    if self.data_reply.startswith("2"):
                        self.delivered.append(b"".join(body).decode("utf-8", "replace"))
                elif verb == "QUIT":
                    if self.quit_reply is not None:
                        reply(self.quit_reply)
                    return
                else:
                    reply("502 5.5.1 not implemented")
        except OSError:  # includes a client that rejects our certificate and hangs up
            return


@pytest.fixture
def smtp_server(tls_files):
    server = ScriptedSmtp(tls_files)
    yield server
    server.close()


def _use_scripted_smtp(monkeypatch, server: ScriptedSmtp, *, trusted: bool = True) -> None:
    """Point the transport at ``server``. ``trusted`` makes its self-signed certificate count as
    valid; without it the transport's own default context (which has no such trust) is used."""
    _use_smtp(monkeypatch, host="127.0.0.1")
    monkeypatch.setattr(settings, "SMTP_PORT", server.port)
    if trusted:

        def trusting_context():
            context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)  # verifies the certificate and name
            context.load_verify_locations(cafile=str(server.certificate))
            return context

        monkeypatch.setattr(transport.ssl, "create_default_context", trusting_context)


def test_real_smtp_delivers_over_starttls_then_login_then_the_message(monkeypatch, smtp_server):
    _use_scripted_smtp(monkeypatch, smtp_server)

    assert transport.send(_full_message()) is None

    smtp_server.wait_idle()
    # Login happens only after the session is encrypted, and QUIT only after the message.
    assert smtp_server.verbs() == (
        ["EHLO", "STARTTLS", "EHLO", "AUTH", "MAIL"] + ["RCPT"] * 4 + ["DATA", "QUIT"]
    )
    auth = next(line for line in smtp_server.commands if line.upper().startswith("AUTH"))
    assert base64.b64decode(auth.split()[-1]) == b"\0mailer\0s3cret"
    recipients = [
        line.split(":", 1)[1].strip("<> ")
        for line in smtp_server.commands
        if line.upper().startswith("RCPT")
    ]
    assert recipients == [
        "student@ucsc.edu",
        "ta@ucsc.edu",
        "prof@ucsc.edu",
        "audit@grepthink.test",
    ]
    [raw] = smtp_server.delivered
    delivered = message_from_string(raw)
    assert delivered["Subject"] == "Weekly digest"
    assert delivered["Cc"] == "ta@ucsc.edu, prof@ucsc.edu"
    assert delivered["Bcc"] is None


def test_real_smtp_refuses_an_untrusted_certificate_before_the_password_is_sent(
    monkeypatch, smtp_server
):
    _use_scripted_smtp(monkeypatch, smtp_server, trusted=False)

    with pytest.raises(TransientEmailError) as caught:
        transport.send(_message())

    assert type(caught.value) is TransientEmailError
    assert isinstance(caught.value.__cause__, ssl.SSLCertVerificationError)
    smtp_server.wait_idle()
    # The handshake failed: no login and no message were ever offered to the impostor.
    assert smtp_server.verbs() == ["EHLO", "STARTTLS"]


def test_real_smtp_a_reply_to_quit_cannot_replace_the_real_error(monkeypatch, smtp_server):
    """smtplib's own ``with`` block sends QUIT even after a failure and raises on any reply but
    221, which would hide the rejection behind it (and read as a retryable 250)."""
    smtp_server.data_reply = "554 5.7.1 message rejected"
    smtp_server.quit_reply = "250 2.0.0 not a goodbye"
    _use_scripted_smtp(monkeypatch, smtp_server)

    with pytest.raises(PermanentEmailError) as caught:
        transport.send(_message())

    assert isinstance(caught.value.__cause__, smtplib.SMTPDataError)
    smtp_server.wait_idle()
    assert "QUIT" not in smtp_server.verbs()


def test_real_smtp_a_hang_up_at_quit_after_delivery_is_not_a_failure(
    monkeypatch, caplog, smtp_server
):
    smtp_server.quit_reply = None
    _use_scripted_smtp(monkeypatch, smtp_server)

    with caplog.at_level(logging.WARNING):
        assert transport.send(_message()) is None

    smtp_server.wait_idle()
    assert len(smtp_server.delivered) == 1
    assert "accepted the message" in caplog.text


def test_real_smtp_a_refused_main_recipient_is_permanent_though_the_others_got_the_message(
    monkeypatch, smtp_server
):
    smtp_server.rcpt_replies = {"student@ucsc.edu": "550 5.1.1 no such user"}
    _use_scripted_smtp(monkeypatch, smtp_server)

    with pytest.raises(PermanentEmailError) as caught:
        transport.send(_full_message())

    assert "student" not in str(caught.value)
    smtp_server.wait_idle()
    assert len(smtp_server.delivered) == 1  # cc and bcc have it: a retry would send it again
    assert smtp_server.verbs()[-1] == "QUIT"  # the server took the message: a polite goodbye


def test_real_smtp_refused_cc_and_bcc_are_a_warning_with_the_count_only(
    monkeypatch, caplog, smtp_server
):
    smtp_server.rcpt_replies = {
        "ta@ucsc.edu": "550 5.1.1 no such user",
        "audit@grepthink.test": "550 5.1.1 no such user",
    }
    _use_scripted_smtp(monkeypatch, smtp_server)

    with caplog.at_level(logging.WARNING):
        assert transport.send(_full_message()) is None

    smtp_server.wait_idle()
    assert len(smtp_server.delivered) == 1
    [record] = _warnings(caplog)
    assert "2" in record.getMessage()
    assert "@" not in record.getMessage()


def test_real_smtp_a_non_ascii_address_that_got_past_the_check_is_still_permanent(
    monkeypatch, caplog, smtp_server
):
    """The backstop. The address check normally stops this before connecting; with it out of the
    way, the real smtplib fails halfway through with a UnicodeEncodeError that quotes the text."""
    _use_scripted_smtp(monkeypatch, smtp_server)
    monkeypatch.setattr(transport, "_check_smtp_addresses", lambda message, sender: None)

    with caplog.at_level(logging.DEBUG), pytest.raises(PermanentEmailError) as caught:
        transport.send(_message(to=NON_ASCII))

    assert str(caught.value) == "address is not ASCII"
    assert caught.value.__cause__ is None
    assert "jos" not in _chain_messages(caught.value)
    # (The INFO line "connecting | to=..." names the recipient by design; nothing louder may.)
    assert all("jos" not in r.getMessage() for r in caplog.records if r.levelno >= logging.WARNING)
    smtp_server.wait_idle()
    assert "QUIT" not in smtp_server.verbs()
    assert smtp_server.delivered == []


@pytest.mark.parametrize(
    ("script", "expected"),
    [
        pytest.param(
            {"greeting": "554 5.3.2 no service"}, EmailMisconfiguredError, id="greeting-5xx"
        ),
        pytest.param(
            {"greeting": "421 4.3.2 shutting down"}, TransientEmailError, id="greeting-4xx"
        ),
        pytest.param(
            {"auth_reply": "535 5.7.8 bad credentials"}, EmailMisconfiguredError, id="login-refused"
        ),
        pytest.param(
            {"mail_reply": "550 5.7.1 sender not allowed"},
            EmailMisconfiguredError,
            id="sender-5xx",
        ),
        pytest.param(
            {"mail_reply": "552 5.3.4 message too big"}, PermanentEmailError, id="sender-552"
        ),
        pytest.param(
            {"mail_reply": "451 4.3.0 try again later"}, TransientEmailError, id="sender-4xx"
        ),
        pytest.param({"data_reply": "554 5.6.0 rejected"}, PermanentEmailError, id="data-5xx"),
        pytest.param(
            {"data_reply": "451 4.3.0 try again later"}, TransientEmailError, id="data-4xx"
        ),
        pytest.param(
            {"rcpt_replies": {"student@ucsc.edu": "550 5.1.1 no such user"}},
            PermanentEmailError,
            id="the-only-recipient-refused-5xx",
        ),
        pytest.param(
            {"rcpt_replies": {"student@ucsc.edu": "450 4.2.0 mailbox busy"}},
            TransientEmailError,
            id="the-only-recipient-refused-4xx",
        ),
    ],
)
def test_real_smtp_replies_are_classified_like_the_fakes(
    monkeypatch, caplog, smtp_server, script, expected
):
    for name, value in script.items():
        setattr(smtp_server, name, value)
    _use_scripted_smtp(monkeypatch, smtp_server)

    with caplog.at_level(logging.WARNING), pytest.raises(expected) as caught:
        transport.send(_message())

    assert type(caught.value) is expected
    smtp_server.wait_idle()
    assert "QUIT" not in smtp_server.verbs()  # nothing was delivered, so no goodbye either
    assert len(_warnings(caplog)) == (1 if expected is EmailMisconfiguredError else 0)


# ── reference ids ────────────────────────────────────────────────────────────────────

ROW = "7f3c1e9a-1b2d-4c5e-8f6a-0123456789ab"


def test_reference_id_for_is_a_24_digit_hash_of_the_row_and_the_attempt():
    assert transport.reference_id_for(ROW) == hashlib.sha256(f"{ROW}:0".encode()).hexdigest()[:24]
    assert (
        transport.reference_id_for(ROW, 3) == hashlib.sha256(f"{ROW}:3".encode()).hexdigest()[:24]
    )


def test_reference_id_for_is_stable_but_new_for_every_attempt_and_row():
    """A retry after an ambiguous failure must not reuse an id Maileroo may already know."""
    ids = [transport.reference_id_for(ROW, attempt) for attempt in range(5)]

    assert ids == [transport.reference_id_for(ROW, attempt) for attempt in range(5)]
    assert len(set(ids)) == 5
    assert transport.reference_id_for(ROW) == transport.reference_id_for(ROW, 0)
    assert transport.reference_id_for(ROW, 1) != transport.reference_id_for(str(uuid.uuid4()), 1)


def test_reference_id_for_fits_maileroos_format_for_any_row_and_attempt():
    for attempt in range(4):
        for _ in range(10):
            assert re.fullmatch(
                r"[0-9a-f]{24}", transport.reference_id_for(str(uuid.uuid4()), attempt)
            )


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
    # The cause may be a missing sender or key, so the answer does not send anyone to SMTP_*.
    assert caught.value.detail == "Email delivery is not configured on this server."
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
