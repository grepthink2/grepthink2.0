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
    existing = (
        service_client.table("conversations")
        .select("id")
        .eq("user_a", user_a)
        .eq("user_b", user_b)
        .maybe_single()
        .execute()
    )
    if existing.data:
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
