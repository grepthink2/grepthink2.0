"""Product events the schema does not record (spec §5, decision 17).

One row per event in ``public.events`` (``2026-10-06_assignment_deadlines_and_events.sql``):
sign-ins, board views, TSR submissions and edits, reopenings. ``actor_id``, ``class_id`` and
``project_id`` are nulled when their row is deleted, so counts survive deletions, which is why the
table exists. ``meta`` holds ids and short enums only — never names, emails, grades or free text
(nothing downstream can recognise those; the Sentry rule applied by construction).

``record`` runs inside the request (Vercel may freeze the function once the response is
complete), costs one round trip, and never raises on a database failure: an analytics row is
not worth failing a submission over. A programming error does raise, before anything is
written: an unknown ``kind`` (``ValueError``), an id that is not a ``str`` or ``None``, or a
``meta`` value JSON cannot hold, such as a ``UUID`` or ``datetime`` (``TypeError``). Raising is
what lets tests catch them: the fake client does not serialize, and the real one would fail inside
the insert and lose the event to a warning.
"""

from __future__ import annotations

import json
import logging

from app.core.db import get_client

logger = logging.getLogger(__name__)

#: Every kind the backend records. Add here before recording a new one; the database CHECK
#: (``^[a-z][a-z0-9_]{1,39}$``) is the shape, this set is the vocabulary.
KINDS = frozenset(
    {
        "login",
        "tsr_submitted",
        "tsr_updated",
        "feedback_submitted",
        "assignment_reopened",
        "board_viewed",
        "analytics_viewed",
    }
)


def record(
    kind: str,
    *,
    actor_id: str | None,
    class_id: str | None = None,
    project_id: str | None = None,
    meta: dict | None = None,
) -> None:
    """Insert one event. A database failure is logged at WARNING and never raised; a programming
    error raises before anything is written: ``ValueError`` for an unregistered ``kind``,
    ``TypeError`` for a ``meta`` value JSON cannot hold or an id that is not a ``str`` or ``None``.
    """
    if kind not in KINDS:
        raise ValueError(f"unknown event kind {kind!r}; add it to app.core.events.KINDS")
    json.dumps(meta or {})  # TypeError for a UUID, datetime, ...: the insert would fail on it
    for name, value in (("actor_id", actor_id), ("class_id", class_id), ("project_id", project_id)):
        if value is not None and not isinstance(value, str):
            raise TypeError(
                f"events.record: {name} must be a str or None, not {type(value).__name__}"
            )
    row = {
        "kind": kind,
        "actor_id": actor_id,
        "class_id": class_id,
        "project_id": project_id,
        "meta": meta or {},
    }
    try:
        get_client().table("events").insert(row).execute()
    except Exception:
        logger.warning("events: could not record %s", kind, exc_info=True)
