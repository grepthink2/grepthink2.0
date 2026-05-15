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


# Soft cap on how many messages we pull when computing the inbox in bulk.
# 5_000 covers every realistic class (≈50 conversations × ≈100 messages) and
# keeps the JSON payload small. Conversations whose last message falls
# outside this window are detected in code and patched up via a single
# fallback query each (almost always 0).
_INBOX_BULK_MESSAGE_LIMIT = 5_000


def list_inbox(*, caller_id: str) -> list[dict]:
    """Return all conversations the caller participates in, hydrated with
    other_user, last_message, unread_count, other_user_last_read_at, can_send.

    Filters out conversations with no messages (last_message_at IS NULL).
    Sorted by last_message_at DESC.

    Performance: this used to be O(N) per-conversation queries (last
    message, unread count, plus 5 ``can_message`` queries each). It is now
    O(1) bulk queries regardless of conversation count: one for the
    conversations themselves, one for profiles+roles, one for read marks,
    one for messages (which feeds both last-message-preview and unread
    counts), and two for shared-class lookups across all peers. With ~10
    conversations the difference is roughly 70 round-trips → 6.
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
    # Caller is included so we can look up the caller's role + classes in
    # the same bulk queries we use for every peer.
    all_user_ids = list({*other_ids, caller_id})

    # ----- bulk read 1: profiles for everyone ----------------------------
    # Only select columns that exist on every deployment. Some schemas have
    # no ``profiles.name`` (display name is derived from email in the API).
    profiles_res = (
        service_client.table("profiles")
        .select("id, email, role")
        .in_("id", all_user_ids)
        .execute()
    )
    profiles_by_id: dict[str, dict] = {
        p["id"]: p for p in (profiles_res.data or [])
    }

    # ----- bulk read 2: read markers across all caller-relevant convs ---
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

    # ----- bulk read 3: messages for every conversation ----------------
    # Used twice: (a) latest message preview per conversation,
    # (b) per-conversation unread counts. Capped to keep the payload
    # bounded — see _INBOX_BULK_MESSAGE_LIMIT.
    msgs_res = (
        service_client.table("messages")
        .select("id, conversation_id, sender_id, body, created_at")
        .in_("conversation_id", conv_ids)
        .order("created_at", desc=True)
        .limit(_INBOX_BULK_MESSAGE_LIMIT)
        .execute()
    )
    last_msg_by_conv: dict[str, dict] = {}
    unread_by_conv: dict[str, int] = {cid: 0 for cid in conv_ids}
    for m in (msgs_res.data or []):
        cid = m["conversation_id"]
        # First time we hit a conversation in desc order = its latest msg.
        if cid not in last_msg_by_conv:
            last_msg_by_conv[cid] = {
                "id": m["id"],
                "sender_id": m["sender_id"],
                "body": m["body"],
                "created_at": m["created_at"],
            }
        if m["sender_id"] == caller_id:
            continue
        caller_last_read = reads_by_conv.get(cid, {}).get(caller_id)
        if caller_last_read is None or m["created_at"] > caller_last_read:
            unread_by_conv[cid] = unread_by_conv.get(cid, 0) + 1

    # Fallback: any conversation whose last message wasn't in the bulk
    # window (extremely large histories). Each missing conv costs one
    # tiny query; in practice this loop is empty.
    missing_last = [cid for cid in conv_ids if cid not in last_msg_by_conv]
    for cid in missing_last:
        fallback = (
            service_client.table("messages")
            .select("id, sender_id, body, created_at")
            .eq("conversation_id", cid)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if fallback.data:
            last_msg_by_conv[cid] = fallback.data[0]

    # ----- bulk reads 4 & 5: shared-class lookup for can_send ---------
    owned_res = (
        service_client.table("classes")
        .select("id, created_by")
        .in_("created_by", all_user_ids)
        .execute()
    )
    enrolled_res = (
        service_client.table("class_enrollments")
        .select("class_id, user_id")
        .in_("user_id", all_user_ids)
        .execute()
    )
    user_to_classes: dict[str, set[str]] = {uid: set() for uid in all_user_ids}
    for r in (owned_res.data or []):
        user_to_classes.setdefault(r["created_by"], set()).add(r["id"])
    for r in (enrolled_res.data or []):
        user_to_classes.setdefault(r["user_id"], set()).add(r["class_id"])

    caller_role = (profiles_by_id.get(caller_id) or {}).get("role")
    caller_classes = user_to_classes.get(caller_id, set())

    def _can_send_to(other_id: str) -> bool:
        if other_id == caller_id:
            return False
        other_role = (profiles_by_id.get(other_id) or {}).get("role")
        # Spec: no instructor↔instructor messaging.
        if caller_role == "instructor" and other_role == "instructor":
            return False
        return bool(caller_classes & user_to_classes.get(other_id, set()))

    out: list[dict] = []
    for row in rows:
        cid = row["id"]
        other_id = row["user_b"] if row["user_a"] == caller_id else row["user_a"]
        peer_profile = profiles_by_id.get(other_id) or {}
        out.append({
            "id": cid,
            "other_user": {
                "id": other_id,
                "email": peer_profile.get("email"),
                "name": peer_profile.get("name") or peer_profile.get("email"),
            },
            "last_message": last_msg_by_conv.get(cid),
            "unread_count": unread_by_conv.get(cid, 0),
            "other_user_last_read_at": reads_by_conv.get(cid, {}).get(other_id),
            "can_send": _can_send_to(other_id),
            "last_message_at": row["last_message_at"],
        })
    return out
