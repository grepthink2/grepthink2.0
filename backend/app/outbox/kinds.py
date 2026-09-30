"""The kinds of email the outbox sends, and what each one renders to.

Every outbox row names its ``kind``. The dispatcher looks the kind up here and calls its
``render`` with the row's ``payload`` when the email goes out, so what a row stores is data, not
finished text. To add a kind, write a render function and file a ``Kind`` in ``KINDS`` under its
name. A kind with a ``category`` (a key of ``app.outbox.preferences.CATEGORIES``) can be switched
off by its recipient and carries unsubscribe links; a kind without one is transactional and
always sent.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.classes.invite_email import render_class_invite
from app.outbox.rendered import Rendered
from app.utils.email import wrap_editor_html_for_email

__all__ = ["KINDS", "Kind", "RenderContext", "Rendered", "get_kind"]


@dataclass(frozen=True)
class RenderContext:
    """What the dispatcher knows that a payload does not.

    ``unsubscribe_url`` is the page that switches the kind's category off for the recipient, for
    the email's footer. Set only for a kind with a category sent to an account.
    """

    unsubscribe_url: str | None = None


@dataclass(frozen=True)
class Kind:
    """One kind of email.

    Attributes:
        name: The ``kind`` stored on outbox rows.
        render: ``(payload, context) -> Rendered``. Raising fails the row (it is a bug, not a
            delivery problem).
        category: A key of ``preferences.CATEGORIES``, or ``None`` for transactional email.
        still_relevant: ``(client, row) -> bool``, asked just before sending; ``False`` skips
            the row (a reminder for a deadline that moved, say). ``None``: always relevant.
        notify_creator_on_failure: Whether the row's ``created_by`` hears in the app that the
            email could not be delivered.
    """

    name: str
    render: Callable[[Mapping[str, Any], RenderContext], Rendered]
    category: str | None = None
    still_relevant: Callable[[Any, Mapping[str, Any]], bool] | None = None
    notify_creator_on_failure: bool = False


def _render_class_invite(payload: Mapping[str, Any], context: RenderContext) -> Rendered:
    """Payload: ``class_name``, ``course_code``, ``instructor_name``, ``registered``."""
    return render_class_invite(
        class_name=payload["class_name"],
        course_code=payload["course_code"],
        instructor_name=payload["instructor_name"],
        registered=payload["registered"],
    )


def _render_custom_invite(payload: Mapping[str, Any], context: RenderContext) -> Rendered:
    """Payload: ``subject``, ``body_text``, ``body_html`` (the editor's raw HTML, or none), ``cc``, ``bcc``."""
    body_html = payload.get("body_html")
    return Rendered(
        subject=payload["subject"],
        text=payload["body_text"],
        html=wrap_editor_html_for_email(body_html) if body_html else None,
        cc=tuple(payload.get("cc") or ()),
        bcc=tuple(payload.get("bcc") or ()),
    )


KINDS: dict[str, Kind] = {
    kind.name: kind
    for kind in (
        Kind(name="class_invite", render=_render_class_invite, notify_creator_on_failure=True),
        Kind(name="custom_invite", render=_render_custom_invite, notify_creator_on_failure=True),
    )
}


def get_kind(name: str) -> Kind | None:
    """The kind filed under ``name``, or ``None`` for one this code does not have."""
    return KINDS.get(name)
