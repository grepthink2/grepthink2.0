"""
TA Management business logic.

Owns three related surfaces that share permission helpers:
  * per-class TA designation (``class_tas``)
  * per-project TA assignment + meeting/Zoom metadata (columns on ``projects``)
  * per-week attendance (``attendance``)

Permission model (RLS is off; everything is enforced here):
  * Designate class TAs / assign a project TA  -> class instructor only.
  * Edit meeting/Zoom + mark attendance        -> class instructor OR the
    project's assigned TA.
  * Read the class schedule                     -> instructor OR any class TA.
  * Read own team schedule + own attendance     -> any project member.
"""
import datetime
import logging
from typing import Optional
from uuid import UUID

from fastapi import HTTPException

from app.database.client import service_client, supabase
# Reuse the battle-tested "instructor owns this class" check.
from app.projects.controller import _is_instructor
# Reuse the term -> week-count convention used for TSR auto-creation so
# attendance weeks line up with the rest of the app.
from app.classes.controller import (
    _FULL_TERM_NAMES,
    _FULL_TSR_COUNT,
    _SUMMER_TSR_COUNT,
)

logger = logging.getLogger(__name__)

_VALID_STATUSES = ("present", "late", "absent")
_WEEKDAY_ORDER = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def _client():
    return service_client if service_client else supabase


# ---------------------------------------------------------------------------
# Week helpers (term -> number of weeks; start_date -> current/labelled week)
# ---------------------------------------------------------------------------

def _term_max_weeks(term: Optional[str]) -> int:
    """Number of meeting weeks in a term (matches the TSR convention)."""
    return _FULL_TSR_COUNT if (term or "").strip().lower() in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT


def _parse_date(value) -> Optional[datetime.date]:
    if not value:
        return None
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _current_term_week(start_date, term: Optional[str]) -> int:
    """Week index (1..max) for today, relative to the class start date."""
    max_weeks = _term_max_weeks(term)
    start = _parse_date(start_date)
    if start is None:
        return 1
    delta_days = (datetime.date.today() - start).days
    week = delta_days // 7 + 1
    return max(1, min(week, max_weeks))


def _week_of_iso(start_date, week_number: int) -> Optional[str]:
    """ISO date of the first day of the given week, for display labelling."""
    start = _parse_date(start_date)
    if start is None:
        return None
    return (start + datetime.timedelta(weeks=week_number - 1)).isoformat()


# ---------------------------------------------------------------------------
# Permission helpers
# ---------------------------------------------------------------------------

def is_class_ta(user_id: str, class_id: str) -> bool:
    """True iff a class_tas row exists for (class_id, user_id)."""
    if not user_id or not class_id:
        return False
    res = (
        _client().table("class_tas").select("user_id")
        .eq("class_id", str(class_id)).eq("user_id", str(user_id))
        .execute()
    )
    return bool(res.data)


def _is_enrolled(client, class_id: str, user_id: str) -> bool:
    res = (
        client.table("class_enrollments").select("user_id")
        .eq("class_id", str(class_id)).eq("user_id", str(user_id))
        .execute()
    )
    return bool(res.data)


def _load_project(client, project_id: str) -> dict:
    res = (
        client.table("projects")
        .select("id, class_id, name, assigned_ta_id, zoom_url, meeting_day, meeting_time, num_members")
        .eq("id", str(project_id)).execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return res.data[0]


def _require_meeting_editor(client, user_id: str, project: dict) -> None:
    """Allow the class instructor or this project's assigned TA."""
    if _is_instructor(user_id, project["class_id"]):
        return
    assigned = project.get("assigned_ta_id")
    if assigned and str(assigned) == str(user_id):
        return
    raise HTTPException(
        status_code=403,
        detail="Only the class instructor or this team's assigned TA can edit this team",
    )


def _require_class_instructor(client, user_id: str, class_id: str) -> None:
    if not _is_instructor(user_id, class_id):
        raise HTTPException(status_code=403, detail="Only the class instructor can do this")


# ---------------------------------------------------------------------------
# Class TA designation
# ---------------------------------------------------------------------------

def set_class_ta(class_id: UUID, instructor_id: str, target_user_id: str, is_ta: bool) -> dict:
    """Designate or undesignate an enrolled student as a TA for the class."""
    try:
        client = _client()
        cid, tid = str(class_id), str(target_user_id)
        _require_class_instructor(client, instructor_id, cid)

        if is_ta:
            if not _is_enrolled(client, cid, tid):
                raise HTTPException(status_code=400, detail="Student must be enrolled in this class")
            # Idempotent: skip if already a TA.
            existing = (
                client.table("class_tas").select("user_id")
                .eq("class_id", cid).eq("user_id", tid).execute()
            )
            if not existing.data:
                client.table("class_tas").insert(
                    {"class_id": cid, "user_id": tid, "created_by": instructor_id}
                ).execute()
            logger.info("Class TA designated | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
            return {"message": "TA designated", "user_id": tid, "is_ta": True}

        # Undesignate: remove the row and clear any project assignments in this class.
        client.table("class_tas").delete().eq("class_id", cid).eq("user_id", tid).execute()
        client.table("projects").update({"assigned_ta_id": None}) \
            .eq("class_id", cid).eq("assigned_ta_id", tid).execute()
        logger.info("Class TA removed | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
        return {"message": "TA removed", "user_id": tid, "is_ta": False}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error setting class TA | class_id=%s user_id=%s", class_id, target_user_id)
        raise HTTPException(status_code=500, detail="Failed to update class TA")


def list_class_tas(class_id: UUID, user_id: str, role: str) -> list:
    """Enrolled students of the class, each flagged with whether they are a TA.

    Readable by the class instructor or any enrolled member (so the UI can show
    TA badges); the designate-toggle UI is gated separately on the write path.
    """
    try:
        client = _client()
        cid = str(class_id)

        is_instr = _is_instructor(user_id, cid)
        if not is_instr and not _is_enrolled(client, cid, user_id):
            raise HTTPException(status_code=403, detail="You do not have access to this class")

        enrollments = (
            client.table("class_enrollments").select("user_id").eq("class_id", cid).execute()
        )
        student_ids = [r["user_id"] for r in (enrollments.data or [])]
        if not student_ids:
            return []

        ta_rows = client.table("class_tas").select("user_id").eq("class_id", cid).execute()
        ta_ids = {r["user_id"] for r in (ta_rows.data or [])}

        profiles = (
            client.table("profiles")
            .select("id, email, first_name, last_name, image_url")
            .in_("id", student_ids).execute()
        )
        pmap = {p["id"]: p for p in (profiles.data or [])}

        out = []
        for sid in student_ids:
            p = pmap.get(sid, {})
            name = f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip() or p.get("email")
            out.append({
                "user_id": sid,
                "name": name,
                "email": p.get("email"),
                "image_url": p.get("image_url"),
                "is_ta": sid in ta_ids,
            })
        out.sort(key=lambda r: (not r["is_ta"], (r["name"] or "").lower()))
        return out
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error listing class TAs | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to list class TAs")


# ---------------------------------------------------------------------------
# Project TA assignment + meeting/Zoom metadata
# ---------------------------------------------------------------------------

def assign_project_ta(project_id: UUID, instructor_id: str, ta_user_id: Optional[str]) -> dict:
    """Assign a designated class TA to a project, or clear with ta_user_id=None."""
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_class_instructor(client, instructor_id, project["class_id"])

        if ta_user_id is None:
            client.table("projects").update({"assigned_ta_id": None}).eq("id", str(project_id)).execute()
            return {"message": "TA unassigned", "project_id": str(project_id), "assigned_ta_id": None}

        if not is_class_ta(str(ta_user_id), project["class_id"]):
            raise HTTPException(status_code=400, detail="Assigned TA must be a designated TA of this class")

        client.table("projects").update({"assigned_ta_id": str(ta_user_id)}) \
            .eq("id", str(project_id)).execute()
        logger.info("Project TA assigned | project_id=%s ta=%s", project_id, ta_user_id)
        return {"message": "TA assigned", "project_id": str(project_id), "assigned_ta_id": str(ta_user_id)}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error assigning project TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to assign project TA")


def update_project_meeting(
    project_id: UUID,
    user_id: str,
    zoom_url: Optional[str] = None,
    meeting_day: Optional[str] = None,
    meeting_time: Optional[str] = None,
) -> dict:
    """Update a project's Zoom link / meeting slot (instructor or assigned TA)."""
    if zoom_url is None and meeting_day is None and meeting_time is None:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    if meeting_day is not None and meeting_day != "" and meeting_day.strip().lower() not in _WEEKDAY_ORDER:
        raise HTTPException(status_code=400, detail="meeting_day must be a weekday name")
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, user_id, project)

        updates: dict = {}
        if zoom_url is not None:
            updates["zoom_url"] = zoom_url or None
        if meeting_day is not None:
            updates["meeting_day"] = (meeting_day.strip().lower() or None) if meeting_day else None
        if meeting_time is not None:
            updates["meeting_time"] = meeting_time or None

        result = client.table("projects").update(updates).eq("id", str(project_id)).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to update meeting")
        logger.info("Project meeting updated | project_id=%s fields=%s", project_id, list(updates.keys()))
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating project meeting | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to update meeting")


# ---------------------------------------------------------------------------
# Schedule aggregation
# ---------------------------------------------------------------------------

def get_ta_schedule(
    class_id: UUID,
    user_id: str,
    role: str,
    week_number: Optional[int] = None,
    scope: str = "all",
) -> dict:
    """Weekly meeting schedule for a class.

    scope:
      * ``all``     — every team (instructor or any class TA)
      * ``mine``    — teams assigned to the caller (TA)
      * ``my-team`` — the caller's own team(s) (student/member)
    """
    try:
        client = _client()
        cid = str(class_id)

        cls = client.table("classes").select("id, created_by, term, start_date").eq("id", cid).execute()
        if not cls.data:
            raise HTTPException(status_code=404, detail="Class not found")
        class_row = cls.data[0]

        is_instr = _is_instructor(user_id, cid)
        is_ta = is_class_ta(user_id, cid)

        if scope in ("all", "mine"):
            if not (is_instr or is_ta):
                raise HTTPException(status_code=403, detail="Only the instructor or a class TA can view this schedule")
        elif scope == "my-team":
            if not (is_instr or is_ta or _is_enrolled(client, cid, user_id)):
                raise HTTPException(status_code=403, detail="You do not have access to this class")
        else:
            raise HTTPException(status_code=400, detail="Invalid scope")

        total_weeks = _term_max_weeks(class_row.get("term"))
        if week_number is None:
            week_number = _current_term_week(class_row.get("start_date"), class_row.get("term"))
        week_number = max(1, min(int(week_number), total_weeks))

        projects = (
            client.table("projects")
            .select("id, name, assigned_ta_id, zoom_url, meeting_day, meeting_time, num_members")
            .eq("class_id", cid).execute()
        ).data or []

        if scope == "mine":
            projects = [p for p in projects if p.get("assigned_ta_id") and str(p["assigned_ta_id"]) == str(user_id)]
        elif scope == "my-team":
            mine = (
                client.table("project_members").select("project_id")
                .eq("user_id", user_id).execute()
            ).data or []
            mine_ids = {r["project_id"] for r in mine}
            projects = [p for p in projects if p["id"] in mine_ids]

        meta = {
            "class_id": cid,
            "week_number": week_number,
            "total_weeks": total_weeks,
            "week_of": _week_of_iso(class_row.get("start_date"), week_number),
        }
        if not projects:
            return {**meta, "teams": []}

        project_ids = [p["id"] for p in projects]

        members = (
            client.table("project_members").select("project_id, user_id")
            .in_("project_id", project_ids).execute()
        ).data or []
        member_count: dict[str, int] = {}
        for m in members:
            member_count[m["project_id"]] = member_count.get(m["project_id"], 0) + 1

        att = (
            client.table("attendance").select("project_id, status")
            .in_("project_id", project_ids).eq("week_number", week_number).execute()
        ).data or []
        present_count: dict[str, int] = {}
        for a in att:
            if a.get("status") == "present":
                present_count[a["project_id"]] = present_count.get(a["project_id"], 0) + 1

        ta_ids = list({str(p["assigned_ta_id"]) for p in projects if p.get("assigned_ta_id")})
        ta_map: dict[str, dict] = {}
        if ta_ids:
            tas = (
                client.table("profiles").select("id, email, first_name, last_name, image_url")
                .in_("id", ta_ids).execute()
            ).data or []
            ta_map = {t["id"]: t for t in tas}

        teams = []
        for p in projects:
            ta = ta_map.get(p.get("assigned_ta_id")) if p.get("assigned_ta_id") else None
            assigned_ta = None
            if ta:
                name = f"{ta.get('first_name') or ''} {ta.get('last_name') or ''}".strip() or ta.get("email")
                assigned_ta = {"id": ta["id"], "name": name, "email": ta.get("email"), "image_url": ta.get("image_url")}
            total = member_count.get(p["id"], p.get("num_members") or 0)
            teams.append({
                "project_id": p["id"],
                "project_name": p.get("name"),
                "meeting_day": p.get("meeting_day"),
                "meeting_time": p.get("meeting_time"),
                "zoom_url": p.get("zoom_url"),
                "assigned_ta": assigned_ta,
                "attendance_present": present_count.get(p["id"], 0),
                "attendance_total": total,
            })

        teams.sort(key=lambda t: (
            _WEEKDAY_ORDER.get((t["meeting_day"] or "").lower(), 99),
            (t["project_name"] or "").lower(),
        ))
        return {**meta, "teams": teams}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error building TA schedule | class_id=%s scope=%s", class_id, scope)
        raise HTTPException(status_code=500, detail="Failed to load schedule")


# ---------------------------------------------------------------------------
# Attendance read + write
# ---------------------------------------------------------------------------

def get_team_attendance(project_id: UUID, user_id: str, week_number: int) -> dict:
    """Roster + statuses for a (project, week).

    Instructor / assigned TA see every member; a plain member sees only their
    own row.
    """
    try:
        client = _client()
        project = _load_project(client, project_id)

        is_editor = True
        try:
            _require_meeting_editor(client, user_id, project)
        except HTTPException:
            is_editor = False

        members = (
            client.table("project_members").select("user_id")
            .eq("project_id", str(project_id)).execute()
        ).data or []
        member_ids = [m["user_id"] for m in members]

        if not is_editor:
            if user_id not in member_ids:
                raise HTTPException(status_code=403, detail="You are not a member of this team")
            member_ids = [user_id]

        if not member_ids:
            return {"project_id": str(project_id), "week_number": week_number, "entries": []}

        profiles = (
            client.table("profiles").select("id, email, first_name, last_name, image_url")
            .in_("id", member_ids).execute()
        ).data or []
        pmap = {p["id"]: p for p in profiles}

        att = (
            client.table("attendance").select("user_id, status")
            .eq("project_id", str(project_id)).eq("week_number", week_number)
            .in_("user_id", member_ids).execute()
        ).data or []
        status_map = {a["user_id"]: a["status"] for a in att}

        entries = []
        for uid in member_ids:
            p = pmap.get(uid, {})
            name = f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip() or p.get("email")
            entries.append({
                "person_id": uid,
                "name": name,
                "email": p.get("email"),
                "image_url": p.get("image_url"),
                "status": status_map.get(uid, "unmarked"),
            })
        entries.sort(key=lambda e: (e["name"] or "").lower())
        return {"project_id": str(project_id), "week_number": week_number, "entries": entries}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching team attendance | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch attendance")


def _upsert_one(client, project_id: str, person_id: str, week_number: int, status: str, marker_id: str) -> dict:
    """Select-then-update/insert one attendance row (avoids upsert version risk)."""
    existing = (
        client.table("attendance").select("id")
        .eq("project_id", project_id).eq("user_id", person_id).eq("week_number", week_number)
        .execute()
    )
    payload = {
        "status": status,
        "marked_by": marker_id,
        "marked_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    if existing.data:
        res = (
            client.table("attendance").update(payload)
            .eq("project_id", project_id).eq("user_id", person_id).eq("week_number", week_number)
            .execute()
        )
        return res.data[0] if res.data else {**payload, "project_id": project_id, "user_id": person_id, "week_number": week_number}
    res = client.table("attendance").insert({
        "project_id": project_id, "user_id": person_id, "week_number": week_number, **payload,
    }).execute()
    return res.data[0] if res.data else {**payload, "project_id": project_id, "user_id": person_id, "week_number": week_number}


def _validate_week(client, class_id: str, week_number: int) -> None:
    cls = client.table("classes").select("term").eq("id", str(class_id)).execute()
    term = cls.data[0].get("term") if cls.data else None
    if week_number < 1 or week_number > _term_max_weeks(term):
        raise HTTPException(status_code=400, detail="week_number is outside the term")


def upsert_attendance(project_id: UUID, marker_id: str, person_id: str, week_number: int, status: str) -> dict:
    """Mark one member present/late/absent for a (project, week)."""
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, marker_id, project)
        _validate_week(client, project["class_id"], week_number)

        member = (
            client.table("project_members").select("user_id")
            .eq("project_id", str(project_id)).eq("user_id", str(person_id)).execute()
        )
        if not member.data:
            raise HTTPException(status_code=400, detail="User is not a member of this team")

        record = _upsert_one(client, str(project_id), str(person_id), week_number, status, marker_id)
        logger.info(
            "Attendance marked | project_id=%s user_id=%s week=%s status=%s by=%s",
            project_id, person_id, week_number, status, marker_id,
        )
        return record
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error marking attendance | project_id=%s user_id=%s", project_id, person_id)
        raise HTTPException(status_code=500, detail="Failed to mark attendance")


def mark_all_present(project_id: UUID, marker_id: str, week_number: int) -> list:
    """Mark every team member present for a (project, week)."""
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, marker_id, project)
        _validate_week(client, project["class_id"], week_number)

        members = (
            client.table("project_members").select("user_id")
            .eq("project_id", str(project_id)).execute()
        ).data or []
        records = []
        for m in members:
            records.append(_upsert_one(client, str(project_id), m["user_id"], week_number, "present", marker_id))
        logger.info("Marked all present | project_id=%s week=%s count=%d", project_id, week_number, len(records))
        return records
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error marking all present | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to mark all present")
