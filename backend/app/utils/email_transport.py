"""Email transport: hand one message to a mail provider and say how a failure should be treated.

``send`` uses Maileroo's HTTP API when ``MAILEROO_API_KEY`` is set and SMTP otherwise. Whichever
it uses, a failure to deliver leaves as an ``EmailDeliveryError`` of one of three kinds:

* ``PermanentEmailError``: never retry (a bad address, a body the provider rejects).
* ``EmailMisconfiguredError``: the provider refused *us*, not the message (a wrong key, URL or IP,
  a failed login, an unverified sender). Nothing is wrong with the email, so it waits until the
  settings are fixed instead of being thrown away, and a dispatcher should stop for a while rather
  than fail one email after another. The transport only warns about these: the dispatcher logs the
  one error per run, which keeps Sentry from filling with one per email. ``EmailNotConfiguredError``
  is the case of no usable settings at all, and is also a ``RuntimeError`` so that callers written
  before the transport (``except RuntimeError``) keep working.
* ``TransientEmailError``: anything else that may clear by itself (timeouts, an unreachable or
  overloaded provider, throttling): try again later.

Nothing secret goes into an exception message or a log line (the API key, the SMTP password), and
neither does any subject, header or body text: a contact-form subject carries a person's name, and
names cannot be scrubbed.
"""

from __future__ import annotations

import contextlib
import hashlib
import logging
import re
import smtplib
import ssl
from collections.abc import Mapping
from dataclasses import dataclass, field
from email.errors import MessageError
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import parseaddr

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_RESEND_SMTP_HOST = "smtp.resend.com"
_RESEND_SMTP_USER = "resend"

# Maileroo's SMTP relay takes the API's options as headers ("Advanced Message Options").
_MAILEROO_RELAY_HOST = "smtp.maileroo.com"
_REFERENCE_ID = re.compile(r"[0-9a-f]{24}")
_TAG_NAME = re.compile(r"[A-Za-z0-9_-]+")
_TAG_VALUE_LIMIT = 768

# How much of a provider's answer goes into an exception message (and from there into logs).
_DETAIL_LIMIT = 300

_NOT_CONFIGURED = (
    "Email delivery is not configured. Set MAILEROO_API_KEY (and EMAIL_FROM), or SMTP_HOST, "
    "SMTP_USER and SMTP_PASSWORD, in .env to enable it."
)
_NO_SENDER = (
    "MAILEROO_API_KEY is set but there is no usable sender address. Set EMAIL_FROM (or "
    "SMTP_FROM) to an address such as 'GrepThink <noreply@your-domain>'."
)


@dataclass(frozen=True)
class EmailMessage:
    """One email, in the terms both transports understand.

    ``tags`` and ``reference_id`` are Maileroo's: its API takes them as fields, its SMTP relay
    (smtp.maileroo.com) as headers, and any other SMTP server ignores them.
    ``reference_id`` must be 24 lowercase hex digits (see ``reference_id_for``).
    """

    to: str
    subject: str
    text: str
    html: str | None = None
    cc: tuple[str, ...] = ()
    bcc: tuple[str, ...] = ()
    reply_to: str | None = None
    headers: Mapping[str, str] = field(default_factory=dict)
    tags: Mapping[str, str] = field(default_factory=dict)
    reference_id: str | None = None


class EmailDeliveryError(Exception):
    """The provider did not take the email."""


class TransientEmailError(EmailDeliveryError):
    """Retry later."""


class PermanentEmailError(EmailDeliveryError):
    """Never retry."""


class EmailMisconfiguredError(TransientEmailError):
    """The provider refused us, not the message: a wrong key, URL or IP, a failed login, an
    unverified sender. Nothing is wrong with the email, so it waits until the settings are fixed,
    and whoever sends in bulk should stop for a while rather than fail one email after another."""


class EmailNotConfiguredError(EmailMisconfiguredError, RuntimeError):
    """No provider (or no usable sender or key) is configured. A ``RuntimeError`` too, so that
    callers written before the transport (``except RuntimeError``) keep working."""


def send(message: EmailMessage) -> str | None:
    """Deliver ``message``. Returns the provider's reference id when it reports one (over HTTP, or
    over SMTP on smtp.maileroo.com), else ``None``.

    Raises:
        PermanentEmailError: this email will never be accepted (a bad address, a line break in a
            header, a body the provider rejects).
        EmailMisconfiguredError: the provider refused us, not the message; its subclass
            ``EmailNotConfiguredError`` when there is nothing usable configured at all.
        TransientEmailError: try again later.
    """
    _reject_line_breaks(message)
    if settings.MAILEROO_API_KEY:
        return _send_http(message)
    return _send_smtp(message)


def reference_id_for(row_id: str, attempt: int = 0) -> str:
    """A 24-hex-digit ``reference_id`` for one delivery attempt of an outbox row.

    An attempt whose outcome we never learned (a timeout after Maileroo accepted the email) may
    have left an id Maileroo already knows and may refuse a second time, so a retry gets a new one.
    The same row and attempt always give the same id. Maileroo reports the id in its webhook
    events, so an event can be matched back to its attempt.
    """
    return hashlib.sha256(f"{row_id}:{attempt}".encode()).hexdigest()[:24]


def is_configured() -> bool:
    """Whether ``send`` has what it needs, on the path it would take.

    With an API key that is the HTTP path and nothing else (``send`` never falls back to SMTP), so
    it needs a usable key and sender; without one, it needs all of SMTP.
    """
    if settings.MAILEROO_API_KEY:
        return _is_header_safe(settings.MAILEROO_API_KEY) and _http_sender() is not None
    return _smtp_configured()


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


def _reject_line_breaks(message: EmailMessage) -> None:
    """Refuse a message with a CR or LF in its subject, addresses or headers.

    Each becomes a line of the message, so a line break would let whoever wrote the text add
    headers of their own (a Bcc, say). It is checked here so that both paths answer the same,
    before anything is built, and the text is never echoed: a subject can carry a name.
    """
    fields = [
        message.to,
        message.subject,
        message.reply_to or "",
        *message.cc,
        *message.bcc,
        *message.headers,
        *message.headers.values(),
    ]
    if any("\r" in text or "\n" in text for text in fields):
        raise PermanentEmailError("header contains a line break")


def _misconfigured(summary: str) -> EmailMisconfiguredError:
    """A refusal that is about us, not the message. Warned about here; the dispatcher raises the
    one error per run."""
    logger.warning("email_transport: %s", summary)
    return EmailMisconfiguredError(summary)


# ── Maileroo HTTP API ────────────────────────────────────────────────────────────────


def _http_client() -> httpx.Client:
    """A new client for one send, which the caller closes. Tests swap this for a MockTransport."""
    return httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0))


def _is_header_safe(value: str) -> bool:
    """Printable ASCII with no whitespace: safe to send as a header value as it is."""
    return value.isascii() and value.isprintable() and not any(ch.isspace() for ch in value)


def _http_sender() -> dict[str, str] | None:
    """The API's ``from`` object, or ``None`` when no sender address is configured.

    ``parseaddr("GrepThink")`` returns that text as the "address", so a value with no ``@`` counts
    as missing: sent on, Maileroo would answer 400 to every email, and each would be dropped.
    """
    display_name, address = parseaddr(settings.EMAIL_FROM or settings.SMTP_FROM)
    if "@" not in address:
        return None
    sender = {"address": address}
    if display_name:
        sender["display_name"] = display_name
    return sender


def _http_payload(message: EmailMessage, sender: dict[str, str]) -> dict:
    payload: dict = {
        "from": sender,
        "to": [{"address": message.to}],
        "subject": message.subject,
        "plain": message.text,
        # Tracking rewrites links and adds a pixel that reports who opened what: not for students.
        "tracking": False,
    }
    if message.cc:
        payload["cc"] = [{"address": address} for address in message.cc]
    if message.bcc:
        payload["bcc"] = [{"address": address} for address in message.bcc]
    if message.reply_to:
        payload["reply_to"] = {"address": message.reply_to}
    if message.html:
        payload["html"] = message.html
    if message.headers:
        payload["headers"] = dict(message.headers)
    if message.tags:
        payload["tags"] = dict(message.tags)
    if message.reference_id:
        payload["reference_id"] = message.reference_id
    return payload


def _send_http(message: EmailMessage) -> str | None:
    key = settings.MAILEROO_API_KEY
    if not _is_header_safe(key):
        # Not sent, not quoted: h11 refuses such a header value and quotes it, key and all.
        raise EmailNotConfiguredError("MAILEROO_API_KEY contains whitespace or control characters")
    sender = _http_sender()
    if sender is None:
        raise EmailNotConfiguredError(_NO_SENDER)

    try:
        with _http_client() as client:
            response = client.post(
                f"{settings.MAILEROO_API_URL.rstrip('/')}/emails",
                json=_http_payload(message, sender),
                headers={"Authorization": f"Bearer {key}"},
            )
    except (httpx.UnsupportedProtocol, httpx.InvalidURL) as exc:
        # No scheme, a control character: no email will ever get through until it is fixed.
        raise _misconfigured(
            f"MAILEROO_API_URL is not a usable URL ({type(exc).__name__})"
        ) from exc
    except httpx.RequestError as exc:  # timeouts, refused connections, dropped links, bad bodies
        # Only the type: h11 quotes a bad header value (the key) in its message, and any other
        # text could carry a URL or an address.
        raise TransientEmailError(f"Maileroo could not be reached ({type(exc).__name__})") from exc

    if not 200 <= response.status_code < 300:
        raise _http_error(response)

    reference_id = _accepted_reference_id(message, response)
    logger.info(
        "send_email: accepted by Maileroo | to=%s reference_id=%s", message.to, reference_id
    )
    return reference_id


def _http_error(response: httpx.Response) -> EmailDeliveryError:
    """Classify a non-2xx answer."""
    status = response.status_code
    detail = _detail(response)
    summary = f"HTTP {status}: {detail}" if detail else f"HTTP {status}"

    if status in (400, 422):
        return PermanentEmailError(f"Maileroo rejected the email ({summary})")
    if status in (401, 403, 404):
        # A wrong key, an IP the key does not allow, a wrong URL: nothing about this email is
        # wrong, so it waits, and whoever sends in bulk should stop until the settings are fixed.
        return _misconfigured(
            f"Maileroo refused the request ({summary}). Check MAILEROO_API_KEY, the key's "
            "allowed IPs and MAILEROO_API_URL."
        )
    # 429, 5xx and anything unexpected (a redirect, say): try again later.
    return TransientEmailError(f"Maileroo could not take the email ({summary})")


def _accepted_reference_id(message: EmailMessage, response: httpx.Response) -> str | None:
    """Read a 2xx answer: the provider's reference id, else the one we sent.

    A 2xx that does not confirm the email (``success`` is not true, or the body is not JSON) is
    transient: nothing says the provider has it.
    """
    try:
        body = response.json()
    except ValueError as exc:
        raise TransientEmailError("Maileroo answered 2xx with a body that is not JSON") from exc
    if not isinstance(body, dict) or body.get("success") is not True:
        raise TransientEmailError(f"Maileroo did not confirm the email: {_detail(response)}")

    data = body.get("data")
    reference_id = data.get("reference_id") if isinstance(data, dict) else None
    if isinstance(reference_id, str) and reference_id:
        return reference_id
    return message.reference_id


def _detail(response: httpx.Response) -> str:
    """What the provider said: its JSON ``message``, else the start of the body."""
    try:
        body = response.json()
    except ValueError:
        body = None
    text = body.get("message") if isinstance(body, dict) else None
    if not isinstance(text, str) or not text:
        text = response.text
    return " ".join(text.split())[:_DETAIL_LIMIT]


# ── SMTP ─────────────────────────────────────────────────────────────────────────────


def _smtp_login_user(host: str, configured_user: str) -> str:
    """
    Resend SMTP always authenticates with username ``resend`` (API key as password).
    The visible From address is SMTP_FROM, not SMTP_USER.
    """
    if host.strip().lower() == _RESEND_SMTP_HOST:
        if configured_user and configured_user != _RESEND_SMTP_USER:
            logger.warning(
                "Resend SMTP: SMTP_USER must be %r (got %r). Using %r; set the sender in SMTP_FROM.",
                _RESEND_SMTP_USER,
                configured_user,
                _RESEND_SMTP_USER,
            )
        return _RESEND_SMTP_USER
    return configured_user


def _check_smtp_addresses(message: EmailMessage, sender: str) -> None:
    """Refuse, before connecting, what SMTP cannot carry. smtplib would fail halfway through, and
    its error quotes the text."""
    if "@" not in parseaddr(sender)[1]:
        raise _misconfigured(
            "The SMTP sender has no address. Set EMAIL_FROM (or SMTP_FROM) to an address such as "
            "'GrepThink <noreply@your-domain>'."
        )
    if not sender.isascii():
        # compat32 encodes a non-ASCII From value whole, address included, leaving the header
        # with no address in it. It is a setting, so every email would hit it.
        raise _misconfigured(
            "EMAIL_FROM (or SMTP_FROM) must be ASCII to go over SMTP: the Maileroo API takes any name."
        )
    addresses = [message.to, *message.cc, *message.bcc, message.reply_to or ""]
    if not all(address.isascii() for address in addresses):
        raise PermanentEmailError("address is not ASCII")


def _maileroo_headers(message: EmailMessage, reference_id: str | None) -> dict[str, str]:
    """Maileroo's relay options for ``message``, as the headers its SMTP relay reads."""
    headers = {"X-Maileroo-Track": "no"}  # no open or click tracking: it reports who read what
    if reference_id:
        headers["X-Maileroo-Ref-ID"] = reference_id
    for name, value in message.tags.items():
        if (
            _TAG_NAME.fullmatch(name)
            and len(value) <= _TAG_VALUE_LIMIT
            and "\r" not in value
            and "\n" not in value
        ):
            headers[f"X-Tag-{name}"] = value
    return headers


def _mime(message: EmailMessage, sender: str, relay_headers: Mapping[str, str]) -> str:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = message.subject
    msg["From"] = sender
    msg["To"] = message.to
    if message.cc:
        msg["Cc"] = ", ".join(message.cc)
    if message.reply_to:
        msg["Reply-To"] = message.reply_to
    for name, value in message.headers.items():
        msg[name] = value
    for name, value in relay_headers.items():  # ours win: a caller cannot switch tracking on
        del msg[name]
        msg[name] = value

    msg.attach(MIMEText(message.text, "plain"))
    if message.html:
        msg.attach(MIMEText(message.html, "html"))
    return msg.as_string()


# Whatever happens to these, the server cannot run a session for us: connecting, saying hello, or a
# feature (STARTTLS, AUTH) it lacks. They count as session failures at any stage.
_SESSION_ERRORS = (smtplib.SMTPConnectError, smtplib.SMTPHeloError, smtplib.SMTPNotSupportedError)


def _smtp_reason(exc: OSError) -> str:
    """What went wrong, for an exception message: the server's reply code and text, if it sent one."""
    if isinstance(exc, smtplib.SMTPResponseException):
        error = exc.smtp_error
        text = error.decode("utf-8", "replace") if isinstance(error, bytes) else str(error)
        return f"{type(exc).__name__}: {exc.smtp_code} {text}".strip()
    return f"{type(exc).__name__}: {exc}"


def _refusal_reason(exc: smtplib.SMTPRecipientsRefused) -> str:
    """The server's first refusal without the address (``recipients``: address -> (code, text))."""
    for code, reply in exc.recipients.values():
        text = reply.decode("utf-8", "replace") if isinstance(reply, bytes) else str(reply)
        return f"{code} {text}".strip()
    return "no reply codes"


def _every_refusal_is_final(exc: smtplib.SMTPRecipientsRefused) -> bool:
    """Whether the server answered 5xx for every recipient."""
    codes = [code for code, _ in exc.recipients.values()]
    return bool(codes) and all(isinstance(code, int) and code >= 500 for code in codes)


def _smtp_error(exc: OSError | UnicodeError, stage: str) -> EmailDeliveryError:
    """Classify a failed SMTP session by where it failed.

    Until ``sendmail`` starts, nothing the server says is about the message: it is our login, our
    settings or the provider's health. A 5xx there is a misconfiguration (the email waits, and the
    dispatcher stops for a while); a 4xx or a dropped connection is the provider having a moment.
    From ``sendmail`` on, a 5xx means the message itself was refused (permanent) and a 4xx means
    try again; a refused sender is our settings again.
    """
    if isinstance(exc, UnicodeError):
        # smtplib could not encode something as ASCII, and its message quotes the text. While
        # sending, that is an address or a header; before, it is a setting (host, user, password).
        if stage == "sendmail":
            return PermanentEmailError("address is not ASCII")
        return _misconfigured(
            f"An SMTP setting is not ASCII ({stage}). Check SMTP_HOST, SMTP_USER and SMTP_PASSWORD."
        )

    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return _misconfigured(
            f"SMTP login failed ({_smtp_reason(exc)}). Check SMTP_USER and SMTP_PASSWORD."
        )

    setting_up = stage != "sendmail"
    if isinstance(exc, _SESSION_ERRORS) or (
        setting_up and isinstance(exc, smtplib.SMTPResponseException)
    ):
        if getattr(exc, "smtp_code", 500) >= 500:  # or a server that cannot do what we need
            return _misconfigured(
                f"The SMTP server turned the session down at {stage} ({_smtp_reason(exc)}). "
                "Check SMTP_HOST, SMTP_PORT and the account."
            )
        return TransientEmailError(
            f"The SMTP server would not set up a session ({stage}): {_smtp_reason(exc)}"
        )

    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        error = PermanentEmailError if _every_refusal_is_final(exc) else TransientEmailError
        return error(f"The SMTP server refused the recipients ({_refusal_reason(exc)})")
    if isinstance(exc, smtplib.SMTPSenderRefused):
        if exc.smtp_code == 552:  # too big: the message's fault, not ours
            return PermanentEmailError(
                f"The SMTP server refused the message as too big ({_smtp_reason(exc)})"
            )
        if exc.smtp_code >= 500:
            return _misconfigured(
                f"The SMTP server refused the sender ({_smtp_reason(exc)}). Check EMAIL_FROM "
                "(or SMTP_FROM) and that its domain is verified with the provider."
            )
        return TransientEmailError(
            f"The SMTP server refused the sender for now ({_smtp_reason(exc)})"
        )
    if isinstance(exc, smtplib.SMTPResponseException):  # SMTPDataError, ...
        error = PermanentEmailError if exc.smtp_code >= 500 else TransientEmailError
        return error(f"The SMTP server refused the message ({_smtp_reason(exc)})")
    # Anything else (a dropped connection, a timeout, a TLS error): nothing is wrong with the email.
    return TransientEmailError(f"SMTP failed ({stage}): {_smtp_reason(exc)}")


def _close(smtp: smtplib.SMTP | None) -> None:
    """Drop the connection without a QUIT. Closing is the last thing that may go wrong."""
    if smtp is not None:
        with contextlib.suppress(OSError):
            smtp.close()


def _end_session(smtp: smtplib.SMTP, message: EmailMessage) -> None:
    """Say goodbye now that the server has the message. A failure here changes nothing: the email
    went out, and raising would have the caller send it a second time."""
    try:
        smtp.quit()
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning(
            "email_transport: SMTP session failed after the server accepted the message | "
            "to=%s error=%s",
            message.to,
            type(exc).__name__,
        )
    finally:
        _close(smtp)


def _smtp_session(message: EmailMessage, sender: str, raw: str) -> dict:
    """Connect, log in and hand the server the message. Returns the recipients it refused while
    taking the message for the others."""
    recipients = [message.to, *message.cc, *message.bcc]
    login_user = _smtp_login_user(settings.SMTP_HOST, settings.SMTP_USER)
    logger.info(
        "send_email: connecting | host=%s port=%s user=%s to=%s cc=%s bcc_count=%d",
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        login_user,
        message.to,
        list(message.cc),
        len(message.bcc),
    )

    smtp = None
    stage = "connect"  # the step in progress, which decides what a failure means
    try:
        smtp = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10)
        stage = "ehlo"
        smtp.ehlo()
        stage = "starttls"
        smtp.starttls(context=ssl.create_default_context())  # checks the certificate and name
        smtp.ehlo()
        stage = "login"
        smtp.login(login_user, settings.SMTP_PASSWORD)
        stage = "sendmail"
        refused = smtp.sendmail(sender, recipients, raw)
    except (smtplib.SMTPException, OSError, UnicodeError) as exc:
        # close(), not QUIT: the server's reply to a QUIT could only replace the error that matters
        # (smtplib's own ``with`` block does exactly that).
        _close(smtp)
        # A UnicodeEncodeError quotes the text smtplib could not encode: keep it out of the chain.
        raise _smtp_error(exc, stage) from (None if isinstance(exc, UnicodeError) else exc)

    _end_session(smtp, message)
    return refused or {}


def _send_smtp(message: EmailMessage) -> str | None:
    if not _smtp_configured():
        raise EmailNotConfiguredError(_NOT_CONFIGURED)

    sender = settings.EMAIL_FROM or settings.SMTP_FROM or settings.SMTP_USER
    _check_smtp_addresses(message, sender)

    # Only the Maileroo relay reads the options, and only it reports the id back to webhooks.
    relay = settings.SMTP_HOST.strip().lower() == _MAILEROO_RELAY_HOST
    reference_id = None
    if relay and _REFERENCE_ID.fullmatch(message.reference_id or ""):
        reference_id = message.reference_id
    try:
        raw = _mime(message, sender, _maileroo_headers(message, reference_id) if relay else {})
    except (MessageError, ValueError) as exc:
        # A header name smtplib will not write, text that cannot be encoded: it will never go out.
        # ``from None``: the exception's own text can quote the subject.
        raise PermanentEmailError(
            f"The email cannot be serialised ({type(exc).__name__})"
        ) from None

    refused = _smtp_session(message, sender, raw)
    if message.to in refused:
        # cc and bcc have the message, so a retry would send it to them again.
        raise PermanentEmailError(
            "The SMTP server refused the recipient after taking the message for the others"
        )
    if refused:
        logger.warning(
            "email_transport: the SMTP server refused %d cc/bcc recipient(s) and took the "
            "message for the rest",
            len(refused),
        )
    logger.info("send_email: delivered | to=%s", message.to)
    return reference_id
