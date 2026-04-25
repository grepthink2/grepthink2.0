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
    return {"conversation_id": conversation_id, "message": message_row}


def _conversation_or_403(conversation_id: str, caller_id: str) -> dict:
    """Load conversation, ensuring caller is one of its two participants.

    Raises 404 if the conversation doesn't exist, 403 if caller isn't a participant.
    Honors Q4=A: read-only conversations stay readable by their participants.
    """
    res = (
        service_client.table("conversations")
        .select("id, user_a, user_b")
        .eq("id", conversation_id)
        .maybe_single()
        .execute()
    )
    # supabase-py 2.x: None when the row doesn't exist.
    conv = res.data if res is not None else None
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if caller_id not in (conv["user_a"], conv["user_b"]):
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
    _conversation_or_403(conversation_id, caller_id)
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
    _conversation_or_403(conversation_id, caller_id)
    from datetime import datetime, timezone
    service_client.table("conversation_reads").upsert({
        "conversation_id": conversation_id,
        "user_id": caller_id,
        "last_read_at": datetime.now(timezone.utc).isoformat(),
    }, on_conflict="conversation_id,user_id").execute()


def list_inbox(*, caller_id: str) -> list[dict]:
    """Return all conversations the caller participates in, hydrated with
    other_user, last_message, unread_count, other_user_last_read_at, can_send.

    Filters out conversations with no messages (last_message_at IS NULL).
    Sorted by last_message_at DESC.
    """
    convs = (
        service_client.table("conversations")
        .select("id, user_a, user_b, last_message_at")
        .or_(f"user_a.eq.{caller_id},user_b.eq.{caller_id}")
        .not_.is_("last_message_at", "null")
        .order("last_message_at", desc=True)
        .execute()
    )
    rows = convs.data or []
    if not rows:
        return []

    other_ids = [
        (r["user_b"] if r["user_a"] == caller_id else r["user_a"])
        for r in rows
    ]
    conv_ids = [r["id"] for r in rows]

    profiles_res = (
        service_client.table("profiles")
        .select("id, email, name")
        .in_("id", other_ids)
        .execute()
    )
    profiles_by_id = {p["id"]: p for p in (profiles_res.data or [])}

    reads_res = (
        service_client.table("conversation_reads")
        .select("conversation_id, user_id, last_read_at")
        .in_("conversation_id", conv_ids)
        .execute()
    )
    # reads_by_conv: {conv_id: {user_id: last_read_at}}
    reads_by_conv: dict[str, dict[str, str]] = {}
    for r in (reads_res.data or []):
        reads_by_conv.setdefault(r["conversation_id"], {})[r["user_id"]] = r["last_read_at"]

    out: list[dict] = []
    for row in rows:
        other_id = row["user_b"] if row["user_a"] == caller_id else row["user_a"]
        other_user = profiles_by_id.get(other_id)
        if other_user is None:
            other_user = {"id": other_id, "email": None, "name": None}

        # Latest message preview
        last_msg_res = (
            service_client.table("messages")
            .select("id, sender_id, body, created_at")
            .eq("conversation_id", row["id"])
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        last_message = (last_msg_res.data or [None])[0]

        # Unread for caller: messages newer than caller's last_read, sent by other.
        caller_last_read = reads_by_conv.get(row["id"], {}).get(caller_id)
        unread_count = 0
        if caller_last_read is None:
            # Never marked read — every message from other counts as unread.
            unread_res = (
                service_client.table("messages")
                .select("id", count="exact")
                .eq("conversation_id", row["id"])
                .neq("sender_id", caller_id)
                .execute()
            )
            unread_count = unread_res.count or 0
        else:
            unread_res = (
                service_client.table("messages")
                .select("id", count="exact")
                .eq("conversation_id", row["id"])
                .gt("created_at", caller_last_read)
                .neq("sender_id", caller_id)
                .execute()
            )
            unread_count = unread_res.count or 0

        other_last_read = reads_by_conv.get(row["id"], {}).get(other_id)

        out.append({
            "id": row["id"],
            "other_user": other_user,
            "last_message": last_message,
            "unread_count": unread_count,
            "other_user_last_read_at": other_last_read,
            "can_send": can_message(caller_id, other_id),
            "last_message_at": row["last_message_at"],
        })
    return out
