"""Business logic for the messages feature.

Permissions, conversation creation, message insertion, inbox + thread
reads, and read marks. See docs/superpowers/specs/2026-04-23-messages-design.md
for the full design.
"""
from __future__ import annotations

import logging

from fastapi import HTTPException

from app.database.client import service_client

logger = logging.getLogger(__name__)

MAX_MESSAGE_CODEPOINTS = 1024


def get_profile_roles(user_ids: list[str]) -> dict[str, str | None]:
    """Return {user_id: role} for the given ids. Missing rows → None."""
    if not user_ids:
        return {}
    res = (
        service_client.table("profiles")
        .select("id, role")
        .in_("id", user_ids)
        .execute()
    )
    found = {row["id"]: row["role"] for row in (res.data or [])}
    return {uid: found.get(uid) for uid in user_ids}


def has_shared_class(a_id: str, b_id: str) -> bool:
    """Two users share a class iff each has a relationship (instructor or
    enrolled student) to at least one common class id."""
    def _user_classes(uid: str) -> set[str]:
        owned = (
            service_client.table("classes")
            .select("id")
            .eq("created_by", uid)
            .execute()
        )
        enrolled = (
            service_client.table("class_enrollments")
            .select("class_id")
            .eq("user_id", uid)
            .execute()
        )
        return {row["id"] for row in (owned.data or [])} | {
            row["class_id"] for row in (enrolled.data or [])
        }

    return bool(_user_classes(a_id) & _user_classes(b_id))


def can_message(a_id: str, b_id: str) -> bool:
    """Per spec Q1=C: students↔students, instructors↔students, no
    instructor↔instructor; both must share an active class."""
    if a_id == b_id:
        return False
    roles = get_profile_roles([a_id, b_id])
    if roles.get(a_id) == "instructor" and roles.get(b_id) == "instructor":
        return False
    return has_shared_class(a_id, b_id)


def _canonical_pair(a_id: str, b_id: str) -> tuple[str, str]:
    """Return (smaller, larger) so all (a, b) lookups hit one canonical row."""
    return (a_id, b_id) if a_id < b_id else (b_id, a_id)


def _get_or_create_conversation(a_id: str, b_id: str) -> str:
    """Return the conversation id for the pair, creating it if absent."""
    user_a, user_b = _canonical_pair(a_id, b_id)
    # NOTE: supabase-py 2.x returns *None* (not a response object) from
    # `.maybe_single().execute()` when no row matches. Older versions
    # returned a response with `data=None`. Always guard for `None`.
    existing = (
        service_client.table("conversations")
        .select("id")
        .eq("user_a", user_a)
        .eq("user_b", user_b)
        .maybe_single()
        .execute()
    )
    if existing is not None and existing.data:
        return existing.data["id"]
    created = (
        service_client.table("conversations")
        .insert({"user_a": user_a, "user_b": user_b})
        .execute()
    )
    if not created.data:
        # Lost a create race — refetch.
        refetch = (
            service_client.table("conversations")
            .select("id")
            .eq("user_a", user_a)
            .eq("user_b", user_b)
            .maybe_single()
            .execute()
        )
        if refetch is None or not refetch.data:
            raise HTTPException(
                status_code=500,
                detail="Conversation insert returned no data and refetch failed",
            )
        return refetch.data["id"]
    return created.data[0]["id"]


def send_message(*, sender_id: str, to_user_id: str, body: str) -> dict:
    """Validate, persist, and mark sender as read-up-to-now.

    Returns: {"conversation_id": "...", "message": {...row...}}.
    Raises HTTPException(400|403) on validation/eligibility failures.
    """
    if to_user_id == sender_id:
        raise HTTPException(status_code=400, detail="Cannot message yourself")

    cleaned = body.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body) > MAX_MESSAGE_CODEPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Message exceeds {MAX_MESSAGE_CODEPOINTS} character limit",
        )

    if not can_message(sender_id, to_user_id):
        logger.info(
            "send_message: blocked | sender=%s target=%s reason=ineligible",
            sender_id, to_user_id,
        )
        raise HTTPException(status_code=403, detail="Cannot message this user")

    conversation_id = _get_or_create_conversation(sender_id, to_user_id)

    inserted = (
        service_client.table("messages")
        .insert({
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "body": body,
        })
        .execute()
    )
    message_row = inserted.data[0]

    # Sender is implicitly "read" through their own latest send.
    service_client.table("conversation_reads").upsert({
        "conversation_id": conversation_id,
        "user_id": sender_id,
        "last_read_at": message_row["created_at"],
    }, on_conflict="conversation_id,user_id").execute()

    logger.info(
        "send_message: inserted | sender=%s conv=%s msg=%s",
        sender_id, conversation_id, message_row["id"],
    )

    from app.notifications.controller import notify_new_message
    notify_new_message(
        recipient_id=to_user_id,
        sender_id=sender_id,
        conversation_id=conversation_id,
        body=body,
    )

    return {"conversation_id": conversation_id, "message": message_row}


def _participant_ids(conversation_id: str) -> list[str]:
    """All participant user ids for a conversation.

    HARD DEPENDENCY: conversation_participants exists only after the
    2026-07-14_group_messaging.sql migration is applied (Task R1, gated).
    Do not deploy or preview this code against an unmigrated database —
    every conversation endpoint would 500, including existing DMs.
    """
    res = (
        service_client.table("conversation_participants")
        .select("user_id, role")
        .eq("conversation_id", conversation_id)
        .execute()
    )
    return [r["user_id"] for r in (res.data or [])]


def _require_participant(conversation_id: str, caller_id: str) -> dict:
    """Load conversation, ensuring caller is a participant.

    Raises 404 if the conversation doesn't exist, 403 if caller isn't a
    participant. Read-only conversations stay readable by participants.
    """
    res = (
        service_client.table("conversations")
        .select("id, type, user_a, user_b, project_id")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    # supabase-py 2.x: None when the row doesn't exist.
    conv = res.data if res is not None else None
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if caller_id not in _participant_ids(conversation_id):
        logger.warning(
            "messages: participant check failed | caller=%s conv=%s",
            caller_id, conversation_id,
        )
        raise HTTPException(status_code=403, detail="Not a participant")
    return conv


def list_messages(*, conversation_id: str, caller_id: str, limit: int = 50) -> list[dict]:
    """Latest `limit` messages for a conversation, newest first.

    Spec Q9=A: no scroll-up pagination in v1; we always return the latest
    `limit` and the frontend re-fetches the same set every poll tick.
    """
    _require_participant(conversation_id, caller_id)
    res = (
        service_client.table("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return res.data or []


def mark_read(*, conversation_id: str, caller_id: str) -> None:
    """Upsert caller's read marker to now()."""
    _require_participant(conversation_id, caller_id)
    from datetime import datetime, timezone
    service_client.table("conversation_reads").upsert({
        "conversation_id": conversation_id,
        "user_id": caller_id,
        "last_read_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="conversation_id,user_id").execute()

    from app.notifications.controller import dismiss_message_notifications
    dismiss_message_notifications(caller_id, conversation_id)


def delete_conversation_for_user(*, conversation_id: str, caller_id: str) -> None:
    """Hide the conversation from the caller's inbox (idempotent).

    Other party is unaffected. The conversation reappears in caller's inbox
    if the other party sends a new message after this delete.
    """
    _require_participant(conversation_id, caller_id)
    from datetime import datetime, timezone
    service_client.table("conversation_deletes").upsert({
        "conversation_id": conversation_id,
        "user_id": caller_id,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="conversation_id,user_id").execute()
    logger.info(
        "delete_conversation: caller=%s conv=%s",
        caller_id, conversation_id,
    )


def list_inbox(*, caller_id: str) -> list[dict]:
    """Caller's conversations (DMs + team channels), hydrated and sorted.

    One SQL round trip: the messages_inbox() Postgres function computes
    last-message previews, unread counts (bounded, index-backed), the
    participant list, per-user hide state, and DM can_send — replacing the
    old bulk pull of up to 5,000 messages into Python memory. Must be
    called via the service-role client: under an RLS'd role the
    participants array would collapse to the caller's own row.
    """
    res = service_client.rpc("messages_inbox", {"p_user": caller_id}).execute()
    rows = res.data or []
    out: list[dict] = []
    for r in rows:
        parts = r.get("participants") or []  # `or []`: RPC emits null, not missing key
        other = None
        other_last_read = None
        if r["type"] == "dm":
            others = [p for p in parts if p["id"] != caller_id]
            if others:
                o = others[0]
                first = (o.get("first_name") or "").strip()
                last = (o.get("last_name") or "").strip()
                other = {
                    "id": o["id"],
                    "email": o.get("email"),
                    "name": f"{first} {last}".strip() or None,
                    "first_name": o.get("first_name"),
                    "last_name": o.get("last_name"),
                    "image_url": o.get("image_url"),
                }
                other_last_read = o.get("last_read_at")
        out.append({
            "id": r["id"],
            "type": r["type"],
            "project_id": r.get("project_id"),
            "team_name": r.get("team_name"),
            "participants": parts,
            "other_user": other,
            "last_message": r.get("last_message"),
            "unread_count": r.get("unread_count") or 0,
            "other_user_last_read_at": other_last_read,
            "can_send": bool(r.get("can_send")),
            "last_message_at": r.get("last_message_at"),
        })
    return out
