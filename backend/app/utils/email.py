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
import re
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

logger = logging.getLogger(__name__)

_RESEND_SMTP_HOST = "smtp.resend.com"


def normalize_editor_html_for_email(html: str) -> str:
    """
    Add inline styles to contenteditable HTML so email clients render spacing
    consistently with what the editor shows.

    contenteditable (Chrome) produces bare <div>, <ul>, <ol>, <li> tags with no
    style attributes. Gmail applies its own UA-stylesheet defaults to these — in
    particular ~1em top/bottom margin on <ul>/<ol> and 40px left-padding — which
    causes much larger gaps than the editor displays.

    This normalises those elements to match the editor's own SCSS rules:
      ul, ol  → margin: 4px 0; padding-left: 24px  (≈ 0.25em / 1.5em at 16px)
      div     → margin: 0; padding: 0               (plain line-wrapper, no gap)
      li      → margin: 0; padding: 0
    """
    html = re.sub(
        r'<div(\s[^>]*)?>',
        lambda m: m.group(0) if 'style=' in m.group(0) else f'<div{m.group(1) or ""} style="margin:0;padding:0">',
        html,
    )
    html = re.sub(
        r'<ul(\s[^>]*)?>',
        lambda m: m.group(0) if 'style=' in m.group(0) else f'<ul{m.group(1) or ""} style="margin:4px 0;padding:0 0 0 24px">',
        html,
    )
    html = re.sub(
        r'<ol(\s[^>]*)?>',
        lambda m: m.group(0) if 'style=' in m.group(0) else f'<ol{m.group(1) or ""} style="margin:4px 0;padding:0 0 0 24px">',
        html,
    )
    html = re.sub(
        r'<li(\s[^>]*)?>',
        lambda m: m.group(0) if 'style=' in m.group(0) else f'<li{m.group(1) or ""} style="margin:0;padding:0">',
        html,
    )
    return html


def wrap_editor_html_for_email(html: str) -> str:
    """Wrap normalised editor HTML in a minimal email-safe template."""
    content = normalize_editor_html_for_email(html)
    return (
        '<html><body style="margin:0;padding:0;font-family:sans-serif;color:#1a1a1a">'
        '<div style="max-width:560px;margin:0 auto;padding:24px;line-height:1.5;font-size:13px">'
        f'{content}'
        '</div></body></html>'
    )
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


def send_email(
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
    reply_to: str | None = None,
    cc: list[str] | None = None,
    bcc: list[str] | None = None,
) -> None:
    """
    Send a plain-text (and optionally HTML) email via the configured SMTP server.

    Args:
        to:        Recipient email address.
        subject:   Email subject line.
        body_text: Plain-text body (always required — acts as the fallback).
        body_html: Optional HTML body. Sent as multipart/alternative so clients
                   that can't render HTML fall back to the text part.
        reply_to:  Optional Reply-To address.
        cc:        Optional list of CC addresses.
        bcc:       Optional list of BCC addresses (header omitted; addresses added
                   to the SMTP envelope only).

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
    cc = cc or []
    bcc = bcc or []

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to
    if cc:
        msg["Cc"] = ", ".join(cc)
    if reply_to:
        msg["Reply-To"] = reply_to

    msg.attach(MIMEText(body_text, "plain"))
    if body_html:
        msg.attach(MIMEText(body_html, "html"))

    all_recipients = [to] + cc + bcc

    login_user = _smtp_login_user(settings.SMTP_HOST, settings.SMTP_USER)
    logger.info(
        "send_email: connecting | host=%s port=%s user=%s to=%s cc=%s bcc_count=%d",
        settings.SMTP_HOST, settings.SMTP_PORT, login_user, to, cc, len(bcc),
    )

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(login_user, settings.SMTP_PASSWORD)
        smtp.sendmail(sender, all_recipients, msg.as_string())

    logger.info("send_email: delivered | to=%s subject=%r", to, subject)
