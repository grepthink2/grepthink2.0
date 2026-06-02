"""
Email delivery utility.

Sends transactional emails via SMTP (TLS on port 587 by default).
Requires SMTP_HOST, SMTP_USER, and SMTP_PASSWORD to be set in .env.
See config.py for the full list of settings.

If SMTP is not configured (e.g. local dev without a mail server) the
function raises a RuntimeError so callers can surface a clear error
rather than silently swallowing it.
"""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_RESEND_SMTP_HOST = "smtp.resend.com"
_RESEND_SMTP_USER = "resend"


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


def send_email(*, to: str, subject: str, body_text: str, body_html: str | None = None) -> None:
    """
    Send a plain-text (and optionally HTML) email via the configured SMTP server.

    Args:
        to:        Recipient email address.
        subject:   Email subject line.
        body_text: Plain-text body (always required — acts as the fallback).
        body_html: Optional HTML body. If provided, sent as a multipart/alternative
                   message so clients that can't render HTML fall back to the text part.

    Raises:
        RuntimeError: If SMTP settings are missing from the environment.
        smtplib.SMTPException: On connection or authentication failures.
    """
    from app.config import settings  # local import avoids circular dependency at module load

    if not settings.SMTP_HOST or not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in .env "
            "to enable email delivery."
        )

    sender = settings.SMTP_FROM or settings.SMTP_USER

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to

    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    login_user = _smtp_login_user(settings.SMTP_HOST, settings.SMTP_USER)
    logger.info(
        "send_email: connecting | host=%s port=%s user=%s to=%s",
        settings.SMTP_HOST, settings.SMTP_PORT, login_user, to,
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(login_user, settings.SMTP_PASSWORD)
        smtp.sendmail(sender, to, msg.as_string())

    logger.info("send_email: delivered | to=%s subject=%r", to, subject)
