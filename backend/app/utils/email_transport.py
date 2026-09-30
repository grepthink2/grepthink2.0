"""Email transport: hand one message to a mail provider and say how a failure should be treated.

``send`` uses Maileroo's HTTP API when ``MAILEROO_API_KEY`` is set and SMTP otherwise. Whichever
it uses, a failure to deliver leaves as an ``EmailDeliveryError`` of one of two kinds:

* ``TransientEmailError``: try again later (timeouts, an overloaded or unreachable provider,
  throttling, and a misconfiguration we have to fix: a wrong key, a blocked IP, a wrong URL).
* ``PermanentEmailError``: never retry (a bad address, a body the provider rejects).

A misconfiguration is transient on purpose: the email waits until the settings are fixed instead
of being thrown away. ``EmailNotConfiguredError`` is one of those, and also a ``RuntimeError``
so that callers written before the transport (``except RuntimeError``) keep working.
"""

from __future__ import annotations

import logging
import smtplib
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

    ``tags`` and ``reference_id`` only exist in Maileroo's API; SMTP ignores them.
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


class EmailNotConfiguredError(TransientEmailError, RuntimeError):
    """No provider (or no sender) is configured. A ``RuntimeError`` for the older callers."""


def send(message: EmailMessage) -> str | None:
    """Deliver ``message``. Returns Maileroo's reference id, or ``None`` when sent over SMTP.

    Raises:
        EmailNotConfiguredError: neither provider is configured (transient).
        TransientEmailError: try again later.
        PermanentEmailError: this email will never be accepted.
    """
    if settings.MAILEROO_API_KEY:
        return _send_http(message)
    _send_smtp(message)
    return None


def reference_id_for(row_id: str) -> str:
    """The 24-hex-digit ``reference_id`` for an outbox row: the start of its UUID.

    Maileroo reports it again in its webhook events, so an event can be matched back to its row.
    """
    return str(row_id).replace("-", "").lower()[:24]


def is_configured() -> bool:
    """Whether either path has its settings: the API key with a sender, or all of SMTP.

    ``send`` goes by the key alone, so a key without a sender still raises
    ``EmailNotConfiguredError`` there even when SMTP is complete.
    """
    return bool(settings.MAILEROO_API_KEY and _http_sender()) or _smtp_configured()


def _smtp_configured() -> bool:
    return bool(settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD)


# ── Maileroo HTTP API ────────────────────────────────────────────────────────────────


def _http_client() -> httpx.Client:
    """A new client for one send, which the caller closes. Tests swap this for a MockTransport."""
    return httpx.Client(timeout=httpx.Timeout(10.0, connect=5.0))


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
    sender = _http_sender()
    if sender is None:
        raise EmailNotConfiguredError(_NO_SENDER)

    try:
        with _http_client() as client:
            response = client.post(
                f"{settings.MAILEROO_API_URL.rstrip('/')}/emails",
                json=_http_payload(message, sender),
                headers={"Authorization": f"Bearer {settings.MAILEROO_API_KEY}"},
            )
    except httpx.RequestError as exc:  # timeouts, refused connections, dropped links, bad bodies
        raise TransientEmailError(
            f"Maileroo could not be reached: {type(exc).__name__}: {exc}"
        ) from exc

    if response.status_code != 200:
        raise _http_error(response)

    reference_id = _accepted_reference_id(message, response)
    logger.info(
        "send_email: accepted by Maileroo | to=%s reference_id=%s", message.to, reference_id
    )
    return reference_id


def _http_error(response: httpx.Response) -> EmailDeliveryError:
    """Classify a non-200 answer."""
    status = response.status_code
    detail = _detail(response)
    summary = f"HTTP {status}: {detail}" if detail else f"HTTP {status}"

    if status in (400, 422):
        return PermanentEmailError(f"Maileroo rejected the email ({summary})")
    if status in (401, 403, 404):
        # A wrong key, an IP the key does not allow, a wrong URL: nothing about this email is
        # wrong, so it waits, and the error log is what tells someone to fix the settings.
        logger.error(
            "email_transport: Maileroo refused the request (%s). Check MAILEROO_API_KEY, the "
            "key's allowed IPs and MAILEROO_API_URL.",
            summary,
        )
        return TransientEmailError(f"Maileroo refused the request ({summary})")
    # 429, 5xx and anything unexpected (a redirect, say): try again later.
    return TransientEmailError(f"Maileroo could not take the email ({summary})")


def _accepted_reference_id(message: EmailMessage, response: httpx.Response) -> str | None:
    """Read a 200 answer: the provider's reference id, else the one we sent.

    A 200 that does not confirm the email (``success`` is not true, or the body is not JSON) is
    transient: nothing says the provider has it.
    """
    try:
        body = response.json()
    except ValueError as exc:
        raise TransientEmailError("Maileroo answered 200 with a body that is not JSON") from exc
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


def _mime(message: EmailMessage, sender: str) -> str:
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

    msg.attach(MIMEText(message.text, "plain"))
    if message.html:
        msg.attach(MIMEText(message.html, "html"))
    return msg.as_string()


# Whatever happens to these, the server cannot run a session for us: connecting, saying hello,
# or a feature (STARTTLS, AUTH) it lacks. They count as session failures at any stage.
_SESSION_ERRORS = (smtplib.SMTPConnectError, smtplib.SMTPHeloError, smtplib.SMTPNotSupportedError)


def _smtp_reason(exc: OSError) -> str:
    """What went wrong, for an exception message: the server's reply code and text, if it sent one."""
    if isinstance(exc, smtplib.SMTPResponseException):
        error = exc.smtp_error
        text = error.decode("utf-8", "replace") if isinstance(error, bytes) else str(error)
        return f"{type(exc).__name__}: {exc.smtp_code} {text}".strip()
    return f"{type(exc).__name__}: {exc}"


def _every_refusal_is_final(exc: smtplib.SMTPRecipientsRefused) -> bool:
    """Whether the server answered 5xx for every recipient (``recipients``: address -> (code, text))."""
    codes = [refusal[0] for refusal in exc.recipients.values()]
    return bool(codes) and all(isinstance(code, int) and code >= 500 for code in codes)


def _smtp_error(exc: OSError, stage: str) -> EmailDeliveryError:
    """Classify a failed SMTP session by where it failed.

    Until ``sendmail`` starts, nothing the server says is about the message: it is our login, our
    settings or the provider's health, so the email waits. From ``sendmail`` on, a 5xx means the
    message itself was refused (permanent) and a 4xx means try again (transient).
    """
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        logger.error(
            "email_transport: SMTP login failed, check SMTP_USER and SMTP_PASSWORD | host=%s code=%s",
            settings.SMTP_HOST,
            exc.smtp_code,
        )
        return TransientEmailError(f"SMTP login failed: {_smtp_reason(exc)}")

    setting_up = stage != "sendmail"
    if isinstance(exc, _SESSION_ERRORS) or (
        setting_up and isinstance(exc, smtplib.SMTPResponseException)
    ):
        # A 5xx here (or a server that cannot do what we need) is most likely our settings.
        if getattr(exc, "smtp_code", 500) >= 500:
            logger.error(
                "email_transport: the SMTP server turned the session down at %s, check SMTP_HOST, "
                "SMTP_PORT and the account | host=%s error=%s",
                stage,
                settings.SMTP_HOST,
                type(exc).__name__,
            )
        return TransientEmailError(
            f"The SMTP server would not set up a session ({stage}): {_smtp_reason(exc)}"
        )

    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        error = PermanentEmailError if _every_refusal_is_final(exc) else TransientEmailError
        return error(f"The SMTP server refused the recipients: {exc}")
    if isinstance(exc, smtplib.SMTPResponseException):  # SenderRefused, DataError, ...
        error = PermanentEmailError if exc.smtp_code >= 500 else TransientEmailError
        return error(f"The SMTP server refused the message: {_smtp_reason(exc)}")
    # Anything else (a dropped connection, a timeout, a TLS error): nothing is wrong with the email.
    return TransientEmailError(f"SMTP failed ({stage}): {_smtp_reason(exc)}")


def _send_smtp(message: EmailMessage) -> None:
    if not _smtp_configured():
        raise EmailNotConfiguredError(_NOT_CONFIGURED)

    sender = settings.EMAIL_FROM or settings.SMTP_FROM or settings.SMTP_USER
    try:
        raw = _mime(message, sender)
    except (MessageError, UnicodeError) as exc:
        # A header line inside the subject, text that cannot be encoded: it will never go out.
        raise PermanentEmailError(f"The email cannot be serialised ({type(exc).__name__})") from exc

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

    stage = "connect"  # the step in progress, which decides what a failure means
    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
            stage = "ehlo"
            smtp.ehlo()
            stage = "starttls"
            smtp.starttls()
            smtp.ehlo()
            stage = "login"
            smtp.login(login_user, settings.SMTP_PASSWORD)
            stage = "sendmail"
            smtp.sendmail(sender, recipients, raw)
            stage = "done"
    except (smtplib.SMTPException, OSError) as exc:
        if stage != "done":
            raise _smtp_error(exc, stage) from exc
        # The server already has the message and only closing the session went wrong. Raising
        # would have the caller send it a second time.
        logger.warning(
            "email_transport: SMTP session failed after the server accepted the message | "
            "to=%s error=%s",
            message.to,
            type(exc).__name__,
        )

    logger.info("send_email: delivered | to=%s", message.to)
