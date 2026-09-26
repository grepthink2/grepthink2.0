"""Business logic for the messages feature.

Permissions, conversation creation, message insertion, inbox + thread
reads, and read marks. See docs/superpowers/specs/2026-04-23-messages-design.md
for the full design.
"""

from __future__ import annotations

import logging
import re
import uuid
from datetime import UTC

from fastapi import HTTPException

from app.core.db import fan_out, get_client

logger = logging.getLogger(__name__)

MAX_MESSAGE_CODEPOINTS = 1024

# Cursor-half shapes for list_messages' keyset cursor. The point is to
# exclude PostgREST filter metacharacters (dots, commas, parens) so cursor
# values can't smuggle extra OR terms into the or= filter — not to enforce
# a strict timestamp/UUID grammar. The id half is deliberately
# alphanumeric-and-dashes (not hex-only): looser than UUID, still inert.
_CURSOR_TS_RE = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.+\-]+")
_CURSOR_ID_RE = re.compile(r"[0-9a-zA-Z\-]{1,64}")


def _id_key(value: object) -> str:
    """An id in the form Postgres compares uuids in (lower-case, hyphenated).

    Rows come back with canonical uuids while request ids are free-form strings.
    A per-user ``.eq()`` let Postgres absorb the difference; rows read for several
    users at once with ``.in_()`` are matched back to them on this key instead.
    Values that are not uuids compare as plain strings.
    """
    try:
        return str(uuid.UUID(str(value)))
    except ValueError:
        return str(value)


def has_shared_class(a_id: str, b_id: str) -> bool:
    """Two users share a class iff each has a relationship (instructor or
    enrolled student/TA) to at least one common class id.

    Two reads in one wave — the classes either user owns and either user's
    enrollments — where it used to be those two reads per user, four in a row.
    """
    client = get_client()
    user_ids = [a_id, b_id]
    reads = fan_out(
        {
            "owned": lambda: (
                (
                    client.table("classes")
                    .select("id, created_by")
                    .in_("created_by", user_ids)
                    .execute()
                ).data
                or []
            ),
            "enrolled": lambda: (
                (
                    client.table("class_enrollments")
                    .select("class_id, user_id")
                    .in_("user_id", user_ids)
                    .execute()
                ).data
                or []
            ),
        }
    )
    classes_of: dict[str, set[str]] = {}
    for row in reads["owned"]:
        classes_of.setdefault(_id_key(row["created_by"]), set()).add(row["id"])
    for row in reads["enrolled"]:
        classes_of.setdefault(_id_key(row["user_id"]), set()).add(row["class_id"])
    return bool(classes_of.get(_id_key(a_id), set()) & classes_of.get(_id_key(b_id), set()))


def can_message(a_id: str, b_id: str) -> bool:
    """Two different people who share a class may message each other.

    There used to be no instructor↔instructor messaging, by account role. A class has one
    instructor, so two instructors only share a class when one of them is enrolled in it (as a
    TA, say), and then they must be able to talk.
    """
    if a_id == b_id:
        return False
    return has_shared_class(a_id, b_id)


def _canonical_pair(a_id: str, b_id: str) -> tuple[str, str]:
    """Return (smaller, larger) so all (a, b) lookups hit one canonical row."""
    return (a_id, b_id) if a_id < b_id else (b_id, a_id)


def _get_or_create_conversation(a_id: str, b_id: str) -> str:
    """Return the conversation id for the pair, creating it if absent."""
    user_a, user_b = _canonical_pair(a_id, b_id)
    client = get_client()
    # NOTE: supabase-py 2.x returns *None* (not a response object) from
    # `.maybe_single().execute()` when no row matches. Older versions
    # returned a response with `data=None`. Always guard for `None`.
    existing = (
        client.table("conversations")
        .select("id")
        .eq("user_a", user_a)
        .eq("user_b", user_b)
        .maybe_single()
        .execute()
    )
    if existing is not None and existing.data:
        return existing.data["id"]
    created = client.table("conversations").insert({"user_a": user_a, "user_b": user_b}).execute()
    if not created.data:
        # Lost a create race — refetch.
        refetch = (
            client.table("conversations")
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
    *,
    recipient_ids: list[str],
    sender_id: str,
    conversation_id: str,
    body: str,
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
                recipient_id,
                conversation_id,
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
                    sender_id,
                    conversation_id,
                )
                raise HTTPException(status_code=403, detail="Cannot message this user")
        recipient_ids = [uid for uid in participant_ids if uid != sender_id]
    else:
        if to_user_id == sender_id:
            raise HTTPException(status_code=400, detail="Cannot message yourself")
        if not can_message(sender_id, to_user_id):
            logger.info(
                "send_message: blocked | sender=%s target=%s reason=ineligible",
                sender_id,
                to_user_id,
            )
            raise HTTPException(status_code=403, detail="Cannot message this user")
        conversation_id = _get_or_create_conversation(sender_id, to_user_id)
        recipient_ids = [to_user_id]

    client = get_client()
    inserted = (
        client.table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender_id": sender_id,
                "body": body,
            }
        )
        .execute()
    )
    message_row = inserted.data[0]

    # Sender is implicitly "read" through their own latest send.
    client.table("conversation_reads").upsert(
        {
            "conversation_id": conversation_id,
            "user_id": sender_id,
            "last_read_at": message_row["created_at"],
        },
        on_conflict="conversation_id,user_id",
    ).execute()

    logger.info(
        "send_message: inserted | sender=%s conv=%s msg=%s",
        sender_id,
        conversation_id,
        message_row["id"],
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
        get_client()
        .table("conversation_participants")
        .select("user_id, role")
        .eq("conversation_id", conversation_id)
        .execute()
    )
    return [r["user_id"] for r in (res.data or [])]


def _require_participant(conversation_id: str, caller_id: str) -> dict:
    """Load conversation, ensuring caller is a participant.

    Raises 404 if the conversation doesn't exist, 403 if caller isn't a
    participant. Read-only conversations stay readable by participants.

    The conversation and its participant ids are read in one wave (they used
    to be read one after the other); a missing conversation still answers 404
    before the participants are looked at.
    """
    client = get_client()
    reads = fan_out(
        {
            "conversation": lambda: (
                client.table("conversations")
                .select("id, type, user_a, user_b, project_id")
                .eq("id", conversation_id)
                .maybe_single()
                .execute()
            ),
            "participant_ids": lambda: _participant_ids(conversation_id),
        }
    )
    res = reads["conversation"]
    # supabase-py 2.x: None when the row doesn't exist.
    conv = res.data if res is not None else None
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    if caller_id not in reads["participant_ids"]:
        logger.warning(
            "messages: participant check failed | caller=%s conv=%s",
            caller_id,
            conversation_id,
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

    # Validate the cursor before building the query: fail fast on bad input.
    before_created_at: str | None = None
    before_id: str | None = None
    if before is not None:
        try:
            before_created_at, before_id = before.split("|", 1)
            if not before_created_at or not before_id:
                raise ValueError
        except ValueError:
            raise HTTPException(status_code=400, detail="Malformed cursor")
        if not (_CURSOR_TS_RE.fullmatch(before_created_at) and _CURSOR_ID_RE.fullmatch(before_id)):
            raise HTTPException(status_code=400, detail="Malformed cursor")

    query = (
        get_client()
        .table("messages")
        .select("id, sender_id, body, created_at")
        .eq("conversation_id", conversation_id)
    )
    if before_created_at is not None:
        query = query.or_(
            f"created_at.lt.{before_created_at},"
            f"and(created_at.eq.{before_created_at},id.lt.{before_id})"
        )
    res = query.order("created_at", desc=True).order("id", desc=True).limit(limit).execute()
    messages = res.data or []
    next_cursor = None
    if len(messages) == limit:
        tail = messages[-1]
        next_cursor = f"{tail['created_at']}|{tail['id']}"
    return {"messages": messages, "next_cursor": next_cursor}


def mark_read(*, conversation_id: str, caller_id: str) -> None:
    """Upsert caller's read marker to now()."""
    _require_participant(conversation_id, caller_id)
    from datetime import datetime

    get_client().table("conversation_reads").upsert(
        {
            "conversation_id": conversation_id,
            "user_id": caller_id,
            "last_read_at": datetime.now(UTC).isoformat(),
        },
        on_conflict="conversation_id,user_id",
    ).execute()

    from app.notifications.controller import dismiss_message_notifications

    dismiss_message_notifications(caller_id, conversation_id)


def delete_conversation_for_user(*, conversation_id: str, caller_id: str) -> None:
    """Hide the conversation from the caller's inbox (idempotent).

    Other party is unaffected. The conversation reappears in caller's inbox
    if the other party sends a new message after this delete.
    """
    _require_participant(conversation_id, caller_id)
    from datetime import datetime

    get_client().table("conversation_deletes").upsert(
        {
            "conversation_id": conversation_id,
            "user_id": caller_id,
            "deleted_at": datetime.now(UTC).isoformat(),
        },
        on_conflict="conversation_id,user_id",
    ).execute()
    logger.info(
        "delete_conversation: caller=%s conv=%s",
        caller_id,
        conversation_id,
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
    res = get_client().rpc("messages_inbox", {"p_user": caller_id}).execute()
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
        out.append(
            {
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
            }
        )
    return out


#: Profile columns a contact row is built from.
_CONTACT_COLUMNS = "id, email, role, first_name, last_name, image_url"

#: A class with its owner's profile and every enrollment's profile embedded, over
#: classes_created_by_fkey, class_enrollments_class_id_fkey and
#: class_enrollments_user_id_fkey. The hints are required where PostgREST would
#: otherwise see several paths: class_enrollments and other tables also link
#: classes to profiles.
_CLASS_PEOPLE = (
    "id, created_by, "
    f"owner:profiles!classes_created_by_fkey({_CONTACT_COLUMNS}), "
    "class_enrollments!class_enrollments_class_id_fkey("
    f"user_id, profile:profiles!class_enrollments_user_id_fkey({_CONTACT_COLUMNS}))"
)

#: The caller's enrollments, each with its class (and that class's people).
_ENROLLED_CLASS_PEOPLE = f"class_id, classes!class_enrollments_class_id_fkey({_CLASS_PEOPLE})"


def list_contacts(*, caller_id: str, query: str | None = None) -> list[dict]:
    """Everyone the caller may DM: peers across the caller's classes
    (enrolled students/TAs + class owners), minus self. Optional
    case-insensitive name/email filter.

    Mirrors can_message() eligibility — keep the two in sync (same
    convention as the messages_inbox RPC).

    Replaces the frontend's per-class getClassStudents() fan-out.

    Two reads in one wave — the classes the caller owns and the classes the
    caller is enrolled in, each with its owner, enrollments and their profiles
    embedded — where it used to be five sequential reads.
    """
    client = get_client()
    reads = fan_out(
        {
            "owned": lambda: (
                (
                    client.table("classes")
                    .select(_CLASS_PEOPLE)
                    .eq("created_by", caller_id)
                    .execute()
                ).data
                or []
            ),
            "enrolled": lambda: (
                (
                    client.table("class_enrollments")
                    .select(_ENROLLED_CLASS_PEOPLE)
                    .eq("user_id", caller_id)
                    .execute()
                ).data
                or []
            ),
        }
    )
    classes = reads["owned"] + [e["classes"] for e in reads["enrolled"] if e.get("classes")]
    if not classes:
        return []

    peer_ids: set[str] = set()
    profiles: dict[str, dict] = {}
    for cls in classes:
        peer_ids.add(cls["created_by"])
        if cls.get("owner"):
            profiles[cls["owner"]["id"]] = cls["owner"]
        for enrollment in cls.get("class_enrollments") or []:
            peer_ids.add(enrollment["user_id"])
            if enrollment.get("profile"):
                profiles[enrollment["profile"]["id"]] = enrollment["profile"]
    peer_ids.discard(caller_id)
    if not peer_ids:
        return []

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
        first = (p.get("first_name") or "").strip()
        last = (p.get("last_name") or "").strip()
        name = f"{first} {last}".strip() or None
        if needle:
            haystack = f"{name or ''} {p.get('email') or ''}".lower()
            if needle not in haystack:
                continue
        out.append(
            {
                "id": uid,
                "name": name,
                "first_name": p.get("first_name"),
                "last_name": p.get("last_name"),
                "email": p.get("email"),
                "image_url": p.get("image_url"),
                "role": p.get("role"),
            }
        )
    out.sort(key=lambda c: (c["name"] or c["email"] or "").lower())
    return out[:500]  # accepted cap: course-scale peers ≪ 500; no has_more contract (see plan B7)
