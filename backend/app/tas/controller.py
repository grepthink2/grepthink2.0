"""Teaching Assistant (TA) business logic.

A TA is an enrolled student promoted to a class-level ``ta`` role
(``class_enrollments.enrollment_role``). TAs are deliberately kept out of
``project_members`` so they never affect team size, seat availability, the
scrum-master auto-assignment, or any membership count.

A team's single operational TA is ``projects.assigned_ta_id`` (set by the
instructor via the attendance module): they run the weekly meeting, take
attendance, and review that team's TSRs. This module reads that column for the
TA Review page and the project-TA list.

Separately, the end-of-quarter review activity gives each team a second reviewer
(``project_review_tas`` — self-appointed by a TA while the class review window is
open, or set by the instructor; owner-or-instructor release). Reviewer #1 is
always the assigned TA above and is not stored in that table.

The final-review schedule layers WHEN/WHERE onto that model: each team gets one
review slot (``projects.final_review_at``) and the class shares one Zoom room
(``classes.review_zoom_url``) — both instructor-set, no attendance taken.

Who can call what:
    * Promote / demote / list-class-TAs        → class instructor.
    * my-role / review targets                 → the TA themselves.
    * list-project-TAs / list-review-TAs       → instructor or any class member.
    * claim / release additional reviewer      → the TA (self) or instructor.
    * toggle review window / set review Zoom /
      set per-team review time                 → class instructor.
    * final-review schedule (read)             → instructor or any class TA.
"""

import logging
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException

from app.core import authz
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseConflictError
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)

ENROLLMENT_ROLE_STUDENT = "student"
ENROLLMENT_ROLE_TA = "ta"


def _owner_check(cls: dict | None, user_id: str) -> None:
    """404 for a missing class, 403 unless ``user_id`` created it (already-loaded row)."""
    if not cls:
        raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
    if str(cls.get("created_by")) != str(user_id):
        raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)


def _require_class_instructor(client, user_id: str, class_id) -> dict:
    """Ensure ``user_id`` owns ``class_id``; return the class row."""
    return authz.require_class_instructor(client, user_id, class_id)


def _get_enrollment(client, class_id, user_id: str) -> dict | None:
    res = (
        client.table("class_enrollments")
        .select("id, enrollment_role")
        .eq("class_id", str(class_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return res.data[0] if res.data else None


def get_enrollment_role(client, class_id, user_id: str) -> str | None:
    """Return 'student'/'ta' for an enrolled user, or None if not enrolled."""
    enrollment = _get_enrollment(client, class_id, user_id)
    if not enrollment:
        return None
    return enrollment.get("enrollment_role") or ENROLLMENT_ROLE_STUDENT


def get_my_enrollment_role(user_id: str, class_id: UUID) -> dict:
    """Class-level role for the requesting user (instructor / ta / student / none).

    Called on every class switch (sidebar, review guards): the class row and the
    enrollment are read concurrently — one round trip of latency instead of two.
    """
    try:
        client = get_client()
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, class_id),
                "role": lambda: get_enrollment_role(client, class_id, user_id),
            }
        )
        if not reads["class"]:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
        if str(reads["class"].get("created_by")) == str(user_id):
            return {"enrollment_role": "instructor"}
        return {"enrollment_role": reads["role"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching enrollment role | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch role")


def promote_to_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Promote an enrolled student to TA for this class (class instructor only)."""
    try:
        client = get_client()
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, class_id),
                "enrollment": lambda: _get_enrollment(client, class_id, str(target_user_id)),
            }
        )
        _owner_check(reads["class"], instructor_id)
        enrollment = reads["enrollment"]
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("class_enrollments").update({"enrollment_role": ENROLLMENT_ROLE_TA}).eq(
            "id", enrollment["id"]
        ).execute()

        logger.info(
            "Student promoted to TA | class_id=%s user_id=%s by=%s",
            class_id,
            target_user_id,
            instructor_id,
        )
        return {"message": "Student promoted to TA", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error promoting TA | class_id=%s user_id=%s", class_id, target_user_id)
        raise HTTPException(status_code=500, detail="Failed to promote TA")


def demote_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Demote a TA back to a regular student and clear their project assignments.

    The three writes are not transactional, so they run in the order that fails
    safe: the TA's team assignments and review claims are cleared BEFORE the role
    flips. If a later write fails, the user is still a TA with nothing assigned —
    never a student who still holds a team's assigned-TA (meeting, attendance,
    TSR-review) privileges.
    """
    try:
        client = get_client()
        cid, tid = str(class_id), str(target_user_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "enrollment": lambda: _get_enrollment(client, cid, tid),
            }
        )
        _owner_check(reads["class"], instructor_id)
        enrollment = reads["enrollment"]
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("projects").update({"assigned_ta_id": None}).eq("class_id", cid).eq(
            "assigned_ta_id", tid
        ).execute()
        client.table("project_review_tas").delete().eq("class_id", cid).eq("user_id", tid).execute()
        client.table("class_enrollments").update({"enrollment_role": ENROLLMENT_ROLE_STUDENT}).eq(
            "id", enrollment["id"]
        ).execute()

        logger.info(
            "TA demoted to student | class_id=%s user_id=%s by=%s",
            class_id,
            target_user_id,
            instructor_id,
        )
        return {"message": "TA demoted to student", "user_id": tid}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error demoting TA | class_id=%s user_id=%s", class_id, target_user_id)
        raise HTTPException(status_code=500, detail="Failed to demote TA")


def _ta_assignments_by_user(client, class_id, user_ids: list[str]) -> dict[str, list[dict]]:
    """Map user_id → [{id, name}] of the projects each user is the assigned TA of.

    Reads ``projects.assigned_ta_id`` — the single operational TA per team who
    runs meetings/attendance and reviews the team's TSRs.
    """
    if not user_ids:
        return {}
    rows = (
        client.table("projects")
        .select("id, name, assigned_ta_id")
        .eq("class_id", str(class_id))
        .in_("assigned_ta_id", user_ids)
        .execute()
    )
    out: dict[str, list[dict]] = {}
    for r in rows.data or []:
        uid = r.get("assigned_ta_id")
        pid = r.get("id")
        if not uid or not pid:
            continue
        out.setdefault(uid, []).append({"id": pid, "name": r.get("name")})
    for assignments in out.values():
        assignments.sort(key=lambda p: (p["name"] or "").lower())
    return out


def list_class_tas(instructor_id: str, class_id: UUID) -> list[dict]:
    """List every TA in a class with the projects they oversee (class instructor only)."""
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "ta_ids": lambda: [
                    str(e["user_id"])
                    for e in (
                        client.table("class_enrollments")
                        .select("user_id, enrollment_role")
                        .eq("class_id", cid)
                        .eq("enrollment_role", ENROLLMENT_ROLE_TA)
                        .execute()
                    ).data
                    or []
                    if e.get("user_id")
                ],
            }
        )
        _owner_check(reads["class"], instructor_id)
        ta_ids = reads["ta_ids"]
        if not ta_ids:
            return []

        details = fan_out(
            {
                "profiles": lambda: {
                    p["id"]: p
                    for p in (
                        client.table("profiles").select(PROFILE_SELECT).in_("id", ta_ids).execute()
                    ).data
                    or []
                },
                "assignments": lambda: _ta_assignments_by_user(client, cid, ta_ids),
            }
        )
        profile_map, assignments_map = details["profiles"], details["assignments"]

        result = [
            {
                "id": uid,
                "name": profile_display_name(profile_map.get(uid, {})),
                "email": (profile_map.get(uid, {}) or {}).get("email"),
                "projects": assignments_map.get(uid, []),
            }
            for uid in ta_ids
        ]
        result.sort(key=lambda t: (t["name"] or "").lower())
        return result
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing class TAs | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to list TAs")


_REVIEW_CLASS_COLUMNS = "id, created_by, review_period_open, review_zoom_url"


def _load_project(
    client, project_id: UUID, columns: str = "id, class_id, name, assigned_ta_id"
) -> dict:
    """The project with its class (owner, review window, shared Zoom) embedded under
    ``classes`` — one round trip that replaces the separate classes /
    review-window reads; 404 if missing."""
    return authz.load_project(
        client, project_id, columns=columns, class_columns=_REVIEW_CLASS_COLUMNS
    )


def _class_of(project: dict) -> dict:
    return project.get("classes") or {}


def _owns_class(project: dict, user_id: str) -> bool:
    return str(_class_of(project).get("created_by")) == str(user_id)


def list_project_tas(user_id: str, project_id: UUID) -> list[dict]:
    """The project's single assigned TA, as a 0-or-1 element list.

    Kept as a list for response-shape compatibility with the project-details UI.
    Readable by the class instructor or any enrolled class member.
    """
    try:
        client = get_client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]

        # Access: class instructor or an enrolled member of the class.
        if (
            not _owns_class(project, user_id)
            and get_enrollment_role(client, class_id, user_id) is None
        ):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)

        assigned_ta_id = project.get("assigned_ta_id")
        if not assigned_ta_id:
            return []

        prof_res = (
            client.table("profiles").select(PROFILE_SELECT).eq("id", str(assigned_ta_id)).execute()
        )
        prof = (prof_res.data or [{}])[0]
        return [
            {
                "user_id": assigned_ta_id,
                "name": profile_display_name(prof),
                "email": (prof or {}).get("email"),
                "assigned_at": None,
            }
        ]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing project TAs | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to list project TAs")


def get_ta_review_targets(user_id: str, class_id: UUID) -> dict:
    """For a TA: the projects they oversee plus the class's TSR assignments.

    Powers the TA review page. The TA picks a TSR assignment and a project,
    then the regular TSR-overview endpoint returns the (TA-scoped) responses.
    The three reads are independent and run concurrently. A caller with no
    enrollment costs one more read, to answer 404 when the class does not exist.
    """
    try:
        client = get_client()
        reads = fan_out(
            {
                "role": lambda: get_enrollment_role(client, class_id, user_id),
                "projects": lambda: _ta_assignments_by_user(client, class_id, [user_id]).get(
                    user_id, []
                ),
                "assignments": lambda: (
                    (
                        client.table("assignments")
                        .select("id, Title, open_date, close_date, status, assignment_type")
                        .eq("class_id", str(class_id))
                        .eq("assignment_type", "tsr")
                        .order("open_date")
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        if reads["role"] != ENROLLMENT_ROLE_TA:
            # No enrollment can also mean no class; read it only to tell 404 from 403.
            if reads["role"] is None and authz.load_class(client, class_id) is None:
                raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
            raise HTTPException(status_code=403, detail="You are not a TA in this class")
        return {"projects": reads["projects"], "assignments": reads["assignments"]}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching TA review targets | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TA review targets")


# ---------------------------------------------------------------------------
# End-of-quarter review (the team's ADDITIONAL reviewer)
# ---------------------------------------------------------------------------
#
# Each team is reviewed by two TAs: the assigned TA (``projects.assigned_ta_id``,
# implicit reviewer #1) plus one additional reviewer stored in
# ``project_review_tas`` (<=1 row per team, enforced by UNIQUE(project_id)). The
# additional reviewer is self-appointed by a TA while the class review window is
# open, or set by the instructor at any time (override); only that TA or the
# instructor can release the slot.

REVIEW_TA_TABLE = "project_review_tas"


def set_review_window(instructor_id: str, class_id: UUID, is_open: bool) -> dict:
    """Open or close a class's end-of-quarter review window (class instructor only)."""
    try:
        client = get_client()
        _require_class_instructor(client, instructor_id, class_id)
        client.table("classes").update({"review_period_open": bool(is_open)}).eq(
            "id", str(class_id)
        ).execute()
        logger.info(
            "Review window %s | class_id=%s by=%s",
            "opened" if is_open else "closed",
            class_id,
            instructor_id,
        )
        return {
            "message": "Review window updated",
            "class_id": str(class_id),
            "review_period_open": bool(is_open),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting review window | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to update review window")


def list_project_review_tas(user_id: str, project_id: UUID) -> dict:
    """Both end-of-quarter reviewers of a team + the class review-window state.

    Reviewer #1 is the assigned TA (derived from ``projects.assigned_ta_id``);
    reviewer #2 (if any) is the stored additional reviewer. Readable by the
    instructor or any enrolled class member.
    """
    try:
        client = get_client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]

        if (
            not _owns_class(project, user_id)
            and get_enrollment_role(client, class_id, user_id) is None
        ):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)

        main_id = project.get("assigned_ta_id")
        extra_rows = (
            client.table(REVIEW_TA_TABLE)
            .select("user_id, assigned_by, claimed_at")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []

        ids = [i for i in ([main_id] + [r.get("user_id") for r in extra_rows]) if i]
        profile_map: dict[str, dict] = {}
        if ids:
            profs = client.table("profiles").select(PROFILE_SELECT).in_("id", ids).execute()
            profile_map = {p["id"]: p for p in (profs.data or [])}

        def _reviewer(uid, role, claimed_at=None):
            p = profile_map.get(uid, {})
            return {
                "user_id": uid,
                "name": profile_display_name(p),
                "email": (p or {}).get("email"),
                "role": role,
                "claimed_at": claimed_at,
            }

        reviewers = []
        if main_id:
            reviewers.append(_reviewer(main_id, "assigned"))
        for r in extra_rows:
            if r.get("user_id"):
                reviewers.append(_reviewer(r["user_id"], "additional", r.get("claimed_at")))

        return {
            "project_id": str(project_id),
            "reviewers": reviewers,
            "review_period_open": bool(_class_of(project).get("review_period_open")),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing review TAs | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to list review TAs")


def set_review_ta(caller_id: str, project_id: UUID, target_user_id: UUID | None = None) -> dict:
    """Set a team's additional (2nd) end-of-quarter reviewer.

    A TA self-appoints (``target_user_id`` omitted or == caller) while the class
    review window is open; the instructor may appoint any class TA at any time
    (override, which also replaces an existing additional reviewer). The
    additional reviewer must be a class TA other than the team's assigned TA.

    Writes lean on ``UNIQUE (project_id)``: the instructor override is one upsert
    on that key (it used to be delete + insert); a TA's self-appointment stays a
    plain insert, so if another TA claims the team between our check and our
    insert the loser gets a 409 instead of silently replacing the winner.
    """
    try:
        client = get_client()
        pid = str(project_id)
        project = _load_project(client, project_id)
        class_id = project["class_id"]
        main_id = project.get("assigned_ta_id")
        is_instructor = _owns_class(project, caller_id)

        if is_instructor:
            if not target_user_id:
                raise HTTPException(
                    status_code=400, detail="Specify which TA to assign as reviewer"
                )
            target = str(target_user_id)
        else:
            if target_user_id and str(target_user_id) != str(caller_id):
                raise HTTPException(
                    status_code=403, detail="Only the instructor can appoint another TA"
                )
            target = str(caller_id)
            if not _class_of(project).get("review_period_open"):
                raise HTTPException(
                    status_code=403, detail="The end-of-quarter review window is not open"
                )

        reads = fan_out(
            {
                "role": lambda: get_enrollment_role(client, class_id, target),
                "existing": lambda: (
                    (
                        client.table(REVIEW_TA_TABLE)
                        .select("id, user_id")
                        .eq("project_id", pid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        if reads["role"] != ENROLLMENT_ROLE_TA:
            raise HTTPException(
                status_code=400, detail="The reviewer must be a designated TA of this class"
            )
        if main_id and str(main_id) == target:
            raise HTTPException(
                status_code=400,
                detail="The additional reviewer must be a different TA than the team's assigned TA",
            )

        existing = reads["existing"]
        if any(str(r.get("user_id")) == target for r in existing):
            return {
                "message": "Already the additional reviewer",
                "project_id": pid,
                "user_id": target,
            }

        row = {"class_id": class_id, "project_id": pid, "user_id": target, "assigned_by": caller_id}
        taken = HTTPException(
            status_code=409, detail="This team already has an additional reviewer"
        )
        if is_instructor:
            # Override: replace whoever holds the slot; a new claim gets a new timestamp.
            client.table(REVIEW_TA_TABLE).upsert(
                {**row, "claimed_at": datetime.now(UTC).isoformat()}, on_conflict="project_id"
            ).execute()
        else:
            if existing:
                raise taken
            try:
                client.table(REVIEW_TA_TABLE).insert(row).execute()
            except DatabaseConflictError as exc:
                raise taken from exc

        logger.info(
            "Additional reviewer set | project_id=%s user_id=%s by=%s",
            project_id,
            target,
            caller_id,
        )
        return {
            "message": "Additional reviewer assigned",
            "project_id": pid,
            "user_id": target,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting review TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to set review TA")


def set_review_zoom(instructor_id: str, class_id: UUID, zoom_url: str | None) -> dict:
    """Set or clear the class's ONE shared final-review Zoom room (class instructor only).

    Every team's final review happens in this room; a null/blank URL clears it.
    """
    try:
        client = get_client()
        _require_class_instructor(client, instructor_id, class_id)
        url = (zoom_url or "").strip() or None
        client.table("classes").update({"review_zoom_url": url}).eq("id", str(class_id)).execute()
        logger.info(
            "Review Zoom %s | class_id=%s by=%s",
            "set" if url else "cleared",
            class_id,
            instructor_id,
        )
        return {
            "message": "Review Zoom updated",
            "class_id": str(class_id),
            "review_zoom_url": url,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting review Zoom | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to update review Zoom")


def set_final_review_time(
    instructor_id: str, project_id: UUID, scheduled_at: datetime | None
) -> dict:
    """Set or clear a team's single final-review slot (class instructor only).

    One timestamptz per team (``projects.final_review_at``); no attendance is
    taken for final reviews, so this deliberately does not create a ``meetings``
    row.
    """
    try:
        client = get_client()
        project = _load_project(client, project_id)
        if not _owns_class(project, instructor_id):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)
        value = scheduled_at.isoformat() if scheduled_at else None
        client.table("projects").update({"final_review_at": value}).eq(
            "id", str(project_id)
        ).execute()
        logger.info(
            "Final review time %s | project_id=%s at=%s by=%s",
            "set" if value else "cleared",
            project_id,
            value,
            instructor_id,
        )
        return {
            "message": "Final review time updated",
            "project_id": str(project_id),
            "final_review_at": value,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting final review time | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to update final review time")


def _parse_review_ts(value) -> datetime | None:
    """Parse a stored final_review_at into an aware datetime (None if absent/bad)."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)


def get_final_review_schedule(user_id: str, class_id: UUID) -> dict:
    """The class's full final-review schedule (instructor or any class TA).

    Per team: name, review slot, Home TA (assigned_ta_id) and Review TA
    (additional reviewer, null = open slot) — ordered by slot time with
    unscheduled teams last. Class-level: the shared Zoom room, the review-window
    state, and how many teams the viewer reviews (their Review-TA claims).

    Class, enrollment, projects and review claims are read concurrently, then
    one profile read: 2 waves (was 4-5 sequential reads).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(
                    client, cid, "id, created_by, review_period_open, review_zoom_url"
                ),
                "role": lambda: get_enrollment_role(client, cid, user_id),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select("id, name, assigned_ta_id, final_review_at")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
                "review_rows": lambda: (
                    (
                        client.table(REVIEW_TA_TABLE)
                        .select("project_id, user_id, claimed_at")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        cls = reads["class"]
        if not cls:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
        if str(cls.get("created_by")) != str(user_id) and reads["role"] != ENROLLMENT_ROLE_TA:
            raise HTTPException(
                status_code=403,
                detail="Only the instructor or class TAs can view the final-review schedule",
            )

        projects, review_rows = reads["projects"], reads["review_rows"]
        review_by_project = {r["project_id"]: r for r in review_rows if r.get("project_id")}

        ta_ids = {p.get("assigned_ta_id") for p in projects} | {
            r.get("user_id") for r in review_rows
        }
        ta_ids.discard(None)
        profile_map: dict[str, dict] = {}
        if ta_ids:
            profs = (
                client.table("profiles").select(PROFILE_SELECT).in_("id", list(ta_ids)).execute()
            )
            profile_map = {p["id"]: p for p in (profs.data or [])}

        def _person(uid, **extra):
            if not uid:
                return None
            p = profile_map.get(uid, {})
            return {
                "user_id": uid,
                "name": profile_display_name(p),
                "email": (p or {}).get("email"),
                **extra,
            }

        teams = []
        for p in projects:
            claim = review_by_project.get(p["id"])
            teams.append(
                {
                    "project_id": p["id"],
                    "name": p.get("name"),
                    "final_review_at": p.get("final_review_at"),
                    "home_ta": _person(p.get("assigned_ta_id")),
                    "review_ta": _person(claim.get("user_id"), claimed_at=claim.get("claimed_at"))
                    if claim
                    else None,
                }
            )

        far_future = datetime.max.replace(tzinfo=UTC)
        teams.sort(
            key=lambda t: (
                _parse_review_ts(t["final_review_at"]) or far_future,
                (t["name"] or "").lower(),
            )
        )

        return {
            "class_id": cid,
            "review_zoom_url": cls.get("review_zoom_url"),
            "review_period_open": bool(cls.get("review_period_open")),
            "my_review_count": sum(1 for r in review_rows if str(r.get("user_id")) == str(user_id)),
            "teams": teams,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching final-review schedule | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to fetch the final-review schedule")


# ---------------------------------------------------------------------------
# Final-review scoring + the Review-TA notes form
# ---------------------------------------------------------------------------
#
# Scores are per (project, student, scorer-role): the Home TA enters three
# category scores (product / team / scrum), while the Review TA and the
# instructor each enter a single overall score — all 1.0–5.0 at 0.1
# granularity, with an optional per-student note. The notes form is one
# structured jsonb document per team, owned by the Review TA.

SCORE_TABLE = "final_review_scores"
NOTES_TABLE = "final_review_notes"
SCORE_ROLES = ("home", "review", "instructor")
_HOME_FIELDS = ("product", "team", "scrum")


def _review_ta_of(client, project_id) -> str | None:
    rows = (
        client.table(REVIEW_TA_TABLE).select("user_id").eq("project_id", str(project_id)).execute()
    ).data or []
    return rows[0].get("user_id") if rows else None


def _load_review_context(client, user_id: str, project_id: UUID, *, also=None) -> dict:
    """Project + class + role context shared by the scoring endpoints.

    Raises 404 for a missing project and 403 unless the caller is the class
    instructor or a class TA (students never see final-review internals).

    One read loads the project with its class; the Review-TA lookup, the
    caller's enrollment (non-instructors only) and any extra reads passed in
    ``also`` (``{key: callable}``) then run concurrently. Their results are
    under ``ctx["extra"]`` — computed before the permission check, but only
    returned to a caller who passes it.
    """
    project = _load_project(
        client, project_id, columns="id, class_id, name, assigned_ta_id, final_review_at"
    )
    cls = _class_of(project)
    is_instructor = _owns_class(project, user_id)

    jobs = {"review_ta_id": lambda: _review_ta_of(client, project_id)}
    if not is_instructor:
        jobs["enrollment_role"] = lambda: get_enrollment_role(client, project["class_id"], user_id)
    jobs.update(also or {})
    results = fan_out(jobs)

    if not is_instructor and results["enrollment_role"] != ENROLLMENT_ROLE_TA:
        raise HTTPException(
            status_code=403,
            detail="Only the instructor or class TAs can access final-review details",
        )

    review_ta_id = results["review_ta_id"]
    if is_instructor:
        viewer_role = "instructor"
    elif project.get("assigned_ta_id") == user_id:
        viewer_role = "home"
    elif review_ta_id == user_id:
        viewer_role = "review"
    else:
        viewer_role = "ta"

    return {
        "project": project,
        "class": cls,
        "is_instructor": is_instructor,
        "review_ta_id": review_ta_id,
        "viewer_role": viewer_role,
        "extra": {key: results[key] for key in (also or {})},
    }


def get_final_review_detail(user_id: str, project_id: UUID) -> dict:
    """One team's full final-review workspace (instructor or any class TA).

    Header context (slot, shared Zoom, both TAs), the roster of team members
    to score, every score row entered so far (all roles — the staff sheet is
    shared), and the Review-TA notes document.

    Round trips: project+class, then the Review TA, enrollment, members, scores
    and notes concurrently, then one profile read — 3 waves (was 8 sequential).
    """
    try:
        client = get_client()
        pid = str(project_id)
        ctx = _load_review_context(
            client,
            user_id,
            project_id,
            also={
                "members": lambda: [
                    str(m["user_id"])
                    for m in (
                        client.table("project_members")
                        .select("user_id")
                        .eq("project_id", pid)
                        .execute()
                    ).data
                    or []
                    if m.get("user_id")
                ],
                "scores": lambda: (
                    (
                        client.table(SCORE_TABLE)
                        .select(
                            "student_id, role, product, team, scrum, overall, notes, scored_by, updated_at"
                        )
                        .eq("project_id", pid)
                        .execute()
                    ).data
                    or []
                ),
                "notes": lambda: (
                    (
                        client.table(NOTES_TABLE)
                        .select("content, template_version, updated_by, updated_at")
                        .eq("project_id", pid)
                        .limit(1)
                        .execute()
                    ).data
                    or []
                ),
            },
        )
        project, cls, extra = ctx["project"], ctx["class"], ctx["extra"]
        member_ids = extra["members"]

        profile_ids = set(member_ids)
        profile_ids.update(i for i in (project.get("assigned_ta_id"), ctx["review_ta_id"]) if i)
        profile_map: dict[str, dict] = {}
        if profile_ids:
            profs = (
                client.table("profiles")
                .select(PROFILE_SELECT)
                .in_("id", list(profile_ids))
                .execute()
            )
            profile_map = {p["id"]: p for p in (profs.data or [])}

        def _person(uid):
            if not uid:
                return None
            p = profile_map.get(uid, {})
            return {
                "user_id": uid,
                "name": profile_display_name(p),
                "email": (p or {}).get("email"),
            }

        members = sorted(
            (_person(uid) for uid in member_ids),
            key=lambda m: (m["name"] or "").lower(),
        )

        return {
            "project": {
                "project_id": project["id"],
                "name": project.get("name"),
                "final_review_at": project.get("final_review_at"),
            },
            "review_zoom_url": cls.get("review_zoom_url"),
            "review_period_open": bool(cls.get("review_period_open")),
            "home_ta": _person(project.get("assigned_ta_id")),
            "review_ta": _person(ctx["review_ta_id"]),
            "members": members,
            "scores": extra["scores"],
            "notes": extra["notes"][0] if extra["notes"] else None,
            "viewer_role": ctx["viewer_role"],
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching final-review detail | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch final-review detail")


def _round_score(value, field: str) -> float:
    try:
        num = float(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{field} must be a number")
    num = round(num * 10) / 10
    if num < 1.0 or num > 5.0:
        raise HTTPException(status_code=400, detail=f"{field} must be between 1.0 and 5.0")
    return num


def _score_values(entry: dict, role: str) -> dict | None:
    """Validate one payload entry for ``role`` and return the columns to write.

    Returns ``None`` for an explicit clear (every defining score of the role
    present *and* null). Raises 400 on any shape or range problem. Pure — no
    I/O — so the caller can validate the whole payload before the first write.
    """
    if role == "home":
        if entry.get("overall") is not None:
            raise HTTPException(
                status_code=400, detail="Home TA rows carry category scores, not an overall"
            )
        # A field the client never sent is absent from `entry` entirely
        # (views.py dumps with exclude_unset=True) — only treat this as a
        # clear when all three keys were explicitly sent (any value, including
        # null); a merely-missing key must fail the same way it always has.
        fields_present = all(f in entry for f in _HOME_FIELDS)
        raw = {f: entry.get(f) for f in _HOME_FIELDS}
        if fields_present and all(raw[f] is None for f in _HOME_FIELDS):
            return None
        if any(raw[f] is None for f in _HOME_FIELDS):
            raise HTTPException(
                status_code=400, detail="Home TA scores need product, team, and scrum"
            )
        values = {f: _round_score(raw[f], f) for f in _HOME_FIELDS}
        values["overall"] = None
    else:
        if any(entry.get(f) is not None for f in _HOME_FIELDS):
            raise HTTPException(status_code=400, detail="Only the Home TA enters category scores")
        if "overall" not in entry:
            # Never sent at all — 400. Only an explicit null (key present) is
            # a clear signal.
            raise HTTPException(status_code=400, detail="An overall score is required")
        if entry["overall"] is None:
            return None
        values = dict.fromkeys(_HOME_FIELDS)
        values["overall"] = _round_score(entry["overall"], "overall")
    values["notes"] = (entry.get("notes") or "").strip() or None
    return values


def save_final_review_scores(
    user_id: str, project_id: UUID, role: str, entries: list[dict]
) -> dict:
    """Bulk-upsert one scorer role's rows for a team.

    role='home'       → product/team/scrum, by the team's Home TA (or instructor).
    role='review'     → single overall, by the team's Review TA (or instructor).
    role='instructor' → single overall, by the instructor.
    Rows are replaced per (student, role); students not in the payload keep
    their existing rows.

    Explicitly clearing a role's defining score(s) requires ALL of its
    defining keys to be PRESENT in the entry with an explicit null — all
    three of product/team/scrum for 'home', or 'overall' for
    'review'/'instructor' — and then deletes that student's row for this
    role instead of upserting an all-null placeholder. A key that is simply
    ABSENT from the entry (never sent, as opposed to sent as an explicit
    null — the view layer preserves this distinction via
    ``model_dump(exclude_unset=True)``) is NOT a clear signal: it 400s, so a
    payload that's missing a field (a typo'd name, a stale client) can never
    silently delete data instead of failing loudly. A partial combination
    within the Home TA triple is still rejected — clearing is
    all-three-or-nothing. Clearing removes the WHOLE row, including its
    `notes` value.

    The whole payload is validated before anything is written, then the
    clears go out as one DELETE and the rest as one UPSERT on the
    ``(project_id, student_id, role)`` unique key (``final_review_scores_uniq``):
    a bad entry anywhere fails the request and leaves existing scores
    untouched, and a six-member team costs 6 round trips instead of 17. When
    a student appears more than once, the last entry wins (as it did when rows
    were written one at a time); ``saved`` counts distinct students.
    """
    try:
        if role not in SCORE_ROLES:
            raise HTTPException(status_code=400, detail="Unknown scorer role")

        client = get_client()
        ctx = _load_review_context(client, user_id, project_id)
        project = ctx["project"]

        allowed = (
            ctx["is_instructor"]
            or (role == "home" and project.get("assigned_ta_id") == user_id)
            or (role == "review" and ctx["review_ta_id"] == user_id)
        )
        if not allowed:
            raise HTTPException(
                status_code=403,
                detail="You cannot enter scores for this role on this team",
            )

        member_rows = (
            client.table("project_members")
            .select("user_id")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []
        member_ids = {str(m["user_id"]) for m in member_rows if m.get("user_id")}

        # Validate everything first (no I/O in this loop).
        outcome: dict[str, dict | None] = {}
        for entry in entries or []:
            student_id = str(entry.get("student_id") or "")
            if student_id not in member_ids:
                raise HTTPException(status_code=400, detail="Student is not a member of this team")
            outcome[student_id] = _score_values(entry, role)

        now = datetime.now(UTC).isoformat()
        to_clear = [sid for sid, values in outcome.items() if values is None]
        to_write = [
            {
                "class_id": project["class_id"],
                "project_id": str(project_id),
                "student_id": sid,
                "role": role,
                **values,
                "scored_by": user_id,
                "updated_at": now,
            }
            for sid, values in outcome.items()
            if values is not None
        ]

        if to_clear:
            client.table(SCORE_TABLE).delete().eq("project_id", str(project_id)).eq(
                "role", role
            ).in_("student_id", to_clear).execute()
        if to_write:
            client.table(SCORE_TABLE).upsert(
                to_write, on_conflict="project_id,student_id,role"
            ).execute()

        saved = len(outcome)
        logger.info(
            "Final-review scores saved | project_id=%s role=%s rows=%d cleared=%d by=%s",
            project_id,
            role,
            saved,
            len(to_clear),
            user_id,
        )
        return {
            "message": "Scores saved",
            "project_id": str(project_id),
            "role": role,
            "saved": saved,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error saving final-review scores | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to save scores")


def save_final_review_notes(
    user_id: str, project_id: UUID, content: dict, template_version: int = 1
) -> dict:
    """Replace a team's structured review-notes document.

    Writable by the team's Review TA or the instructor; the notes are the
    Review TA's worksheet (the Home TA has the score sheet instead). One upsert
    on ``final_review_notes_project_unique (project_id)`` (was select, then
    update or insert).
    """
    try:
        client = get_client()
        ctx = _load_review_context(client, user_id, project_id)
        if not ctx["is_instructor"] and ctx["review_ta_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Only the team's Review TA or the instructor can edit review notes",
            )
        if not isinstance(content, dict):
            raise HTTPException(status_code=400, detail="Notes content must be an object")

        payload = {
            "content": content,
            "template_version": int(template_version or 1),
            "updated_by": user_id,
            "updated_at": datetime.now(UTC).isoformat(),
        }
        client.table(NOTES_TABLE).upsert(
            {"class_id": ctx["project"]["class_id"], "project_id": str(project_id), **payload},
            on_conflict="project_id",
        ).execute()

        logger.info("Final-review notes saved | project_id=%s by=%s", project_id, user_id)
        return {"message": "Notes saved", "project_id": str(project_id), "notes": payload}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error saving final-review notes | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to save notes")


def release_review_ta(caller_id: str, project_id: UUID, target_user_id: UUID) -> dict:
    """Release a team's additional reviewer (the reviewer themselves, or the instructor)."""
    try:
        client = get_client()
        project = _load_project(client, project_id)
        target = str(target_user_id)

        if not _owns_class(project, caller_id) and target != str(caller_id):
            raise HTTPException(
                status_code=403,
                detail="Only the reviewer themselves or the instructor can remove this review slot",
            )

        client.table(REVIEW_TA_TABLE).delete().eq("project_id", str(project_id)).eq(
            "user_id", target
        ).execute()
        logger.info(
            "Additional reviewer released | project_id=%s user_id=%s by=%s",
            project_id,
            target,
            caller_id,
        )
        return {
            "message": "Additional reviewer removed",
            "project_id": str(project_id),
            "user_id": target,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error releasing review TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to release review TA")
