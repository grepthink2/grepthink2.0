"""Business logic for in-app notifications."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.database.client import service_client
from app.utils.profiles import profile_display_name

logger = logging.getLogger(__name__)

NOTIFICATION_TYPES = frozenset({
    "join_request",
    "join_rejected",
    "message",
    "project_created",
    "complete_profile",
    "upload_roster",
    "member_removed",
})

ELEVATED_PROJECT_ROLES = ("owner", "product owner", "admin")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _client():
    if service_client is None:
        raise HTTPException(status_code=503, detail="Service unavailable")
    return service_client


def _insert_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    body: str,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    if type not in NOTIFICATION_TYPES:
        logger.warning("Unknown notification type %r — skipping", type)
        return
    try:
        _client().table("notifications").insert({
            "user_id": user_id,
            "type": type,
            "title": title,
            "body": body,
            "entity_type": entity_type,
            "entity_id": entity_id,
        }).execute()
    except Exception:
        logger.exception(
            "Failed to insert notification | user_id=%s type=%s", user_id, type,
        )


def _upsert_unread_notification(
    *,
    user_id: str,
    type: str,
    title: str,
    body: str,
    entity_type: Optional[str],
    entity_id: Optional[str],
) -> None:
    """Update an existing unread notification for the same entity, or insert."""
    try:
        client = _client()
        query = (
            client.table("notifications")
            .select("id, title, body")
            .eq("user_id", user_id)
            .eq("type", type)
            .is_("read_at", "null")
        )
        if entity_id is not None:
            query = query.eq("entity_id", entity_id)
        existing = query.limit(1).execute()

        if existing.data:
            row = existing.data[0]
            # Skip a no-op write. Because list_notifications() calls the
            # ensure_* helpers on every GET, re-writing identical content would
            # emit a realtime change event, which the client's subscription
            # turns back into another GET — an endless refetch loop. Only write
            # when the content actually changed.
            if row.get("title") == title and row.get("body") == body:
                return
            client.table("notifications").update({
                "title": title,
                "body": body,
                "created_at": _now_iso(),
            }).eq("id", row["id"]).execute()
            return

        _insert_notification(
            user_id=user_id,
            type=type,
            title=title,
            body=body,
            entity_type=entity_type,
            entity_id=entity_id,
        )
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Failed to upsert notification | user_id=%s type=%s", user_id, type,
        )


def _get_profile(user_id: str) -> dict:
    res = (
        _client().table("profiles")
        .select("id, email, role, first_name, last_name, edu_email")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    )
    return res.data or {}


def _profile_needs_completion(profile: dict) -> bool:
    """True when name is missing or a student lacks a roster .edu email."""
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    if not first or not last:
        return True

    role = profile.get("role")
    email = (profile.get("email") or "").strip().lower()
    edu_email = (profile.get("edu_email") or "").strip()
    if role == "student" and not email.endswith(".edu") and not edu_email:
        return True
    return False


_PROFILE_NOTIFICATION_COOLDOWN_SECONDS = 300  # 5 minutes


def ensure_profile_completion_notification(user_id: str) -> None:
    """Maintain exactly one profile-completion reminder per user.

    After dismissal the notification re-surfaces after a 5-minute cooldown so
    the user isn't immediately re-notified on the next poll.
    """
    profile = _get_profile(user_id)
    if not profile or not _profile_needs_completion(profile):
        dismiss_profile_completion_notification(user_id)
        return

    missing: list[str] = []
    if not (profile.get("first_name") or "").strip():
        missing.append("first name")
    if not (profile.get("last_name") or "").strip():
        missing.append("last name")
    role = profile.get("role")
    email = (profile.get("email") or "").strip().lower()
    edu_email = (profile.get("edu_email") or "").strip()
    if role == "student" and not email.endswith(".edu") and not edu_email:
        missing.append("roster .edu email")

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
                    dismissed_at = datetime.fromisoformat(
                        read_at_raw.replace("Z", "+00:00")
                    )
                    elapsed = (datetime.now(timezone.utc) - dismissed_at).total_seconds()
                except (ValueError, TypeError):
                    elapsed = _PROFILE_NOTIFICATION_COOLDOWN_SECONDS  # treat as expired

                if elapsed >= _PROFILE_NOTIFICATION_COOLDOWN_SECONDS:
                    client.table("notifications").update({
                        "title": title,
                        "body": body,
                        "read_at": None,
                        "created_at": _now_iso(),
                    }).eq("id", row["id"]).execute()
                # else: still in cooldown; leave it dismissed
            else:
                # Already unread — refresh only when the content actually
                # changed. A no-op update emits a realtime event, and since
                # this runs on every GET that would loop the client's refetch
                # endlessly.
                if row.get("title") != title or row.get("body") != body:
                    client.table("notifications").update({
                        "title": title,
                        "body": body,
                    }).eq("id", row["id"]).execute()
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
            "ensure_profile_completion_notification failed | user_id=%s", user_id,
        )


def dismiss_profile_completion_notification(user_id: str) -> None:
    """Profile is now complete — delete all complete_profile notifications for this user."""
    try:
        _client().table("notifications").delete().eq(
            "user_id", user_id,
        ).eq("type", "complete_profile").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss profile notification | user_id=%s", user_id,
        )


def _class_has_roster(client, class_id: str) -> bool:
    res = (
        client.table("roster_entries")
        .select("id")
        .eq("course_id", class_id)
        .limit(1)
        .execute()
    )
    return bool(res.data)


def ensure_roster_upload_notifications(user_id: str) -> None:
    """Remind instructors to upload roster CSV for each class that has none."""
    profile = _get_profile(user_id)
    if profile.get("role") != "instructor":
        return

    client = _client()
    classes_res = (
        client.table("classes")
        .select("id, name")
        .eq("created_by", user_id)
        .execute()
    )
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
            )


def dismiss_roster_upload_notification(user_id: str, class_id: str) -> None:
    """Remove roster-upload reminder once a roster exists for the class."""
    try:
        _client().table("notifications").update({
            "read_at": _now_iso(),
        }).eq("user_id", user_id).eq("type", "upload_roster").eq(
            "entity_id", class_id,
        ).is_("read_at", "null").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss roster notification | user_id=%s class_id=%s",
            user_id, class_id,
        )


def notify_join_request(
    *,
    project_id: str,
    project_name: str,
    request_id: str,
    requester_id: str,
    message: Optional[str] = None,
) -> None:
    """Notify project owners/admins when someone requests to join."""
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
        if not owner_ids:
            return

        requester_name = profile_display_name(_get_profile(requester_id)) or "A student"
        title = "New join request"
        body = f"{requester_name} requested to join {project_name}."
        clean_message = message.strip() if isinstance(message, str) else ""
        if clean_message:
            body = f'{body} "{clean_message}"'

        for owner_id in owner_ids:
            _insert_notification(
                user_id=owner_id,
                type="join_request",
                title=title,
                body=body,
                entity_type="project",
                entity_id=project_id,
            )
    except Exception:
        logger.exception(
            "notify_join_request failed | project_id=%s request_id=%s",
            project_id, request_id,
        )


def notify_new_message(
    *,
    recipient_id: str,
    sender_id: str,
    conversation_id: str,
    body: str,
) -> None:
    """Notify a participant when they receive a new message.

    All roles get message notifications — TA/instructor channels mean staff
    must hear replies (changed 2026-07-14; was students-only)."""
    sender_name = profile_display_name(_get_profile(sender_id)) or "Someone"
    preview = body.strip()
    if len(preview) > 120:
        preview = preview[:117] + "..."

    _upsert_unread_notification(
        user_id=recipient_id,
        type="message",
        title=f"New message from {sender_name}",
        body=preview or "You have a new message.",
        entity_type="conversation",
        entity_id=conversation_id,
    )


def notify_project_created_by_student(
    *,
    instructor_id: str,
    student_id: str,
    project_id: str,
    project_name: str,
) -> None:
    """Notify the class instructor when a student creates a project."""
    student_name = profile_display_name(_get_profile(student_id)) or "A student"
    _insert_notification(
        user_id=instructor_id,
        type="project_created",
        title="New student project",
        body=f"{student_name} created project \"{project_name}\".",
        entity_type="project",
        entity_id=project_id,
    )


def notify_join_request_rejected(
    *,
    requester_id: str,
    project_id: str,
    project_name: str,
) -> None:
    """Notify the requesting student when their join request is denied."""
    try:
        _insert_notification(
            user_id=requester_id,
            type="join_rejected",
            title="Join request denied",
            body=f'Your request to join "{project_name}" was denied.',
            entity_type="project",
            entity_id=project_id,
        )
    except Exception:
        logger.exception(
            "notify_join_request_rejected failed | project_id=%s requester_id=%s",
            project_id, requester_id,
        )


def notify_team_member_dropped_from_roster(
    *,
    project_id: str,
    project_name: str,
    removed_user_id: str,
    removed_user_name: str,
    recipient_ids: list[str] | None = None,
) -> None:
    """Notify remaining project members that a teammate was dropped from the course."""
    try:
        if recipient_ids is None:
            client = _client()
            members_res = (
                client.table("project_members")
                .select("user_id")
                .eq("project_id", project_id)
                .execute()
            )
            recipient_ids = [
                str(row["user_id"])
                for row in (members_res.data or [])
                if row.get("user_id") and str(row["user_id"]) != str(removed_user_id)
            ]
        else:
            recipient_ids = [
                str(uid) for uid in recipient_ids
                if uid and str(uid) != str(removed_user_id)
            ]

        if not recipient_ids:
            return

        title = "Team member removed"
        body = (
            f"{removed_user_name} has dropped the course and was removed from "
            f"\"{project_name}\"."
        )
        for user_id in recipient_ids:
            _insert_notification(
                user_id=user_id,
                type="member_removed",
                title=title,
                body=body,
                entity_type="project",
                entity_id=project_id,
            )
    except Exception:
        logger.exception(
            "notify_team_member_dropped_from_roster failed | project_id=%s removed_user=%s",
            project_id, removed_user_id,
        )


def list_notifications(user_id: str, *, limit: int = 50) -> dict:
    ensure_profile_completion_notification(user_id)
    ensure_roster_upload_notifications(user_id)

    client = _client()
    res = (
        client.table("notifications")
        .select("id, type, title, body, entity_type, entity_id, read_at, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    rows = res.data or []

    unread_res = (
        client.table("notifications")
        .select("id", count="exact")
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .execute()
    )
    unread = unread_res.count if unread_res.count is not None else sum(
        1 for r in rows if not r.get("read_at")
    )

    return {"notifications": rows, "unread_count": unread}


def mark_notification_read(notification_id: str, user_id: str) -> None:
    res = (
        _client().table("notifications")
        .select("id")
        .eq("id", notification_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Notification not found")

    _client().table("notifications").update({
        "read_at": _now_iso(),
    }).eq("id", notification_id).eq("user_id", user_id).execute()


def mark_all_read(user_id: str) -> None:
    _client().table("notifications").update({
        "read_at": _now_iso(),
    }).eq("user_id", user_id).is_("read_at", "null").execute()


def dismiss_message_notifications(user_id: str, conversation_id: str) -> None:
    """Mark message notifications for a conversation as read."""
    try:
        _client().table("notifications").update({
            "read_at": _now_iso(),
        }).eq("user_id", user_id).eq("type", "message").eq(
            "entity_id", conversation_id,
        ).is_("read_at", "null").execute()
    except Exception:
        logger.exception(
            "Failed to dismiss message notifications | user_id=%s conv=%s",
            user_id, conversation_id,
        )
