"""
Email delivery utility.

``send_email`` sends one transactional email right now, through
``app.utils.email_transport``: Maileroo's HTTP API when MAILEROO_API_KEY is set,
SMTP (STARTTLS on port 587 by default) otherwise. See config.py for the settings.

If no provider is configured (e.g. local dev without a mail server) it raises
EmailNotConfiguredError, a RuntimeError, so callers can surface a clear error
rather than silently swallowing it. Any other failure is an EmailDeliveryError:
TransientEmailError (retry later) or PermanentEmailError (never retry).

The HTML helpers below prepare editor content for an email body.
"""

import re

from app.utils import email_transport
from app.utils.email_transport import EmailMessage


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
        r"<div(\s[^>]*)?>",
        lambda m: (
            m.group(0)
            if "style=" in m.group(0)
            else f'<div{m.group(1) or ""} style="margin:0;padding:0">'
        ),
        html,
    )
    html = re.sub(
        r"<ul(\s[^>]*)?>",
        lambda m: (
            m.group(0)
            if "style=" in m.group(0)
            else f'<ul{m.group(1) or ""} style="margin:4px 0;padding:0 0 0 24px">'
        ),
        html,
    )
    html = re.sub(
        r"<ol(\s[^>]*)?>",
        lambda m: (
            m.group(0)
            if "style=" in m.group(0)
            else f'<ol{m.group(1) or ""} style="margin:4px 0;padding:0 0 0 24px">'
        ),
        html,
    )
    html = re.sub(
        r"<li(\s[^>]*)?>",
        lambda m: (
            m.group(0)
            if "style=" in m.group(0)
            else f'<li{m.group(1) or ""} style="margin:0;padding:0">'
        ),
        html,
    )
    return html


def wrap_editor_html_for_email(html: str) -> str:
    """Wrap normalised editor HTML in a minimal email-safe template."""
    content = normalize_editor_html_for_email(html)
    return (
        '<html><body style="margin:0;padding:0;font-family:sans-serif;color:#1a1a1a">'
        '<div style="max-width:560px;margin:0 auto;padding:24px;line-height:1.5;font-size:13px">'
        f"{content}"
        "</div></body></html>"
    )


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
    Send a plain-text (and optionally HTML) email now, through the configured provider
    (Maileroo's HTTP API when MAILEROO_API_KEY is set, SMTP otherwise).

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
        EmailNotConfiguredError: No provider is configured. A RuntimeError, and a
            TransientEmailError.
        EmailDeliveryError: The provider did not take the email. TransientEmailError
            means retry later (timeouts, outages, throttling, a misconfiguration);
            PermanentEmailError means never retry (a bad address, a rejected body).
    """
    email_transport.send(
        EmailMessage(
            to=to,
            subject=subject,
            text=body_text,
            html=body_html,
            cc=tuple(cc or ()),
            bcc=tuple(bcc or ()),
            reply_to=reply_to,
        )
    )
