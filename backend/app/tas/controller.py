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
from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException

from app.database.client import service_client, supabase
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)

ENROLLMENT_ROLE_STUDENT = "student"
ENROLLMENT_ROLE_TA = "ta"


def _client():
    return service_client if service_client else supabase


def _require_class_instructor(client, user_id: str, class_id) -> dict:
    """Ensure ``user_id`` owns ``class_id``; return the class row."""
    res = (
        client.table("classes")
        .select("id, created_by")
        .eq("id", str(class_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Class not found")
    if res.data[0].get("created_by") != user_id:
        raise HTTPException(
            status_code=403,
            detail="Only the class instructor can manage TAs",
        )
    return res.data[0]


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
    """Class-level role for the requesting user (instructor / ta / student / none)."""
    try:
        client = _client()
        class_res = (
            client.table("classes")
            .select("id, created_by")
            .eq("id", str(class_id))
            .execute()
        )
        if not class_res.data:
            raise HTTPException(status_code=404, detail="Class not found")
        if class_res.data[0].get("created_by") == user_id:
            return {"enrollment_role": "instructor"}

        role = get_enrollment_role(client, class_id, user_id)
        return {"enrollment_role": role}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching enrollment role | class_id=%s user_id=%s",
            class_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch role")


def promote_to_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Promote an enrolled student to TA for this class (instructor only)."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollment = _get_enrollment(client, class_id, str(target_user_id))
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("class_enrollments").update(
            {"enrollment_role": ENROLLMENT_ROLE_TA}
        ).eq("id", enrollment["id"]).execute()

        logger.info(
            "Student promoted to TA | class_id=%s user_id=%s by=%s",
            class_id, target_user_id, instructor_id,
        )
        return {"message": "Student promoted to TA", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error promoting TA | class_id=%s user_id=%s", class_id, target_user_id
        )
        raise HTTPException(status_code=500, detail="Failed to promote TA")


def demote_ta(instructor_id: str, class_id: UUID, target_user_id: UUID) -> dict:
    """Demote a TA back to a regular student and clear their project assignments."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollment = _get_enrollment(client, class_id, str(target_user_id))
        if not enrollment:
            raise HTTPException(
                status_code=400,
                detail="User is not enrolled in this class",
            )

        client.table("class_enrollments").update(
            {"enrollment_role": ENROLLMENT_ROLE_STUDENT}
        ).eq("id", enrollment["id"]).execute()

        # A demoted TA no longer oversees any project in this class: clear their
        # assigned-TA (meeting + TSR-review) ownership and drop any end-of-quarter
        # review claims they hold.
        client.table("projects").update({"assigned_ta_id": None}).eq(
            "class_id", str(class_id)
        ).eq("assigned_ta_id", str(target_user_id)).execute()
        client.table("project_review_tas").delete().eq(
            "class_id", str(class_id)
        ).eq("user_id", str(target_user_id)).execute()

        logger.info(
            "TA demoted to student | class_id=%s user_id=%s by=%s",
            class_id, target_user_id, instructor_id,
        )
        return {"message": "TA demoted to student", "user_id": str(target_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error demoting TA | class_id=%s user_id=%s", class_id, target_user_id
        )
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
    for r in (rows.data or []):
        uid = r.get("assigned_ta_id")
        pid = r.get("id")
        if not uid or not pid:
            continue
        out.setdefault(uid, []).append({"id": pid, "name": r.get("name")})
    for assignments in out.values():
        assignments.sort(key=lambda p: (p["name"] or "").lower())
    return out


def list_class_tas(instructor_id: str, class_id: UUID) -> list[dict]:
    """List every TA in a class with the projects they oversee (instructor only)."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)

        enrollments = (
            client.table("class_enrollments")
            .select("user_id, enrollment_role")
            .eq("class_id", str(class_id))
            .eq("enrollment_role", ENROLLMENT_ROLE_TA)
            .execute()
        )
        ta_ids = [str(e["user_id"]) for e in (enrollments.data or []) if e.get("user_id")]
        if not ta_ids:
            return []

        profiles = (
            client.table("profiles")
            .select(PROFILE_SELECT)
            .in_("id", ta_ids)
            .execute()
        )
        profile_map = {p["id"]: p for p in (profiles.data or [])}
        assignments_map = _ta_assignments_by_user(client, class_id, ta_ids)

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


def _load_project(client, project_id: UUID) -> dict:
    """Load the columns the TA/review helpers need, or 404."""
    res = (
        client.table("projects")
        .select("id, class_id, name, assigned_ta_id")
        .eq("id", str(project_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return res.data[0]


def _is_class_instructor(client, user_id: str, class_id) -> bool:
    """True iff ``user_id`` owns ``class_id`` (does not raise)."""
    res = client.table("classes").select("created_by").eq("id", str(class_id)).execute()
    return bool(res.data) and res.data[0].get("created_by") == user_id


def list_project_tas(user_id: str, project_id: UUID) -> list[dict]:
    """The project's single assigned TA, as a 0-or-1 element list.

    Kept as a list for response-shape compatibility with the project-details UI.
    Readable by the class instructor or any enrolled class member.
    """
    try:
        client = _client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]

        # Access: class instructor or an enrolled member of the class.
        if not _is_class_instructor(client, user_id, class_id) \
                and get_enrollment_role(client, class_id, user_id) is None:
            raise HTTPException(status_code=403, detail="You do not have access to this class")

        assigned_ta_id = project.get("assigned_ta_id")
        if not assigned_ta_id:
            return []

        prof_res = (
            client.table("profiles").select(PROFILE_SELECT).eq("id", str(assigned_ta_id)).execute()
        )
        prof = (prof_res.data or [{}])[0]
        return [{
            "user_id": assigned_ta_id,
            "name": profile_display_name(prof),
            "email": (prof or {}).get("email"),
            "assigned_at": None,
        }]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing project TAs | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to list project TAs")


def get_ta_review_targets(user_id: str, class_id: UUID) -> dict:
    """For a TA: the projects they oversee plus the class's TSR assignments.

    Powers the TA review page. The TA picks a TSR assignment and a project,
    then the regular TSR-overview endpoint returns the (TA-scoped) responses.
    """
    try:
        client = _client()
        if get_enrollment_role(client, class_id, user_id) != ENROLLMENT_ROLE_TA:
            raise HTTPException(status_code=403, detail="You are not a TA in this class")

        assignment_rows = _ta_assignments_by_user(client, class_id, [user_id])
        projects = assignment_rows.get(user_id, [])

        assignments_res = (
            client.table("assignments")
            .select("id, Title, open_date, close_date, status, assignment_type")
            .eq("class_id", str(class_id))
            .eq("assignment_type", "tsr")
            .order("open_date")
            .execute()
        )
        assignments = assignments_res.data or []

        return {"projects": projects, "assignments": assignments}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching TA review targets | class_id=%s user_id=%s",
            class_id, user_id,
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


def _review_window_open(client, class_id) -> bool:
    res = client.table("classes").select("review_period_open").eq("id", str(class_id)).execute()
    return bool(res.data) and bool(res.data[0].get("review_period_open"))


def set_review_window(instructor_id: str, class_id: UUID, is_open: bool) -> dict:
    """Open or close a class's end-of-quarter review window (instructor only)."""
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)
        client.table("classes").update(
            {"review_period_open": bool(is_open)}
        ).eq("id", str(class_id)).execute()
        logger.info(
            "Review window %s | class_id=%s by=%s",
            "opened" if is_open else "closed", class_id, instructor_id,
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
        client = _client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]

        if not _is_class_instructor(client, user_id, class_id) \
                and get_enrollment_role(client, class_id, user_id) is None:
            raise HTTPException(status_code=403, detail="You do not have access to this class")

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
            "review_period_open": _review_window_open(client, class_id),
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
    """
    try:
        client = _client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]
        main_id = project.get("assigned_ta_id")
        is_instructor = _is_class_instructor(client, caller_id, class_id)

        if is_instructor:
            if not target_user_id:
                raise HTTPException(status_code=400, detail="Specify which TA to assign as reviewer")
            target = str(target_user_id)
        else:
            if target_user_id and str(target_user_id) != str(caller_id):
                raise HTTPException(status_code=403, detail="Only the instructor can appoint another TA")
            target = str(caller_id)
            if not _review_window_open(client, class_id):
                raise HTTPException(status_code=403, detail="The end-of-quarter review window is not open")

        if get_enrollment_role(client, class_id, target) != ENROLLMENT_ROLE_TA:
            raise HTTPException(status_code=400, detail="The reviewer must be a designated TA of this class")
        if main_id and str(main_id) == target:
            raise HTTPException(
                status_code=400,
                detail="The additional reviewer must be a different TA than the team's assigned TA",
            )

        existing = (
            client.table(REVIEW_TA_TABLE)
            .select("id, user_id")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []

        if any(str(r.get("user_id")) == target for r in existing):
            return {"message": "Already the additional reviewer", "project_id": str(project_id), "user_id": target}
        if existing:
            if not is_instructor:
                raise HTTPException(status_code=409, detail="This team already has an additional reviewer")
            # Instructor override replaces the current additional reviewer.
            client.table(REVIEW_TA_TABLE).delete().eq("project_id", str(project_id)).execute()

        client.table(REVIEW_TA_TABLE).insert({
            "class_id": class_id,
            "project_id": str(project_id),
            "user_id": target,
            "assigned_by": caller_id,
        }).execute()
        logger.info(
            "Additional reviewer set | project_id=%s user_id=%s by=%s",
            project_id, target, caller_id,
        )
        return {"message": "Additional reviewer assigned", "project_id": str(project_id), "user_id": target}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting review TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to set review TA")


def set_review_zoom(instructor_id: str, class_id: UUID, zoom_url: str | None) -> dict:
    """Set or clear the class's ONE shared final-review Zoom room (instructor only).

    Every team's final review happens in this room; a null/blank URL clears it.
    """
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, class_id)
        url = (zoom_url or "").strip() or None
        client.table("classes").update(
            {"review_zoom_url": url}
        ).eq("id", str(class_id)).execute()
        logger.info(
            "Review Zoom %s | class_id=%s by=%s",
            "set" if url else "cleared", class_id, instructor_id,
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


def set_final_review_time(instructor_id: str, project_id: UUID, scheduled_at: datetime | None) -> dict:
    """Set or clear a team's single final-review slot (instructor only).

    One timestamptz per team (``projects.final_review_at``); no attendance is
    taken for final reviews, so this deliberately does not create a ``meetings``
    row.
    """
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_class_instructor(client, instructor_id, project["class_id"])
        value = scheduled_at.isoformat() if scheduled_at else None
        client.table("projects").update(
            {"final_review_at": value}
        ).eq("id", str(project_id)).execute()
        logger.info(
            "Final review time %s | project_id=%s at=%s by=%s",
            "set" if value else "cleared", project_id, value, instructor_id,
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
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def get_final_review_schedule(user_id: str, class_id: UUID) -> dict:
    """The class's full final-review schedule (instructor or any class TA).

    Per team: name, review slot, Home TA (assigned_ta_id) and Review TA
    (additional reviewer, null = open slot) — ordered by slot time with
    unscheduled teams last. Class-level: the shared Zoom room, the review-window
    state, and how many teams the viewer reviews (their Review-TA claims).
    """
    try:
        client = _client()
        class_res = (
            client.table("classes")
            .select("id, created_by, review_period_open, review_zoom_url")
            .eq("id", str(class_id))
            .execute()
        )
        if not class_res.data:
            raise HTTPException(status_code=404, detail="Class not found")
        cls = class_res.data[0]

        if cls.get("created_by") != user_id \
                and get_enrollment_role(client, class_id, user_id) != ENROLLMENT_ROLE_TA:
            raise HTTPException(
                status_code=403,
                detail="Only the instructor or class TAs can view the final-review schedule",
            )

        projects = (
            client.table("projects")
            .select("id, name, assigned_ta_id, final_review_at")
            .eq("class_id", str(class_id))
            .execute()
        ).data or []
        review_rows = (
            client.table(REVIEW_TA_TABLE)
            .select("project_id, user_id, claimed_at")
            .eq("class_id", str(class_id))
            .execute()
        ).data or []
        review_by_project = {r["project_id"]: r for r in review_rows if r.get("project_id")}

        ta_ids = {p.get("assigned_ta_id") for p in projects} | {r.get("user_id") for r in review_rows}
        ta_ids.discard(None)
        profile_map: dict[str, dict] = {}
        if ta_ids:
            profs = client.table("profiles").select(PROFILE_SELECT).in_("id", list(ta_ids)).execute()
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
            teams.append({
                "project_id": p["id"],
                "name": p.get("name"),
                "final_review_at": p.get("final_review_at"),
                "home_ta": _person(p.get("assigned_ta_id")),
                "review_ta": _person(claim.get("user_id"), claimed_at=claim.get("claimed_at")) if claim else None,
            })

        far_future = datetime.max.replace(tzinfo=timezone.utc)
        teams.sort(key=lambda t: (
            _parse_review_ts(t["final_review_at"]) or far_future,
            (t["name"] or "").lower(),
        ))

        return {
            "class_id": str(class_id),
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
        client.table(REVIEW_TA_TABLE)
        .select("user_id")
        .eq("project_id", str(project_id))
        .execute()
    ).data or []
    return rows[0].get("user_id") if rows else None


def _load_review_context(client, user_id: str, project_id: UUID) -> dict:
    """Project + class + role context shared by the scoring endpoints.

    Raises 404 for a missing project and 403 unless the caller is the class
    instructor or a class TA (students never see final-review internals).
    """
    proj_res = (
        client.table("projects")
        .select("id, class_id, name, assigned_ta_id, final_review_at")
        .eq("id", str(project_id))
        .execute()
    )
    if not proj_res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = proj_res.data[0]

    class_res = (
        client.table("classes")
        .select("id, created_by, review_period_open, review_zoom_url")
        .eq("id", str(project["class_id"]))
        .execute()
    )
    cls = class_res.data[0] if class_res.data else {}

    is_instructor = cls.get("created_by") == user_id
    if not is_instructor and \
            get_enrollment_role(client, project["class_id"], user_id) != ENROLLMENT_ROLE_TA:
        raise HTTPException(
            status_code=403,
            detail="Only the instructor or class TAs can access final-review details",
        )

    review_ta_id = _review_ta_of(client, project_id)
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
    }


def get_final_review_detail(user_id: str, project_id: UUID) -> dict:
    """One team's full final-review workspace (instructor or any class TA).

    Header context (slot, shared Zoom, both TAs), the roster of team members
    to score, every score row entered so far (all roles — the staff sheet is
    shared), and the Review-TA notes document.
    """
    try:
        client = _client()
        ctx = _load_review_context(client, user_id, project_id)
        project, cls = ctx["project"], ctx["class"]

        member_rows = (
            client.table("project_members")
            .select("user_id")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []
        member_ids = [str(m["user_id"]) for m in member_rows if m.get("user_id")]

        profile_ids = set(member_ids)
        profile_ids.update(i for i in (project.get("assigned_ta_id"), ctx["review_ta_id"]) if i)
        profile_map: dict[str, dict] = {}
        if profile_ids:
            profs = client.table("profiles").select(PROFILE_SELECT).in_("id", list(profile_ids)).execute()
            profile_map = {p["id"]: p for p in (profs.data or [])}

        def _person(uid):
            if not uid:
                return None
            p = profile_map.get(uid, {})
            return {"user_id": uid, "name": profile_display_name(p), "email": (p or {}).get("email")}

        members = sorted(
            (_person(uid) for uid in member_ids),
            key=lambda m: (m["name"] or "").lower(),
        )

        score_rows = (
            client.table(SCORE_TABLE)
            .select("student_id, role, product, team, scrum, overall, notes, scored_by, updated_at")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []

        notes_rows = (
            client.table(NOTES_TABLE)
            .select("content, template_version, updated_by, updated_at")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []

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
            "scores": score_rows,
            "notes": notes_rows[0] if notes_rows else None,
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


def save_final_review_scores(user_id: str, project_id: UUID, role: str, entries: list[dict]) -> dict:
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
    ``model_dump(exclude_unset=True)``) is NOT a clear signal: it 400s
    exactly like before, so a payload that's missing a field (a typo'd name,
    a stale client) can never silently delete data instead of failing loudly.
    An all-null row would be indistinguishable from "never scored" everywhere
    else that reads this table (the detail view, team averages), so there is
    no reason to keep it around; deleting also makes a clear idempotent (no
    row to delete is a no-op, not an error). A partial combination within the
    Home TA triple (some filled, some blank, or some keys simply missing) is
    still rejected — clearing is all-three-or-nothing, matching the same
    "need all three" rule saving already enforces. Clearing removes the
    WHOLE row, including its `notes` value — callers must not request a
    clear while a note draft/value exists for that student/role (see
    FinalReviewDetail.tsx's entry-time guard on the frontend).
    """
    try:
        if role not in SCORE_ROLES:
            raise HTTPException(status_code=400, detail="Unknown scorer role")

        client = _client()
        ctx = _load_review_context(client, user_id, project_id)
        project = ctx["project"]

        allowed = ctx["is_instructor"] or (
            role == "home" and project.get("assigned_ta_id") == user_id
        ) or (
            role == "review" and ctx["review_ta_id"] == user_id
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

        now = datetime.now(timezone.utc).isoformat()
        saved = 0
        for entry in entries or []:
            student_id = str(entry.get("student_id") or "")
            if student_id not in member_ids:
                raise HTTPException(status_code=400, detail="Student is not a member of this team")

            if role == "home":
                if entry.get("overall") is not None:
                    raise HTTPException(status_code=400, detail="Home TA rows carry category scores, not an overall")
                # A field the client never sent is absent from `entry`
                # entirely (views.py dumps with exclude_unset=True) — only
                # treat this as a clear when all three keys were explicitly
                # sent (any value, including null); a merely-missing key
                # must fail the same way it always has, below.
                fields_present = all(f in entry for f in _HOME_FIELDS)
                raw = {f: entry.get(f) for f in _HOME_FIELDS}
                if fields_present and all(raw[f] is None for f in _HOME_FIELDS):
                    # Explicit clear: product/team/scrum blanked together.
                    client.table(SCORE_TABLE).delete().eq(
                        "project_id", str(project_id)
                    ).eq("student_id", student_id).eq("role", role).execute()
                    saved += 1
                    continue
                if any(raw[f] is None for f in _HOME_FIELDS):
                    raise HTTPException(status_code=400, detail="Home TA scores need product, team, and scrum")
                values = {f: _round_score(raw[f], f) for f in _HOME_FIELDS}
                values["overall"] = None
            else:
                if any(entry.get(f) is not None for f in _HOME_FIELDS):
                    raise HTTPException(status_code=400, detail="Only the Home TA enters category scores")
                if "overall" not in entry:
                    # Never sent at all — 400, same message as always. Only
                    # an explicit null (key present) below is a clear signal.
                    raise HTTPException(status_code=400, detail="An overall score is required")
                if entry["overall"] is None:
                    # Explicit clear.
                    client.table(SCORE_TABLE).delete().eq(
                        "project_id", str(project_id)
                    ).eq("student_id", student_id).eq("role", role).execute()
                    saved += 1
                    continue
                values = {f: None for f in _HOME_FIELDS}
                values["overall"] = _round_score(entry["overall"], "overall")

            values["notes"] = (entry.get("notes") or "").strip() or None
            values["scored_by"] = user_id
            values["updated_at"] = now

            existing = (
                client.table(SCORE_TABLE)
                .select("id")
                .eq("project_id", str(project_id))
                .eq("student_id", student_id)
                .eq("role", role)
                .execute()
            ).data or []
            if existing:
                client.table(SCORE_TABLE).update(values).eq("id", existing[0]["id"]).execute()
            else:
                client.table(SCORE_TABLE).insert({
                    "class_id": project["class_id"],
                    "project_id": str(project_id),
                    "student_id": student_id,
                    "role": role,
                    **values,
                }).execute()
            saved += 1

        logger.info(
            "Final-review scores saved | project_id=%s role=%s rows=%d by=%s",
            project_id, role, saved, user_id,
        )
        return {"message": "Scores saved", "project_id": str(project_id), "role": role, "saved": saved}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error saving final-review scores | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to save scores")


def save_final_review_notes(user_id: str, project_id: UUID, content: dict, template_version: int = 1) -> dict:
    """Replace a team's structured review-notes document.

    Writable by the team's Review TA or the instructor; the notes are the
    Review TA's worksheet (the Home TA has the score sheet instead).
    """
    try:
        client = _client()
        ctx = _load_review_context(client, user_id, project_id)
        if not ctx["is_instructor"] and ctx["review_ta_id"] != user_id:
            raise HTTPException(
                status_code=403,
                detail="Only the team's Review TA or the instructor can edit review notes",
            )
        if not isinstance(content, dict):
            raise HTTPException(status_code=400, detail="Notes content must be an object")

        now = datetime.now(timezone.utc).isoformat()
        payload = {
            "content": content,
            "template_version": int(template_version or 1),
            "updated_by": user_id,
            "updated_at": now,
        }
        existing = (
            client.table(NOTES_TABLE)
            .select("id")
            .eq("project_id", str(project_id))
            .execute()
        ).data or []
        if existing:
            client.table(NOTES_TABLE).update(payload).eq("id", existing[0]["id"]).execute()
        else:
            client.table(NOTES_TABLE).insert({
                "class_id": ctx["project"]["class_id"],
                "project_id": str(project_id),
                **payload,
            }).execute()

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
        client = _client()
        project = _load_project(client, project_id)
        class_id = project["class_id"]
        target = str(target_user_id)

        if not _is_class_instructor(client, caller_id, class_id) and target != str(caller_id):
            raise HTTPException(
                status_code=403,
                detail="Only the reviewer themselves or the instructor can remove this review slot",
            )

        client.table(REVIEW_TA_TABLE).delete().eq(
            "project_id", str(project_id)
        ).eq("user_id", target).execute()
        logger.info(
            "Additional reviewer released | project_id=%s user_id=%s by=%s",
            project_id, target, caller_id,
        )
        return {"message": "Additional reviewer removed", "project_id": str(project_id), "user_id": target}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error releasing review TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to release review TA")
