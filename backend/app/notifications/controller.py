"""Business logic for in-app notifications."""

from __future__ import annotations

import base64
import binascii
import logging
import re
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.core import db as core_db
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseError, DatabaseUnavailableError
from app.utils.mentions import render_mentions_plain
from app.utils.profiles import needs_roster_email, profile_name

logger = logging.getLogger(__name__)

NOTIFICATION_TYPES = frozenset(
    {
        "join_request",
        "join_request_unreviewed",
        "join_rejected",
        "message",
        "project_created",
        "complete_profile",
        "upload_roster",
        "member_removed",
        "email_undeliverable",
        "mention",
        "document_finalized",
        "late_window_opened",
    }
)

ELEVATED_PROJECT_ROLES = ("owner", "product owner", "admin")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _client():
    """The service-role client; 503 when ``SUPABASE_SERVICE_ROLE_KEY`` is unset.

    Unlike ``get_client()`` this never falls back to the anon client (RLS would
    hide other users' rows from these reads and writes). The key is checked
    through ``app.core.db`` at call time — the one point tests patch.
    """
    if core_db.service_client is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return get_client()


def _text(value) -> str | None:
    """An id as text: a ``UUID`` would not survive the request's JSON encoding."""
    return None if value is None else str(value)


def _context(*, class_id=None, project_id=None, actor_id=None, message_count=None) -> dict:
    """The columns that say where a notice happened and who did it, leaving out the ones it does
    not have, so a notice without them writes exactly what it wrote before they existed."""
    ids = {"class_id": class_id, "project_id": project_id, "actor_id": actor_id}
    out = {key: str(value) for key, value in ids.items() if value}
    if message_count is not None:
        out["message_count"] = message_count
    return out


def _insert_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    body: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    class_id: str | None = None,
    project_id: str | None = None,
    actor_id: str | None = None,
    message_count: int | None = None,
) -> None:
    if type not in NOTIFICATION_TYPES:
        logger.warning("Unknown notification type %r — skipping", type)
        return
    try:
        _client().table("notifications").insert(
            {
                "user_id": user_id,
                "type": type,
                "title": title,
                "body": body,
                "entity_type": entity_type,
                "entity_id": _text(entity_id),
                **_context(
                    class_id=class_id,
                    project_id=project_id,
                    actor_id=actor_id,
                    message_count=message_count,
                ),
            }
        ).execute()
    except Exception:
        logger.exception(
            "Failed to insert notification | user_id=%s type=%s",
            user_id,
            type,
        )


def _insert_notifications(rows: list[dict]) -> None:
    """Best-effort bulk insert of several notification rows in one round trip.

    Rows whose ``type`` is not in :data:`NOTIFICATION_TYPES` are dropped (logged),
    mirroring :func:`_insert_notification`. A row's ``class_id``, ``project_id``, ``actor_id``
    and ``message_count`` are written when it has them. Never raises.
    """
    valid = []
    for row in rows:
        if row.get("type") not in NOTIFICATION_TYPES:
            logger.warning("Unknown notification type %r — skipping", row.get("type"))
            continue
        valid.append(
            {
                "user_id": row["user_id"],
                "type": row["type"],
                "title": row["title"],
                "body": row["body"],
                "entity_type": row.get("entity_type"),
                "entity_id": _text(row.get("entity_id")),
                **_context(
                    class_id=row.get("class_id"),
                    project_id=row.get("project_id"),
                    actor_id=row.get("actor_id"),
                    message_count=row.get("message_count"),
                ),
            }
        )
    if not valid:
        return
    try:
        get_client().table("notifications").insert(valid).execute()
    except Exception:
        logger.exception("Failed to bulk-insert %d notifications", len(valid))


def notify_member_departure(
    *,
    recipient_ids: list[str],
    leaver_name: str,
    old_project_id: str,
    old_project_name: str,
    new_project_name: str,
    leaver_id: str | None = None,
    class_id: str | None = None,
) -> None:
    """Tell each product owner of ``old_project`` that a member left for another team, e.g.
    "Diego Ramos left Trailhead". ``leaver_name`` is their display name, or empty.

    Sent when the move happens: a reviewer accepted the member's join request, or the
    member accepted another team's invitation. A ``member_removed`` notice, which opens the team.
    """
    body = (
        f'{leaver_name or "A student"} has left "{old_project_name}" to join "{new_project_name}".'
    )
    _insert_notifications(
        [
            {
                "user_id": rid,
                "type": "member_removed",
                "title": f"{leaver_name or 'Someone'} left {old_project_name}",
                "body": body,
                "entity_type": "project",
                "entity_id": old_project_id,
                "class_id": class_id,
                "project_id": old_project_id,
                "actor_id": leaver_id,
            }
            for rid in recipient_ids
        ]
    )


def notify_email_undeliverable(
    *, user_id: str | None, to_email: str, class_id: str | None, reason: str
) -> None:
    """Tell ``user_id`` (whoever queued an invite) that it could not be delivered, and why.

    One unread notification per user and class: a later failure rewrites it with the latest
    address and reason, so a batch that fails cannot flood anyone. Nothing without a user.
    ``reason`` completes the sentence, e.g. "the mail server refused it". Never raises.
    """
    if user_id is None:
        return
    try:
        _upsert_unread_notification(
            user_id=user_id,
            type="email_undeliverable",
            title="An email couldn't be delivered",
            body=f"Your invite to {to_email} couldn't be delivered ({reason}).",
            entity_type="class" if class_id else None,
            entity_id=str(class_id) if class_id else None,
            class_id=class_id,
        )
    except DatabaseError:  # an HTTPException too, so caught first: this one is worth an event
        logger.error(
            "notify_email_undeliverable: could not save the notification | user_id=%s",
            user_id,
            exc_info=True,
        )
    except HTTPException:  # the 503 of a server without a service client: nothing to fix here
        logger.warning(
            "notify_email_undeliverable: skipped, no service client | user_id=%s", user_id
        )


def _upsert_unread_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    body: str,
    entity_type: str | None,
    entity_id: str | None,
    class_id: str | None = None,
    project_id: str | None = None,
    actor_id: str | None = None,
    count_messages: bool = False,
) -> None:
    """Update an existing unread notification for the same entity, or insert.

    ``entity_id=None`` matches only a notification that has no entity either. With
    ``count_messages`` (a conversation's message row) every call counts: the unread row's
    ``message_count`` goes up by one (a row written before the count existed holds NULL, which
    reads as 1) and it takes the latest title, text and actor, while a new row starts at 1. The
    count is read and written back by this one call, so two messages at the same instant can count
    as one. The newest unread row is the one rewritten, and only while it is still unread: a row
    read since the lookup is left as it was read, and this notice starts a new row.
    """
    context = _context(class_id=class_id, project_id=project_id, actor_id=actor_id)
    try:
        client = _client()
        query = (
            client.table("notifications")
            .select("id, title, body, message_count")
            .eq("user_id", user_id)
            .eq("type", type)
            .is_("read_at", "null")
        )
        if entity_id is not None:
            query = query.eq("entity_id", entity_id)
        else:
            query = query.is_("entity_id", "null")
        existing = query.order("created_at", desc=True).limit(1).execute()

        if existing.data:
            row = existing.data[0]
            fields = {"title": title, "body": body, "created_at": _now_iso(), **context}
            if count_messages:
                fields["message_count"] = (row.get("message_count") or 1) + 1
            # Skip a no-op write. Because list_notifications() calls the
            # ensure_* helpers on every GET, re-writing identical content would
            # emit a realtime change event, which the client's subscription
            # turns back into another GET — an endless refetch loop. Only write
            # when the content actually changed. A message always changes its count.
            elif row.get("title") == title and row.get("body") == body:
                return
            updated = (
                client.table("notifications")
                .update(fields)
                .eq("id", row["id"])
                .is_("read_at", "null")
                .select("id")
                .execute()
            )
            if updated.data:
                return
            # Read since the lookup: it keeps what it showed when it was read.

        _insert_notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
            message_count=1 if count_messages else None,
            **context,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Failed to upsert notification | user_id=%s type=%s",
            user_id,
            type,
        )


def _get_profile(user_id: str) -> dict:
    res = (
        _client()
        .table("profiles")
        .select("id, email, role, first_name, last_name, edu_email")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    # supabase-py 2.x answers None, not a response with no data, when no row matches.
    return (res.data if res else None) or {}


_PROFILE_NOTIFICATION_COOLDOWN_SECONDS = 300  # 5 minutes


def ensure_profile_completion_notification(user_id: str) -> None:
    """Maintain exactly one profile-completion reminder per user.

    After dismissal the notification re-surfaces after a 5-minute cooldown so
    the user isn't immediately re-notified on the next poll.

    Best-effort on the roster-email check itself (``needs_roster_email``, which can read the
    institutions table): this runs on every ``GET /api/notifications``, so an outage there is
    logged and skipped rather than turning an otherwise-successful list into a 500. The
    reminder catches up next time this runs with a healthy read. The log level follows
    ``app.core.errors``: WARNING for an outage, ERROR for anything lasting (a missing grant,
    say), which Sentry records as an event rather than a breadcrumb.
    """
    profile = _get_profile(user_id)
    if not profile:
        dismiss_profile_completion_notification(user_id)
        return

    missing: list[str] = []
    if not (profile.get("first_name") or "").strip():
        missing.append("first name")
    if not (profile.get("last_name") or "").strip():
        missing.append("last name")

    try:
        roster_email_missing = needs_roster_email(profile)
    except DatabaseError as exc:
        log = logger.warning if isinstance(exc, DatabaseUnavailableError) else logger.error
        log(
            "ensure_profile_completion_notification: roster-email check failed, "
            "skipping | user_id=%s",
            user_id,
            exc_info=True,
        )
        return
    if roster_email_missing:
        missing.append("roster school email")

    if not missing:
        dismiss_profile_completion_notification(user_id)
        return

    body = f"Please add your {' and '.join(missing)} in Settings to finish setting up your account."
    title = "Complete your profile"

    try:
        client = _client()
        all_rows = (
            client.table("notifications")
            .select("id, read_at, created_at, title, body")
            .eq("user_id", user_id)
            .eq("type", "complete_profile")
            .order("created_at", desc=True)
            .execute()
        )
        rows = all_rows.data or []

        # Delete every duplicate — keep only the most recent row.
        if len(rows) > 1:
            stale_ids = [r["id"] for r in rows[1:]]
            client.table("notifications").delete().in_("id", stale_ids).execute()

        if rows:
            row = rows[0]
            read_at_raw = row.get("read_at")
            if read_at_raw:
                # Dismissed — only re-surface after the cooldown has elapsed.
                try:
                    dismissed_at = datetime.fromisoformat(read_at_raw.replace("Z", "+00:00"))
                    elapsed = (datetime.now(UTC) - dismissed_at).total_seconds()
                except (ValueError, TypeError):
                    elapsed = _PROFILE_NOTIFICATION_COOLDOWN_SECONDS  # treat as expired

                if elapsed >= _PROFILE_NOTIFICATION_COOLDOWN_SECONDS:
                    client.table("notifications").update(
                        {
                            "title": title,
                            "body": body,
                            "read_at": None,
                            "created_at": _now_iso(),
                        }
                    ).eq("id", row["id"]).execute()
                # else: still in cooldown; leave it dismissed
            else:
                # Already unread — refresh only when the content actually
                # changed. A no-op update emits a realtime event, and since
                # this runs on every GET that would loop the client's refetch
                # endlessly.
                if row.get("title") != title or row.get("body") != body:
                    client.table("notifications").update(
                        {
                            "title": title,
                            "body": body,
                        }
                    ).eq("id", row["id"]).execute()
        else:
            _insert_notification(
                user_id=user_id,
                type="complete_profile",
                title=title,
                body=body,
                entity_type="profile",
                entity_id=user_id,
            )
    except Exception:
        logger.exception(
            "ensure_profile_completion_notification failed | user_id=%s",
            user_id,
        )


def dismiss_profile_completion_notification(user_id: str) -> None:
    """Profile is now complete — delete all complete_profile notifications for this user."""
    try:
        _client().table("notifications").delete().eq(
            "user_id",
            user_id,
        ).eq("type", "complete_profile").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss profile notification | user_id=%s",
            user_id,
        )


def _class_has_roster(client, class_id: str) -> bool:
    res = client.table("roster_entries").select("id").eq("course_id", class_id).limit(1).execute()
    return bool(res.data)


def ensure_roster_upload_notifications(user_id: str) -> None:
    """Remind a class's instructor to upload the roster CSV for each of their classes without one.

    Decided by ``classes.created_by`` alone, like every other class-instructor check, never by
    ``profiles.role``: an account whose role is ``student`` can own a class, and an
    ``instructor`` account that is only a TA or student somewhere owns none. An account that
    owns no class costs one read.
    """
    client = _client()
    classes_res = client.table("classes").select("id, name").eq("created_by", user_id).execute()
    for cls in classes_res.data or []:
        class_id = cls["id"]
        class_name = (cls.get("name") or "").strip() or "your class"
        if _class_has_roster(client, class_id):
            dismiss_roster_upload_notification(user_id, class_id)
        else:
            _upsert_unread_notification(
                user_id=user_id,
                type="upload_roster",
                title="Upload your class roster",
                body=(
                    f"Upload the roster for {class_name} so students can be "
                    "matched to the official class list."
                ),
                entity_type="class",
                entity_id=class_id,
                class_id=class_id,
            )


def dismiss_roster_upload_notification(user_id: str, class_id: str) -> None:
    """Remove roster-upload reminder once a roster exists for the class."""
    try:
        _client().table("notifications").update(
            {
                "read_at": _now_iso(),
            }
        ).eq("user_id", user_id).eq("type", "upload_roster").eq(
            "entity_id",
            class_id,
        ).is_("read_at", "null").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss roster notification | user_id=%s class_id=%s",
            user_id,
            class_id,
        )


def notify_join_request(
    *,
    project_id: str,
    project_name: str,
    request_id: str,
    requester_id: str,
    message: str | None = None,
    class_id: str | None = None,
) -> None:
    """Notify project owners/admins when someone requests to join, e.g. "Sam Okafor asked to
    join Trailhead".

    When nobody on the team can review it (no member is left, or none holds a
    reviewing role), the class instructor is the only reviewer, so they get a
    ``join_request_unreviewed`` notice that opens the project instead.
    """
    try:
        client = _client()
        owners_res = (
            client.table("project_members")
            .select("user_id")
            .eq("project_id", project_id)
            .in_("role", list(ELEVATED_PROJECT_ROLES))
            .execute()
        )
        owner_ids = {
            row["user_id"]
            for row in (owners_res.data or [])
            if row.get("user_id") and row["user_id"] != requester_id
        }
        instructor_id = None
        if not owner_ids:
            project_res = (
                client.table("projects")
                .select("class_id, classes(created_by)")
                .eq("id", project_id)
                .limit(1)
                .execute()
            )
            project_row = (project_res.data or [{}])[0]
            instructor_id = (project_row.get("classes") or {}).get("created_by")
            if not instructor_id or instructor_id == requester_id:
                return

        profile = _get_profile(requester_id)
        requester_name = profile_name(profile) or "A student"
        name = profile_name(profile) or "Someone"
        clean_message = message.strip() if isinstance(message, str) else ""
        quote = f' "{clean_message}"' if clean_message else ""
        context = {"class_id": class_id, "project_id": project_id, "actor_id": requester_id}

        if instructor_id:
            _insert_notification(
                user_id=instructor_id,
                type="join_request_unreviewed",
                title=f"{name}'s request to join {project_name} needs your review",
                body=(
                    f"{requester_name} requested to join {project_name}, which has no "
                    f"product owner or admin to review it.{quote}"
                ),
                entity_type="project",
                entity_id=project_id,
                **context,
            )
            return

        title = f"{name} asked to join {project_name}"
        body = f"{requester_name} requested to join {project_name}.{quote}"
        for owner_id in owner_ids:
            _insert_notification(
                user_id=owner_id,
                type="join_request",
                title=title,
                body=body,
                entity_type="project",
                entity_id=project_id,
                **context,
            )
    except Exception:
        logger.exception(
            "notify_join_request failed | project_id=%s request_id=%s",
            project_id,
            request_id,
        )


def notify_new_message(
    *,
    recipient_id: str,
    sender_name: str | None,
    conversation_id: str,
    body: str,
    sender_id: str | None = None,
    project_id: str | None = None,
    class_id: str | None = None,
) -> None:
    """Notify a participant when they receive a new message.

    ``sender_name`` comes with the send (the message insert returns it); without
    one the title says "Someone". All roles get message notifications — TA/instructor
    channels mean staff must hear replies (changed 2026-07-14; was students-only).

    The conversation keeps one unread row, which counts its messages and shows the latest
    (:func:`_upsert_unread_notification`). A team channel's row records its team and class; a
    direct message's records neither."""
    preview = body.strip()
    if len(preview) > 120:
        preview = preview[:117] + "..."

    _upsert_unread_notification(
        user_id=recipient_id,
        type="message",
        title=f"New message from {sender_name or 'Someone'}",
        body=preview or "You have a new message.",
        entity_type="conversation",
        entity_id=conversation_id,
        class_id=class_id,
        project_id=project_id,
        actor_id=sender_id,
        count_messages=True,
    )


def notify_mention(
    *,
    recipient_ids: list[str],
    author_name: str,
    label: str,
    project_name: str,
    body_md: str,
    entity_type: str,
    entity_id: str,
    author_id: str | None = None,
    project_id: str | None = None,
    class_id: str | None = None,
) -> None:
    """Tell each of ``recipient_ids`` that ``author_name`` mentioned them on ``label``
    (a card key such as ``GT-12``).

    One insert per recipient, so one failure does not stop the rest. Never raises.
    """
    try:
        preview = " ".join(render_mentions_plain(body_md).split())
        if len(preview) > 120:
            preview = preview[:117] + "..."
        title = f"{author_name} mentioned you on {label}"
        body = f"{project_name}: {preview}"
        for user_id in recipient_ids:
            _insert_notification(
                user_id=user_id,
                type="mention",
                title=title,
                body=body,
                entity_type=entity_type,
                entity_id=entity_id,
                class_id=class_id,
                project_id=project_id,
                actor_id=author_id,
            )
    except Exception:
        logger.exception("notify_mention failed | entity_type=%s", entity_type)


def notify_document_finalized(
    *,
    recipient_ids: list[str],
    project_name: str,
    document_title: str,
    document_id: str,
    project_id: str | None = None,
    class_id: str | None = None,
    finalizer_id: str | None = None,
) -> None:
    """Tell each of ``recipient_ids`` (the team's TAs) that the team finalized a document, e.g.
    "Trailhead handed in its Sprint 2 report". One insert for all of them; never raises."""
    _insert_notifications(
        [
            {
                "user_id": user_id,
                "type": "document_finalized",
                "title": f"{project_name} handed in its {document_title}",
                "body": f"{project_name} finalized its {document_title}",
                "entity_type": "document",
                "entity_id": document_id,
                "class_id": class_id,
                "project_id": project_id,
                "actor_id": finalizer_id,
            }
            for user_id in recipient_ids
        ]
    )


def notify_late_window_opened(
    *,
    recipient_ids: list[str],
    class_id: str,
    assignment_title: str,
    accept_until: datetime,
    tz: ZoneInfo,
) -> None:
    """Tell each of ``recipient_ids`` (the students the caller picked) that an assignment's late
    window opened or now ends later, with its end in the school's zone ``tz``, e.g. "Late
    submissions open for TSR 1" / "You can submit until Jan 12, 12:00 AM (PST)". The notice points
    at the class, whose Assignments page lists the assignment. One insert for all of them; never
    raises."""
    local = accept_until.astimezone(tz)
    body = (
        f"You can submit until {local:%b} {local.day}, "
        f"{local.hour % 12 or 12}:{local:%M} {local:%p} ({local:%Z})"
    )
    _insert_notifications(
        [
            {
                "user_id": user_id,
                "type": "late_window_opened",
                "title": f"Late submissions open for {assignment_title}",
                "body": body,
                "entity_type": "class",
                "entity_id": class_id,
                "class_id": class_id,
            }
            for user_id in recipient_ids
        ]
    )


def notify_project_created_by_student(
    *,
    instructor_id: str,
    student_id: str,
    project_id: str,
    project_name: str,
    class_id: str | None = None,
) -> None:
    """Notify the class instructor when a student creates a project, e.g. "Sam Okafor created
    Trailhead"."""
    profile = _get_profile(student_id)
    _insert_notification(
        user_id=instructor_id,
        type="project_created",
        title=f"{profile_name(profile) or 'Someone'} created {project_name}",
        body=f'{profile_name(profile) or "A student"} created project "{project_name}".',
        entity_type="project",
        entity_id=project_id,
        class_id=class_id,
        project_id=project_id,
        actor_id=student_id,
    )


def notify_join_request_rejected(
    *,
    requester_id: str,
    project_id: str,
    project_name: str,
    class_id: str | None = None,
) -> None:
    """Notify the requesting student when their join request is denied, e.g. "Trailhead
    declined your request to join". Who declined it is not said."""
    try:
        _insert_notification(
            user_id=requester_id,
            type="join_rejected",
            title=f"{project_name} declined your request to join",
            body=f'Your request to join "{project_name}" was denied.',
            entity_type="project",
            entity_id=project_id,
            class_id=class_id,
            project_id=project_id,
        )
    except Exception:
        logger.exception(
            "notify_join_request_rejected failed | project_id=%s requester_id=%s",
            project_id,
            requester_id,
        )


#: All lists the last 30 days, read and unread; Unread lists every unread row, whatever its age.
WINDOW_DAYS = 30
PAGE_SIZE = 30
MAX_PAGE_SIZE = 100

_LIST_COLUMNS = (
    "id, type, title, body, entity_type, entity_id, read_at, created_at, message_count, "
    "class:classes(id, name), team:projects(id, name), "
    # notifications has two keys to profiles (user_id is the other), so the actor's names its own.
    "actor:profiles!notifications_actor_id_fkey(id, first_name, last_name, image_url)"
)
_ITEM_KEYS = ("id", "type", "title", "body", "entity_type", "entity_id", "read_at", "created_at")
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)
#: What a team channel adds to its team's name: "Trailhead · TAs".
_CHANNEL_SUFFIX = {"team_ta": "TAs", "team_instructor": "Instructor"}


def _now() -> datetime:
    """The clock the list's 30-day window reads (tests patch it)."""
    return datetime.now(UTC)


def _encode_cursor(created_at: str, id: str) -> str:
    """The cursor after a row: its ``created_at`` and ``id``, opaque to the client."""
    return base64.urlsafe_b64encode(f"{created_at}|{id}".encode()).decode().rstrip("=")


def _decode_cursor(cursor: str) -> tuple[str, str]:
    """The ``created_at`` (an instant with its zone) and ``id`` (a UUID) a cursor names, both
    rewritten in a canonical form before they reach a filter: the instant in UTC, the id in its
    hyphenated lower-case spelling (any spelling ``uuid.UUID`` reads is accepted). Anything else,
    an instant with no UTC equivalent among them, is a 422."""
    try:
        text = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        created_at, row_id = text.split("|")
        when = datetime.fromisoformat(created_at)
        if when.tzinfo is None:
            raise ValueError("a cursor's instant names its zone")
        return when.astimezone(UTC).isoformat(), str(uuid.UUID(row_id))
    except (ValueError, OverflowError, UnicodeDecodeError, binascii.Error):
        raise HTTPException(status_code=422, detail="Invalid cursor") from None


def _ref(row: dict | None) -> dict | None:
    return {"id": row["id"], "name": row.get("name") or ""} if row else None


def _actor(row: dict | None) -> dict | None:
    """The person who caused a notice, by name or ``""``: never their email."""
    if not row:
        return None
    return {"id": row["id"], "name": profile_name(row), "image_url": row.get("image_url")}


def _conversations(client, rows: list[dict]) -> dict[str, dict]:
    """The conversations the page's message rows are about, by id, in one read: a direct message
    is ``direct`` and unnamed (its sender is the row's actor); a team channel is ``team``, named
    for its team, with "TAs" or "Instructor" for those channels."""
    ids = sorted(
        {
            str(row["entity_id"]).lower()
            for row in rows
            if row.get("type") == "message" and _UUID.match(str(row.get("entity_id") or ""))
        }
    )
    if not ids:
        return {}
    found = (
        client.table("conversations")
        .select("id, type, project_id, projects(name)")
        .in_("id", ids)
        .execute()
    ).data or []
    out = {}
    for conv in found:
        if conv.get("type") == "dm":
            out[str(conv["id"]).lower()] = {"id": conv["id"], "kind": "direct", "name": ""}
            continue
        parts = [(conv.get("projects") or {}).get("name"), _CHANNEL_SUFFIX.get(conv.get("type"))]
        name = " · ".join(part for part in parts if part)
        out[str(conv["id"]).lower()] = {"id": conv["id"], "kind": "team", "name": name}
    return out


def list_notifications(
    user_id: str,
    *,
    view: Literal["unread", "all"] = "all",
    cursor: str | None = None,
    limit: int = PAGE_SIZE,
) -> dict:
    """A page of ``user_id``'s notifications, newest first, with the unread count.

    ``unread`` is every unread row, whatever its age; ``all`` is the last :data:`WINDOW_DAYS`
    days, read and unread. ``unread_count`` counts every unread row in both views. The cursor
    is the last row's ``created_at`` and ``id``, so rows that share an instant are neither
    repeated nor skipped; ``next_cursor`` is ``None`` on the last page. Each row names its class,
    team and actor (joined on read; ``None`` once deleted), a message row its conversation, and
    every row the messages it stands for (``message_count``, 1 when it holds none).

    Every read is filtered by ``user_id``. Round trips: on the first page the two reminders as
    before, then the page and the count together, then the page's conversations when it holds
    messages; a later page (a ``cursor``) runs no reminders.
    """
    after = _decode_cursor(cursor) if cursor is not None else None
    if after is None:
        # The reminders are the first page's: they may write notifications, and both reads below
        # must see them. A later page is the page and the count.
        ensure_profile_completion_notification(user_id)
        ensure_roster_upload_notifications(user_id)

    client = _client()

    def page() -> list[dict]:
        query = client.table("notifications").select(_LIST_COLUMNS).eq("user_id", user_id)
        if view == "unread":
            query = query.is_("read_at", "null")
        else:
            floor = _now() - timedelta(days=WINDOW_DAYS)
            query = query.gte("created_at", floor.isoformat())
        if after is not None:
            created_at, row_id = after
            query = query.or_(
                f'created_at.lt."{created_at}",and(created_at.eq."{created_at}",id.lt.{row_id})'
            )
        query = query.order("created_at", desc=True).order("id", desc=True)
        return query.limit(limit + 1).execute().data or []

    reads = fan_out(
        {
            "rows": page,
            "unread": lambda: (
                client.table("notifications")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .is_("read_at", "null")
                .execute()
            ),
        }
    )
    rows, unread_res = reads["rows"], reads["unread"]
    next_cursor = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = _encode_cursor(rows[-1]["created_at"], rows[-1]["id"])
    unread = (
        unread_res.count
        if unread_res.count is not None
        else sum(1 for r in rows if not r.get("read_at"))
    )
    conversations = _conversations(client, rows)

    return {
        "notifications": [
            {
                **{key: row.get(key) for key in _ITEM_KEYS},
                "class": _ref(row.get("class")),
                "team": _ref(row.get("team")),
                "actor": _actor(row.get("actor")),
                "conversation": (
                    conversations.get(str(row.get("entity_id") or "").lower())
                    if row.get("type") == "message"
                    else None
                ),
                "message_count": row.get("message_count") or 1,
            }
            for row in rows
        ],
        "unread_count": unread,
        "next_cursor": next_cursor,
    }


def mark_notification_read(notification_id: str, user_id: str) -> None:
    """Mark one of ``user_id``'s notifications read (again, if it already was).

    One update filtered by the id and the owner. 404 when it matches nothing: an id that
    never existed, a notification deleted since the list loaded, or another user's.
    """
    res = (
        _client()
        .table("notifications")
        .update({"read_at": _now_iso()})
        .eq("id", notification_id)
        .eq("user_id", user_id)
        .select("id")
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Notification not found")


def mark_notifications_read(ids: list[str], user_id: str) -> None:
    """Mark those of ``ids`` that are ``user_id``'s and still unread, read, in one update.

    An id of another user's notification, or of none, changes nothing, and the caller is not
    told which: the answer is the same either way. A row already read keeps when it was read.
    """
    _client().table("notifications").update({"read_at": _now_iso()}).in_("id", sorted(set(ids))).eq(
        "user_id", user_id
    ).is_("read_at", "null").execute()


def mark_all_read(user_id: str) -> None:
    _client().table("notifications").update(
        {
            "read_at": _now_iso(),
        }
    ).eq("user_id", user_id).is_("read_at", "null").execute()


def dismiss_message_notifications(user_id: str, conversation_id: str) -> None:
    """Mark message notifications for a conversation as read."""
    try:
        _client().table("notifications").update(
            {
                "read_at": _now_iso(),
            }
        ).eq("user_id", user_id).eq("type", "message").eq(
            "entity_id",
            conversation_id,
        ).is_("read_at", "null").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss message notifications | user_id=%s conv=%s",
            user_id,
            conversation_id,
        )
