"""Business logic for the messages feature.

Permissions, conversation creation, message insertion, inbox + thread
reads, and read marks. See docs/superpowers/specs/2026-04-23-messages-design.md
for the full design.
"""
from __future__ import annotations

import logging
import re

from fastapi import HTTPException

from app.database.client import service_client

logger = logging.getLogger(__name__)

MAX_MESSAGE_CODEPOINTS = 1024

# Cursor-half shapes for list_messages' keyset cursor. The point is to
# exclude PostgREST filter metacharacters (dots, commas, parens) so cursor
# values can't smuggle extra OR terms into the or= filter — not to enforce
# a strict timestamp/UUID grammar. The id half is deliberately
# alphanumeric-and-dashes (not hex-only): looser than UUID, still inert.
_CURSOR_TS_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+\-]+")
_CURSOR_ID_RE = re.compile(r"[0-9a-zA-Z\-]{1,64}")


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


def notify_recipients(
    *, recipient_ids: list[str], sender_id: str, conversation_id: str, body: str,
) -> None:
    """Fan out the new-message notification to every other participant."""
    from app.notifications.controller import notify_new_message
    for recipient_id in recipient_ids:
        try:
            notify_new_message(
                recipient_id=recipient_id,
                sender_id=sender_id,
                conversation_id=conversation_id,
                body=body,
            )
        except Exception:
            # Notifications are best-effort: never fail a persisted send,
            # never let one recipient's failure starve the rest.
            logger.exception(
                "notify_recipients: failed | recipient=%s conv=%s",
                recipient_id, conversation_id,
            )


def send_message(
    *,
    sender_id: str,
    body: str,
    to_user_id: str | None = None,
    conversation_id: str | None = None,
) -> dict:
    """Validate, persist, and mark sender as read-up-to-now.

    Targets exactly one of:
      - to_user_id: DM shortcut (creates the conversation on first send);
      - conversation_id: an existing conversation — DM or team channel.
    Returns: {"conversation_id": "...", "message": {...row...}}.
    Raises HTTPException(400|403|404) on validation/eligibility failures.
    """
    if bool(to_user_id) == bool(conversation_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of to_user_id or conversation_id",
        )

    cleaned = body.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    if len(body) > MAX_MESSAGE_CODEPOINTS:
        raise HTTPException(
            status_code=400,
            detail=f"Message exceeds {MAX_MESSAGE_CODEPOINTS} character limit",
        )

    if conversation_id:
        conv = _require_participant(conversation_id, sender_id)
        participant_ids = _participant_ids(conversation_id)
        if conv["type"] == "dm":
            other_id = conv["user_b"] if conv["user_a"] == sender_id else conv["user_a"]
            if not can_message(sender_id, other_id):
                logger.info(
                    "send_message: blocked | sender=%s conv=%s reason=dm-ineligible",
                    sender_id, conversation_id,
                )
                raise HTTPException(status_code=403, detail="Cannot message this user")
        recipient_ids = [uid for uid in participant_ids if uid != sender_id]
    else:
        if to_user_id == sender_id:
            raise HTTPException(status_code=400, detail="Cannot message yourself")
        if not can_message(sender_id, to_user_id):
            logger.info(
                "send_message: blocked | sender=%s target=%s reason=ineligible",
                sender_id, to_user_id,
            )
            raise HTTPException(status_code=403, detail="Cannot message this user")
        conversation_id = _get_or_create_conversation(sender_id, to_user_id)
        recipient_ids = [to_user_id]

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

    notify_recipients(
        recipient_ids=recipient_ids,
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


def list_messages(
    *,
    conversation_id: str,
    caller_id: str,
    limit: int = 50,
    before: str | None = None,
) -> dict:
    """A page of messages, newest first, with keyset pagination.

    `before` is an opaque cursor "<created_at>|<id>" from a previous page.
    Returns {"messages": [...], "next_cursor": str | None} — next_cursor is
    None when there is no older history.
    """
    _require_participant(conversation_id, caller_id)
    limit = max(1, min(limit, 100))

    # Validate the cursor before touching the DB client: fail fast on bad
    # input rather than depend on a service_client that may be unset.
    before_created_at: str | None = None
    before_id: str | None = None
    if before is not None:
        try:
            before_created_at, before_id = before.split("|", 1)
            if not before_created_at or not before_id:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed cursor")
        if not (_CURSOR_TS_RE.fullmatch(before_created_at)
                and _CURSOR_ID_RE.fullmatch(before_id)):
            raise HTTPException(status_code=400, detail="Malformed cursor")

    query = (
        service_client.table("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversation_id)
    )
    if before_created_at is not None:
        query = query.or_(
            f"created_at.lt.{before_created_at},"
            f"and(created_at.eq.{before_created_at},id.lt.{before_id})"
        )
    res = (
        query
        .order("created_at", desc=True)
        .order("id", desc=True)
        .limit(limit)
        .execute()
    )
    messages = res.data or []
    next_cursor = None
    if len(messages) == limit:
        tail = messages[-1]
        next_cursor = f"{tail['created_at']}|{tail['id']}"
    return {"messages": messages, "next_cursor": next_cursor}


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

    HARD DEPENDENCY: the messages_inbox() SQL function exists only after
    the 2026-07-14 migration (Task R1, gated).
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
            # Peer absent from participants should be unreachable (DM
            # user_a/user_b FKs have no cascade), but fail soft rather than 500.
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


def list_contacts(*, caller_id: str, query: str | None = None) -> list[dict]:
    """Everyone the caller may DM: peers across the caller's classes
    (enrolled students/TAs + class owners), minus self and minus
    instructor↔instructor pairs. Optional case-insensitive name/email filter.

    Mirrors can_message() eligibility — keep the two in sync (same
    convention as the messages_inbox RPC).

    Replaces the frontend's per-class getClassStudents() fan-out.
    """
    owned = (
        service_client.table("classes")
        .select("id, created_by")
        .eq("created_by", caller_id)
        .execute()
    )
    enrolled = (
        service_client.table("class_enrollments")
        .select("class_id")
        .eq("user_id", caller_id)
        .execute()
    )
    class_ids = sorted(
        {r["id"] for r in (owned.data or [])}
        | {r["class_id"] for r in (enrolled.data or [])}
    )
    if not class_ids:
        return []

    peers_enrolled = (
        service_client.table("class_enrollments")
        .select("class_id, user_id")
        .in_("class_id", class_ids)
        .execute()
    )
    peers_owning = (
        service_client.table("classes")
        .select("id, created_by")
        .in_("id", class_ids)
        .execute()
    )
    peer_ids = (
        {r["user_id"] for r in (peers_enrolled.data or [])}
        | {r["created_by"] for r in (peers_owning.data or [])}
    ) - {caller_id}
    if not peer_ids:
        return []

    profiles_res = (
        service_client.table("profiles")
        .select("id, email, role, first_name, last_name, image_url")
        .in_("id", sorted(peer_ids | {caller_id}))
        .execute()
    )
    profiles = {p["id"]: p for p in (profiles_res.data or [])}
    caller_role = (profiles.get(caller_id) or {}).get("role")

    needle = (query or "").strip().lower()[:100]
    out: list[dict] = []
    for uid in sorted(peer_ids):
        p = profiles.get(uid)
        if not p:
            # Deliberate: enrollments whose profiles row is missing (orphaned
            # enrollment / auth-glue gap) are omitted — an unnameable contact
            # is worse than an absent one. can_message stays permissive, so
            # such users remain messageable via direct sends.
            continue
        if caller_role == "instructor" and p.get("role") == "instructor":
            continue
        first = (p.get("first_name") or "").strip()
        last = (p.get("last_name") or "").strip()
        name = f"{first} {last}".strip() or None
        if needle:
            haystack = f"{name or ''} {p.get('email') or ''}".lower()
            if needle not in haystack:
                continue
        out.append({
            "id": uid,
            "name": name,
            "first_name": p.get("first_name"),
            "last_name": p.get("last_name"),
            "email": p.get("email"),
            "image_url": p.get("image_url"),
            "role": p.get("role"),
        })
    out.sort(key=lambda c: (c["name"] or c["email"] or "").lower())
    return out[:500]  # accepted cap: course-scale peers ≪ 500; no has_more contract (see plan B7)
