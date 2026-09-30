"""What one email renders to: its subject, its bodies and any extra recipients.

A module of its own so that the code building an email (``app.classes.invite_email``) and the
outbox kinds that call it (``app.outbox.kinds``) can both import it without importing each other.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Rendered:
    """A rendered email. ``text`` is always sent; ``html`` is the optional alternative."""

    subject: str
    text: str
    html: str | None = None
    cc: tuple[str, ...] = ()
    bcc: tuple[str, ...] = ()
