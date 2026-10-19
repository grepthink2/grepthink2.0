"""Final-review slots: the instructor posts one-hour slots and each team books one.

Booking and releasing go through two SQL functions, ``book_final_review_slot`` and
``release_final_review_slot``
(backend/database/migrations/2026-10/2026-10-18_final_review_slots.sql). Each runs in one
transaction: the slot changes hands, ``projects.final_review_at`` (the time every final-review
view reads) follows it, and a team that moves or releases its slot loses its Review TA. The
functions only keep that data consistent; who may call them is decided here. A slot is free
exactly when its ``project_id`` is NULL.

``classes.review_period_open`` ("Sign-ups open") is the one switch: it gates a Product Owner's
booking here and a TA's reviewer sign-up in ``app.tas.controller.set_review_ta``.

Who can call what:
    * list the slots                       → the class instructor or anyone enrolled.
    * create slots / delete a free slot    → the class instructor.
    * book, move or release a team's slot  → the team's Product Owner while sign-ups are open,
                                             before the team's review time, and onto a slot
                                             that hasn't started; or the class instructor at
                                             any time, onto a slot that has started too.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException

from app.assignments import deadlines
from app.core import authz
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseConflictError
from app.projects.controller import ROLE_PRODUCT_OWNER
from app.tas.controller import REVIEW_TA_TABLE
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)

SLOT_TABLE = "final_review_slots"

#: 404: no such slot, or it belongs to another class than the team.
SLOT_NOT_FOUND = "Slot not found"
#: 409: another team holds the slot.
SLOT_TAKEN = "That slot was just taken."
#: 409: the slot is booked, and deleting it would take the team's time away.
RELEASE_FIRST = "Release the team before deleting its slot."
#: 403: the caller is neither the team's Product Owner nor the class instructor, booking a slot
#: or releasing one.
ONLY_PRODUCT_OWNER_BOOKS = "Only the team's Product Owner can book a slot."
ONLY_PRODUCT_OWNER_RELEASES = "Only the team's Product Owner can release a slot."
#: 403: the team's Product Owner while sign-ups are closed.
SIGNUPS_CLOSED = "Sign-ups aren't open."
#: 403: the team's Product Owner, moving or releasing once the team's review time has come.
REVIEW_TIME_PASSED = "Your team's review time has passed."
#: 409: the team's Product Owner, booking a slot whose start has come.
SLOT_STARTED = "That slot has already started."

_CLASS_COLUMNS = "id, created_by, review_period_open, review_zoom_url"
# A team with what a slot change is decided on: its review time, its class's owner and switch,
# and its members.
_TEAM_COLUMNS = (
    "id, class_id, final_review_at, classes(created_by, review_period_open), "
    "project_members(user_id, role)"
)


def _load_team(client, project_id: str) -> dict | None:
    res = client.table("projects").select(_TEAM_COLUMNS).eq("id", project_id).limit(1).execute()
    return res.data[0] if res.data else None


def _membership(team: dict, user_id: str) -> dict | None:
    """The caller's ``project_members`` row on the team (its role may be NULL), or None."""
    return next(
        (m for m in team.get("project_members") or [] if str(m.get("user_id")) == str(user_id)),
        None,
    )


def _product_owner_id(team: dict) -> str | None:
    owners = [
        m["user_id"]
        for m in team.get("project_members") or []
        if m.get("role") == ROLE_PRODUCT_OWNER and m.get("user_id")
    ]
    return min(owners) if owners else None


def _has_come(at: str | None, now: datetime) -> bool:
    """Whether the ``timestamptz`` string ``at`` is set and at or before ``now``."""
    instant = deadlines.parse_ts(at)
    return instant is not None and instant <= now


def _require_slot_change(
    team: dict, user_id: str, *, denied_detail: str, slot_starts_at: str | None = None
) -> None:
    """Let the class instructor change the team's slot at any time, onto a slot that has started
    too: that is how a review already held gets recorded. The team's Product Owner may change it
    while sign-ups are open and before the team's review time (403 from then on), and may book
    only a slot that hasn't started (``slot_starts_at``; 409). Anyone else, a member with no role
    included, gets 403 ``denied_detail``."""
    cls = team.get("classes") or {}
    if str(cls.get("created_by")) == str(user_id):
        return
    if (_membership(team, user_id) or {}).get("role") != ROLE_PRODUCT_OWNER:
        raise HTTPException(status_code=403, detail=denied_detail)
    if not cls.get("review_period_open"):
        raise HTTPException(status_code=403, detail=SIGNUPS_CLOSED)
    now = deadlines.now_utc()
    # A review already held stays put: a move or a release drops the Review TA who scored it.
    if _has_come(team.get("final_review_at"), now):
        raise HTTPException(status_code=403, detail=REVIEW_TIME_PASSED)
    if _has_come(slot_starts_at, now):
        raise HTTPException(status_code=409, detail=SLOT_STARTED)


def _display_names(client, user_ids) -> dict[str, str]:
    """``user_id → display name`` in one read; no read when there is nobody to name."""
    ids = sorted({str(uid) for uid in user_ids if uid})
    if not ids:
        return {}
    rows = client.table("profiles").select(PROFILE_SELECT).in_("id", ids).execute().data or []
    return {str(p["id"]): profile_display_name(p) for p in rows}


def get_review_slots(user_id: str, class_id: UUID) -> dict:
    """The class's slots as the caller may see them (the class instructor or anyone enrolled).

    Everyone gets every slot with the team holding it, and their own team (``my_team``). Once that
    team holds a slot, ``my_team`` also carries its time, the shared Zoom room and both reviewers'
    names. The instructor and class TAs also get the teams without a slot, each with its Product
    Owner, and the Zoom room; for anyone else those are empty.

    Round trips: the class, then the caller's enrollment (not for the instructor); the slots, the
    teams with their members and the Review TAs together; then one profile read when there are
    names to show. At most 6.
    """
    try:
        client = get_client()
        cid = str(class_id)
        access = authz.require_class_access(client, user_id, cid, columns=_CLASS_COLUMNS)
        cls = access["class"]
        is_staff = access["is_instructor"] or access["enrollment_role"] == authz.ROLE_TA
        reads = fan_out(
            {
                "slots": lambda: (
                    (
                        client.table(SLOT_TABLE)
                        .select("id, starts_at, duration_minutes, project_id")
                        .eq("class_id", cid)
                        .order("starts_at")
                        .execute()
                    ).data
                    or []
                ),
                "teams": lambda: (
                    (
                        client.table("projects")
                        .select("id, name, assigned_ta_id, project_members(user_id, role)")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
                "review_tas": lambda: (
                    (
                        client.table(REVIEW_TA_TABLE)
                        .select("project_id, user_id")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        slots = reads["slots"]
        teams = sorted(reads["teams"], key=lambda t: ((t.get("name") or "").lower(), str(t["id"])))
        name_of = {str(t["id"]): t.get("name") for t in teams}
        slot_of = {str(s["project_id"]): s for s in slots if s.get("project_id")}

        mine = next((t for t in teams if _membership(t, user_id)), None)
        my_slot = slot_of.get(str(mine["id"])) if mine else None
        # The Home TA and the Review TA, named only once the caller's team holds a slot.
        reviewers: dict[str, str | None] = {"home_ta": None, "review_ta": None}
        if my_slot:
            reviewers["home_ta"] = mine.get("assigned_ta_id")
            reviewers["review_ta"] = next(
                (
                    r.get("user_id")
                    for r in reads["review_tas"]
                    if str(r.get("project_id")) == str(mine["id"])
                ),
                None,
            )
        unbooked = [t for t in teams if str(t["id"]) not in slot_of] if is_staff else []
        product_owners = {str(t["id"]): _product_owner_id(t) for t in unbooked}
        names = _display_names(client, [*reviewers.values(), *product_owners.values()])

        def person(uid):
            return {"user_id": uid, "name": names.get(str(uid), "")} if uid else None

        my_team = None
        if mine:
            my_team = {
                "project_id": mine["id"],
                "name": mine.get("name"),
                "is_product_owner": _membership(mine, user_id).get("role") == ROLE_PRODUCT_OWNER,
                "slot_id": my_slot["id"] if my_slot else None,
                "starts_at": my_slot["starts_at"] if my_slot else None,
                "zoom_url": cls.get("review_zoom_url") if my_slot else None,
                "home_ta": person(reviewers["home_ta"]),
                "review_ta": person(reviewers["review_ta"]),
            }

        return {
            "class_id": cid,
            "signups_open": bool(cls.get("review_period_open")),
            "slots": [
                {
                    "id": s["id"],
                    "starts_at": s["starts_at"],
                    "duration_minutes": s.get("duration_minutes"),
                    "team": (
                        {"project_id": s["project_id"], "name": name_of.get(str(s["project_id"]))}
                        if s.get("project_id")
                        else None
                    ),
                }
                for s in slots
            ],
            "my_team": my_team,
            "unbooked_teams": [
                {
                    "project_id": t["id"],
                    "name": t.get("name"),
                    "product_owner": person(product_owners[str(t["id"])]),
                }
                for t in unbooked
            ],
            "review_zoom_url": cls.get("review_zoom_url") if is_staff else None,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing final-review slots | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch the review slots")


def create_review_slots(instructor_id: str, class_id: UUID, starts_at: list[datetime]) -> dict:
    """Post a one-hour slot at each of ``starts_at`` (class instructor only).

    Times that already have a slot in the class are skipped, so posting a list twice creates
    nothing the second time; ``created`` counts the new slots. One upsert on
    ``final_review_slots_class_start_uniq (class_id, starts_at)`` that ignores existing rows:
    PostgREST returns only the rows it inserted. Times go out as UTC ISO strings: supabase-py
    cannot serialise a ``datetime``.
    """
    try:
        client = get_client()
        cid = str(class_id)
        authz.require_class_instructor(client, instructor_id, cid)
        rows = [
            {
                "class_id": cid,
                "starts_at": at.astimezone(UTC).isoformat(),
                "created_by": str(instructor_id),
            }
            for at in starts_at
        ]
        res = (
            client.table(SLOT_TABLE)
            .upsert(rows, on_conflict="class_id,starts_at", ignore_duplicates=True)
            .execute()
        )
        created = len(res.data or [])
        logger.info(
            "Final-review slots created | class_id=%s created=%d skipped=%d by=%s",
            cid,
            created,
            len(rows) - created,
            instructor_id,
        )
        return {"created": created}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error creating final-review slots | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to create the review slots")


def delete_review_slot(instructor_id: str, slot_id: UUID) -> None:
    """Delete a free slot (class instructor only).

    409 while a team holds it, so no team loses its time without being told: release the team
    first. The delete repeats the free check (``project_id IS NULL``), so a team that books the
    slot between the read and the delete keeps it, and the instructor gets the same 409.
    """
    try:
        client = get_client()
        sid = str(slot_id)
        res = (
            client.table(SLOT_TABLE)
            .select("id, project_id, classes(created_by)")
            .eq("id", sid)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail=SLOT_NOT_FOUND)
        slot = res.data[0]
        if str((slot.get("classes") or {}).get("created_by")) != str(instructor_id):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)
        if slot.get("project_id") is not None:
            raise HTTPException(status_code=409, detail=RELEASE_FIRST)
        deleted = (
            client.table(SLOT_TABLE).delete().eq("id", sid).is_("project_id", "null").execute()
        )
        if not deleted.data:
            raise HTTPException(status_code=409, detail=RELEASE_FIRST)
        logger.info("Final-review slot deleted | slot_id=%s by=%s", sid, instructor_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error deleting final-review slot | slot_id=%s", slot_id)
        raise HTTPException(status_code=500, detail="Failed to delete the review slot")


def book_review_slot(user_id: str, slot_id: UUID, project_id: UUID) -> dict:
    """Book ``slot_id`` for team ``project_id``, or move the team to it.

    The team's Product Owner books for their own team while sign-ups are open, before the team's
    review time, and only a slot that hasn't started; the class instructor places any team at any
    time, on a slot that has started too. ``book_final_review_slot`` then decides atomically: a
    slot another team holds is 409, and a move frees the team's old slot and drops its Review TA
    (a first booking keeps it). Booking the slot the team already holds changes nothing and
    answers ``booked``.

    Round trips: the slot and the team together, then the function. At most 4.
    """
    try:
        client = get_client()
        sid, pid = str(slot_id), str(project_id)
        reads = fan_out(
            {
                "slot": lambda: (
                    (
                        client.table(SLOT_TABLE)
                        .select("id, class_id, starts_at")
                        .eq("id", sid)
                        .limit(1)
                        .execute()
                    ).data
                ),
                "team": lambda: _load_team(client, pid),
            }
        )
        slot = reads["slot"][0] if reads["slot"] else None
        team = reads["team"]
        if slot is None:
            raise HTTPException(status_code=404, detail=SLOT_NOT_FOUND)
        if team is None:
            raise HTTPException(status_code=404, detail=authz.PROJECT_NOT_FOUND)
        if str(slot["class_id"]) != str(team["class_id"]):
            raise HTTPException(status_code=404, detail=SLOT_NOT_FOUND)
        _require_slot_change(
            team, user_id, denied_detail=ONLY_PRODUCT_OWNER_BOOKS, slot_starts_at=slot["starts_at"]
        )

        try:
            res = client.rpc(
                "book_final_review_slot",
                {"p_slot": sid, "p_project": pid, "p_actor": str(user_id)},
                operation="write",
            ).execute()
        except DatabaseConflictError as exc:
            # The same team booked another slot at the same moment, and
            # final_review_slots_project_uniq refused the second booking.
            raise HTTPException(status_code=409, detail=SLOT_TAKEN) from exc
        outcome = res.data
        if outcome == "not_found":  # the slot was deleted after the read above
            raise HTTPException(status_code=404, detail=SLOT_NOT_FOUND)
        if outcome == "slot_taken":
            raise HTTPException(status_code=409, detail=SLOT_TAKEN)
        if outcome not in ("booked", "moved"):
            raise RuntimeError(f"book_final_review_slot returned {outcome!r}")

        logger.info(
            "Final-review slot %s | slot_id=%s project_id=%s by=%s", outcome, sid, pid, user_id
        )
        return {"status": outcome, "slot_id": sid, "starts_at": slot["starts_at"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error booking final-review slot | slot_id=%s project_id=%s", slot_id, project_id
        )
        raise HTTPException(status_code=500, detail="Failed to book the review slot")


def release_review_slot(user_id: str, project_id: UUID) -> dict:
    """Free the team's slot; its review time is cleared and its Review TA dropped.

    The same rule as booking: the team's Product Owner while sign-ups are open and before the
    team's review time, or the class instructor at any time. ``released`` is false when the team
    held no slot (nothing changes).

    Round trips: the team, then the function. At most 3.
    """
    try:
        client = get_client()
        pid = str(project_id)
        team = _load_team(client, pid)
        if team is None:
            raise HTTPException(status_code=404, detail=authz.PROJECT_NOT_FOUND)
        _require_slot_change(team, user_id, denied_detail=ONLY_PRODUCT_OWNER_RELEASES)

        res = client.rpc(
            "release_final_review_slot", {"p_project": pid}, operation="write"
        ).execute()
        released = res.data is True  # the function answers a bare boolean
        logger.info(
            "Final-review slot release | project_id=%s released=%s by=%s", pid, released, user_id
        )
        return {"released": released}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error releasing final-review slot | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to release the review slot")
