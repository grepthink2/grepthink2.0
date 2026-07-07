"""
TA Management business logic.

Owns three related surfaces that share permission helpers:
  * per-class TA designation (``class_enrollments.enrollment_role`` — the single
    source of truth, shared with the tas module and TA Review)
  * per-project meeting TA + meeting/Zoom metadata (columns on ``projects``)
  * per-week attendance (``attendance``)

Note: "meeting TA" (``projects.assigned_ta_id``, who runs a team's weekly
meeting + takes attendance) and "review TA" (``project_ta_assignments``, who
reviews a team's TSRs, owned by the tas module) are intentionally distinct
project-level roles — both now drawn from the one class-TA pool above.

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
try:  # UCSC class meeting times are Pacific; tolerate missing tzdata
    from zoneinfo import ZoneInfo
except Exception:  # pragma: no cover
    ZoneInfo = None
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
# Class-TA designation lives in class_enrollments.enrollment_role; reuse the tas
# module so attendance and TA Review share one source of truth.
from app.tas import controller as tas_controller

logger = logging.getLogger(__name__)

_VALID_STATUSES = ("present", "late", "absent")
_WEEKDAY_ORDER = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}
_CLASS_TZ = ZoneInfo("America/Los_Angeles") if ZoneInfo else None


def _client():
    return service_client if service_client else supabase


# ---------------------------------------------------------------------------
# Week helpers (term -> number of weeks; start_date -> current/labelled week)
# ---------------------------------------------------------------------------

def _term_max_weeks(term: Optional[str]) -> int:
    """TSR week count for a term (kept for parity with the TSR convention)."""
    return _FULL_TSR_COUNT if (term or "").strip().lower() in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT


# TA meetings run across the working term, which is wider than the TSR window:
# ~10 weeks for a full quarter, ~6 for a summer session (e.g. CSE115A, late
# June -> end of July). Total TA meets = meeting_weeks * meetings_per_week.
_MEETING_WEEKS_FULL = 10
_MEETING_WEEKS_SUMMER = 6


def _meeting_weeks(term: Optional[str]) -> int:
    """Number of TA-meeting weeks in a term."""
    return _MEETING_WEEKS_FULL if (term or "").strip().lower() in _FULL_TERM_NAMES else _MEETING_WEEKS_SUMMER


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
    max_weeks = _meeting_weeks(term)
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
    """True iff the user is a class TA (class_enrollments.enrollment_role='ta')."""
    if not user_id or not class_id:
        return False
    return (
        tas_controller.get_enrollment_role(_client(), class_id, str(user_id))
        == tas_controller.ENROLLMENT_ROLE_TA
    )


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
        .select("id, class_id, name, assigned_ta_id, num_members")
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
# Meetings (per-team scheduled slots; the foundation for ad-hoc + calendar)
# ---------------------------------------------------------------------------

_MEETING_COLS = ("id, class_id, project_id, sequence, day_of_week, start_time, "
                 "zoom_url, duration_minutes, cadence, scheduled_at, title")


def _parse_time(value) -> Optional[str]:
    """Lenient clock-time parse -> 'HH:MM:SS' (or None). Accepts '9:00 AM',
    '5 PM', '14:30', '09:00:00'."""
    if not value:
        return None
    s = str(value).strip().upper().replace(".", "")
    for fmt in ("%I:%M %p", "%I:%M%p", "%I %p", "%I%p", "%H:%M", "%H:%M:%S"):
        try:
            return datetime.datetime.strptime(s, fmt).time().isoformat()
        except ValueError:
            continue
    return None


def _format_time(value) -> Optional[str]:
    """'HH:MM:SS' -> '9:00 AM' for display."""
    if not value:
        return None
    try:
        t = value if isinstance(value, datetime.time) else datetime.time.fromisoformat(str(value))
    except ValueError:
        return str(value)
    return f"{(t.hour % 12) or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def _meetings_for_projects(client, project_ids: list, sequence: int) -> dict:
    """project_id -> the team's weekly meeting row for this sequence (1,2,…)."""
    if not project_ids:
        return {}
    rows = (
        client.table("meetings").select(_MEETING_COLS)
        .in_("project_id", project_ids).eq("cadence", "weekly").eq("sequence", sequence)
        .execute()
    ).data or []
    return {r["project_id"]: r for r in rows}


def _get_or_create_meeting(client, class_id: str, project_id: str, sequence: int,
                           duration_default: int = 30, marker_id: Optional[str] = None) -> dict:
    """The team's weekly meeting slot for `sequence`, creating an empty one
    (no day/time yet) when missing so attendance can reference it."""
    existing = (
        client.table("meetings").select(_MEETING_COLS)
        .eq("project_id", str(project_id)).eq("cadence", "weekly").eq("sequence", sequence)
        .execute()
    ).data
    if existing:
        return existing[0]
    row = {
        "class_id": str(class_id), "project_id": str(project_id),
        "cadence": "weekly", "sequence": int(sequence),
        "duration_minutes": int(duration_default or 30),
    }
    if marker_id:
        row["created_by"] = marker_id
    res = client.table("meetings").insert(row).execute()
    return res.data[0] if res.data else row


# ---------------------------------------------------------------------------
# Class TA designation
# ---------------------------------------------------------------------------

def set_class_ta(class_id: UUID, instructor_id: str, target_user_id: str, is_ta: bool) -> dict:
    """Designate or undesignate an enrolled student as a class TA.

    Class-TA status is stored in ``class_enrollments.enrollment_role`` — the
    single source of truth shared with the tas module and TA Review. The
    enrollment write is delegated to the tas controller so both designation UIs
    (TA Management and TA Meetings) stay in lockstep; on undesignate we also
    clear the user's meeting ownership (``projects.assigned_ta_id``) in the class
    (``demote_ta`` already clears their ``project_ta_assignments`` review rows).
    """
    cid, tid = str(class_id), str(target_user_id)
    if is_ta:
        tas_controller.promote_to_ta(instructor_id, class_id, target_user_id)
        logger.info("Class TA designated | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
        return {"message": "TA designated", "user_id": tid, "is_ta": True}

    tas_controller.demote_ta(instructor_id, class_id, target_user_id)
    try:
        _client().table("projects").update({"assigned_ta_id": None}) \
            .eq("class_id", cid).eq("assigned_ta_id", tid).execute()
    except Exception:
        logger.exception(
            "Failed to clear meeting ownership on TA removal | class_id=%s user_id=%s", cid, tid
        )
    logger.info("Class TA removed | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
    return {"message": "TA removed", "user_id": tid, "is_ta": False}


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
            client.table("class_enrollments").select("user_id, enrollment_role")
            .eq("class_id", cid).execute()
        )
        enroll_rows = enrollments.data or []
        student_ids = [r["user_id"] for r in enroll_rows]
        if not student_ids:
            return []

        # is_ta derives from the single source of truth (enrollment_role).
        ta_ids = {
            r["user_id"] for r in enroll_rows
            if r.get("enrollment_role") == tas_controller.ENROLLMENT_ROLE_TA
        }

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


def upsert_meeting(
    project_id: UUID,
    user_id: str,
    meeting_in_week: int = 1,
    zoom_url: Optional[str] = None,
    meeting_day: Optional[str] = None,
    meeting_time: Optional[str] = None,
) -> dict:
    """Set a team's weekly meeting slot (day/time/Zoom) for the given
    meeting-in-week (instructor or assigned TA). Creates the slot if needed.
    Returns the slot in schedule shape (meeting_day/meeting_time strings)."""
    if zoom_url is None and meeting_day is None and meeting_time is None:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    if meeting_day is not None and meeting_day != "" and meeting_day.strip().lower() not in _WEEKDAY_ORDER:
        raise HTTPException(status_code=400, detail="meeting_day must be a weekday name")
    seq = int(meeting_in_week or 1)
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, user_id, project)
        meeting = _get_or_create_meeting(client, project["class_id"], str(project_id), seq, marker_id=user_id)

        updates: dict = {"updated_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        if zoom_url is not None:
            updates["zoom_url"] = zoom_url or None
        if meeting_day is not None:
            updates["day_of_week"] = (meeting_day.strip().lower() or None) if meeting_day else None
        if meeting_time is not None:
            if meeting_time == "":
                updates["start_time"] = None
            else:
                parsed = _parse_time(meeting_time)
                if parsed is None:
                    raise HTTPException(status_code=400, detail="Could not parse meeting time (try e.g. '9:00 AM')")
                updates["start_time"] = parsed

        res = client.table("meetings").update(updates).eq("id", meeting["id"]).execute()
        row = res.data[0] if res.data else {**meeting, **updates}
        logger.info("Meeting slot updated | project_id=%s seq=%s fields=%s",
                    project_id, seq, [k for k in updates if k != "updated_at"])
        return {
            "project_id": str(project_id), "meeting_in_week": seq, "meeting_id": row["id"],
            "meeting_day": row.get("day_of_week"), "meeting_time": _format_time(row.get("start_time")),
            "zoom_url": row.get("zoom_url"),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating meeting slot | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to update meeting")


# ---------------------------------------------------------------------------
# Meeting cadence (class-level)
# ---------------------------------------------------------------------------

def set_meeting_cadence(class_id: UUID, instructor_id: str,
                        meetings_per_week: Optional[int] = None,
                        meeting_duration_minutes: Optional[int] = None) -> dict:
    """Set a class's TA-meeting frequency + per-meeting duration (instructor only)."""
    if meetings_per_week is None and meeting_duration_minutes is None:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    try:
        client = _client()
        _require_class_instructor(client, instructor_id, str(class_id))
        updates: dict = {}
        if meetings_per_week is not None:
            if not (1 <= int(meetings_per_week) <= 7):
                raise HTTPException(status_code=400, detail="meetings_per_week must be between 1 and 7")
            updates["meetings_per_week"] = int(meetings_per_week)
        if meeting_duration_minutes is not None:
            if int(meeting_duration_minutes) < 1:
                raise HTTPException(status_code=400, detail="meeting_duration_minutes must be positive")
            updates["meeting_duration_minutes"] = int(meeting_duration_minutes)
        res = client.table("classes").update(updates).eq("id", str(class_id)).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update meeting cadence")
        logger.info("Meeting cadence updated | class_id=%s fields=%s by=%s",
                    class_id, list(updates.keys()), instructor_id)
        return res.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating meeting cadence | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to update meeting cadence")


# ---------------------------------------------------------------------------
# Schedule aggregation
# ---------------------------------------------------------------------------

def _current_meeting_in_week(client, project_ids, meetings_per_week, now=None) -> int:
    """Sequence (1..N) of the weekly meeting happening now or coming up soonest
    across these teams, so the schedule advances M1 -> M2 -> … through the week
    instead of always showing the first slot.

    ``now`` is injectable for tests; it defaults to the current Pacific time.
    Falls back to meeting 1 when there is nothing to rank.
    """
    if meetings_per_week <= 1 or not project_ids:
        return 1
    rows = (
        client.table("meetings")
        .select("sequence, day_of_week, start_time, duration_minutes")
        .in_("project_id", project_ids).eq("cadence", "weekly").execute()
    ).data or []
    if now is None:
        now = datetime.datetime.now(_CLASS_TZ) if _CLASS_TZ else datetime.datetime.now()
    best_seq, best_delta = None, None
    for r in rows:
        dow = _WEEKDAY_ORDER.get((r.get("day_of_week") or "").lower())
        parsed = _parse_time(r.get("start_time"))
        if dow is None or not parsed:
            continue
        hh, mm, _ss = (int(x) for x in parsed.split(":"))
        days_ahead = (dow - now.weekday()) % 7
        start = (now + datetime.timedelta(days=days_ahead)).replace(
            hour=hh, minute=mm, second=0, microsecond=0)
        delta = (start - now).total_seconds()
        if delta < 0:
            # Started earlier today: still "current" while within its duration;
            # otherwise it already happened this week -> next occurrence is +7d.
            dur = int(r.get("duration_minutes") or 0) * 60
            delta = 0 if -delta <= dur else delta + 7 * 86400
        seq = int(r.get("sequence") or 1)
        if best_delta is None or delta < best_delta:
            best_delta, best_seq = delta, seq
    return best_seq or 1


def get_ta_schedule(
    class_id: UUID,
    user_id: str,
    role: str,
    week_number: Optional[int] = None,
    scope: str = "all",
    meeting_in_week: Optional[int] = None,
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

        cls = client.table("classes").select(
            "id, created_by, term, start_date, meetings_per_week, meeting_duration_minutes"
        ).eq("id", cid).execute()
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

        total_weeks = _meeting_weeks(class_row.get("term"))
        meetings_per_week = int(class_row.get("meetings_per_week") or 1)
        if week_number is None:
            week_number = _current_term_week(class_row.get("start_date"), class_row.get("term"))
        week_number = max(1, min(int(week_number), total_weeks))

        projects = (
            client.table("projects")
            .select("id, name, assigned_ta_id, num_members")
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

        project_ids = [p["id"] for p in projects]
        # meeting-in-week: an explicit ?meeting= query wins; otherwise default to
        # the meeting happening now / coming up soonest so the schedule advances
        # M1 -> M2 -> … through the week instead of always showing the first slot.
        if meeting_in_week is None:
            meeting_in_week = _current_meeting_in_week(client, project_ids, meetings_per_week)
        meeting_in_week = max(1, min(int(meeting_in_week), meetings_per_week))

        meta = {
            "class_id": cid,
            "week_number": week_number,
            "total_weeks": total_weeks,
            "week_of": _week_of_iso(class_row.get("start_date"), week_number),
            "meeting_in_week": meeting_in_week,
            "meetings_per_week": meetings_per_week,
            "meeting_duration_minutes": class_row.get("meeting_duration_minutes"),
            "total_meetings": total_weeks * meetings_per_week,
        }
        if not projects:
            return {**meta, "teams": []}

        members = (
            client.table("project_members").select("project_id, user_id")
            .in_("project_id", project_ids).execute()
        ).data or []
        member_count: dict[str, int] = {}
        for m in members:
            member_count[m["project_id"]] = member_count.get(m["project_id"], 0) + 1

        # Per-team meeting slot for this meeting-in-week (time/day/zoom live here).
        meeting_map = _meetings_for_projects(client, project_ids, meeting_in_week)
        meeting_ids = [m["id"] for m in meeting_map.values()]
        present_count: dict[str, int] = {}
        if meeting_ids:
            att = (
                client.table("attendance").select("project_id, status")
                .in_("meeting_id", meeting_ids).eq("week_number", week_number).execute()
            ).data or []
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
            m = meeting_map.get(p["id"]) or {}
            teams.append({
                "project_id": p["id"],
                "project_name": p.get("name"),
                "meeting_id": m.get("id"),
                "meeting_day": m.get("day_of_week"),
                "meeting_time": _format_time(m.get("start_time")),
                "zoom_url": m.get("zoom_url"),
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

def get_team_attendance(project_id: UUID, user_id: str, week_number: int, meeting_in_week: int = 1) -> dict:
    """Roster + statuses for a (project, week, meeting).

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
            return {"project_id": str(project_id), "week_number": week_number, "meeting_in_week": meeting_in_week, "entries": []}

        profiles = (
            client.table("profiles").select("id, email, first_name, last_name, image_url")
            .in_("id", member_ids).execute()
        ).data or []
        pmap = {p["id"]: p for p in profiles}

        mrow = _meetings_for_projects(client, [str(project_id)], int(meeting_in_week or 1)).get(str(project_id))
        status_map: dict = {}
        if mrow:
            att = (
                client.table("attendance").select("user_id, status")
                .eq("meeting_id", mrow["id"]).eq("week_number", week_number)
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
        return {"project_id": str(project_id), "week_number": week_number, "meeting_in_week": meeting_in_week, "entries": entries}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching team attendance | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch attendance")


def _upsert_one(client, meeting_id: str, project_id: str, person_id: str,
                week_number: int, status: str, marker_id: str) -> dict:
    """Select-then-update/insert one attendance row, keyed by (meeting, user, week)."""
    base = {"meeting_id": meeting_id, "project_id": project_id,
            "user_id": person_id, "week_number": week_number}
    existing = (
        client.table("attendance").select("id")
        .eq("meeting_id", meeting_id).eq("user_id", person_id).eq("week_number", week_number)
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
            .eq("meeting_id", meeting_id).eq("user_id", person_id).eq("week_number", week_number)
            .execute()
        )
        return res.data[0] if res.data else {**base, **payload}
    res = client.table("attendance").insert({**base, **payload}).execute()
    return res.data[0] if res.data else {**base, **payload}


def _validate_slot(client, class_id: str, week_number: int, meeting_in_week: int) -> None:
    cls = client.table("classes").select("term, meetings_per_week").eq("id", str(class_id)).execute()
    row = cls.data[0] if cls.data else {}
    if week_number < 1 or week_number > _meeting_weeks(row.get("term")):
        raise HTTPException(status_code=400, detail="week_number is outside the term")
    if meeting_in_week < 1 or meeting_in_week > int(row.get("meetings_per_week") or 1):
        raise HTTPException(status_code=400, detail="meeting_in_week is outside this class's weekly cadence")


def upsert_attendance(project_id: UUID, marker_id: str, person_id: str, week_number: int,
                      status: str, meeting_in_week: int = 1) -> dict:
    """Mark one member present/late/absent for a (project, week, meeting)."""
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, marker_id, project)
        _validate_slot(client, project["class_id"], week_number, meeting_in_week)

        member = (
            client.table("project_members").select("user_id")
            .eq("project_id", str(project_id)).eq("user_id", str(person_id)).execute()
        )
        if not member.data:
            raise HTTPException(status_code=400, detail="User is not a member of this team")

        meeting = _get_or_create_meeting(client, project["class_id"], str(project_id), int(meeting_in_week or 1), marker_id=marker_id)
        record = _upsert_one(client, meeting["id"], str(project_id), str(person_id), week_number, status, marker_id)
        logger.info(
            "Attendance marked | project_id=%s user_id=%s week=%s meeting=%s status=%s by=%s",
            project_id, person_id, week_number, meeting_in_week, status, marker_id,
        )
        return record
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error marking attendance | project_id=%s user_id=%s", project_id, person_id)
        raise HTTPException(status_code=500, detail="Failed to mark attendance")


def mark_all_present(project_id: UUID, marker_id: str, week_number: int, meeting_in_week: int = 1) -> list:
    """Mark every team member present for a (project, week, meeting)."""
    try:
        client = _client()
        project = _load_project(client, project_id)
        _require_meeting_editor(client, marker_id, project)
        _validate_slot(client, project["class_id"], week_number, meeting_in_week)

        members = (
            client.table("project_members").select("user_id")
            .eq("project_id", str(project_id)).execute()
        ).data or []
        meeting = _get_or_create_meeting(client, project["class_id"], str(project_id), int(meeting_in_week or 1), marker_id=marker_id)
        records = []
        for m in members:
            records.append(_upsert_one(client, meeting["id"], str(project_id), m["user_id"], week_number, "present", marker_id))
        logger.info("Marked all present | project_id=%s week=%s meeting=%s count=%d",
                    project_id, week_number, meeting_in_week, len(records))
        return records
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error marking all present | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to mark all present")
