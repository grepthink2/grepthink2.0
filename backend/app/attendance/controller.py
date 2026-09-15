"""
TA Management business logic.

Owns three related surfaces that share permission helpers:
  * per-class TA designation (``class_enrollments.enrollment_role`` — the single
    source of truth, shared with the tas module and TA Review)
  * per-project meeting TA (``projects.assigned_ta_id``) + weekly meeting slots
    (``meetings``: day/time/Zoom per team and sequence)
  * per-week attendance (``attendance``)

Note: ``projects.assigned_ta_id`` is the team's single operational TA — they run
the weekly meeting, take attendance, and review the team's TSRs (the tas module
reads this column for TA Review). The end-of-quarter "additional reviewer"
(``project_review_tas``, owned by the tas module) is a separate role.

Permission model (RLS is off; everything is enforced here):
  * Designate class TAs / assign a project TA  -> class instructor only.
  * Edit meeting/Zoom + mark attendance        -> class instructor OR the
    project's assigned TA.
  * Read the class schedule                     -> instructor OR any class TA.
  * Read own team schedule + own attendance     -> any project member.

Round trips: project-scoped operations load the project with its class embedded
(one read), so permission checks and slot validation never re-read ``classes``;
independent reads run concurrently through ``core.db.fan_out``; attendance marks
are written with ONE upsert on ``attendance_meeting_slot_uniq
(meeting_id, user_id, week_number)``.
"""

import datetime
import logging
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import HTTPException

# Reuse the term -> week-count convention used for TSR auto-creation so
# attendance weeks line up with the rest of the app.
from app.classes.controller import (
    _FULL_TERM_NAMES,
    _FULL_TSR_COUNT,
    _SUMMER_TSR_COUNT,
)
from app.core import authz
from app.core.db import fan_out, get_client
from app.core.errors import DatabaseConflictError

# Class-TA designation writes are shared with the tas module so both designation
# UIs (TA Management and TA Meetings) stay in lockstep.
from app.tas import controller as tas_controller

logger = logging.getLogger(__name__)

_VALID_STATUSES = ("present", "late", "absent")
_WEEKDAY_ORDER = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}
# UCSC class meeting times are Pacific. `tzdata` is a runtime dependency, so this
# resolves even on slim images that ship no system time-zone database.
_CLASS_TZ = ZoneInfo("America/Los_Angeles")

_PROJECT_COLUMNS = "id, class_id, name, assigned_ta_id, num_members"
_CLASS_COLUMNS = "id, created_by, term, start_date, meetings_per_week, meeting_duration_minutes"
_PROFILE_COLUMNS = "id, email, first_name, last_name, image_url"


# ---------------------------------------------------------------------------
# Week helpers (term -> number of weeks; start_date -> current/labelled week)
# ---------------------------------------------------------------------------


def _term_max_weeks(term: str | None) -> int:
    """TSR week count for a term (kept for parity with the TSR convention)."""
    return (
        _FULL_TSR_COUNT if (term or "").strip().lower() in _FULL_TERM_NAMES else _SUMMER_TSR_COUNT
    )


# TA meetings run across the working term, which is wider than the TSR window:
# ~10 weeks for a full quarter, ~6 for a summer session (e.g. CSE115A, late
# June -> end of July). Total TA meets = meeting_weeks * meetings_per_week.
_MEETING_WEEKS_FULL = 10
_MEETING_WEEKS_SUMMER = 6


def _meeting_weeks(term: str | None) -> int:
    """Number of TA-meeting weeks in a term."""
    return (
        _MEETING_WEEKS_FULL
        if (term or "").strip().lower() in _FULL_TERM_NAMES
        else _MEETING_WEEKS_SUMMER
    )


def _parse_date(value) -> datetime.date | None:
    if not value:
        return None
    if isinstance(value, datetime.date):
        return value
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _class_today(now: datetime.datetime | None = None) -> datetime.date:
    """Today's date where the class meets (Pacific), whatever the server's zone.

    A UTC host used to roll to "tomorrow" at 5 pm Pacific, shifting the current
    term week for the evening while the meeting picker still used Pacific time.
    """
    return (now or datetime.datetime.now(datetime.UTC)).astimezone(_CLASS_TZ).date()


def _current_term_week(start_date, term: str | None, today: datetime.date | None = None) -> int:
    """Week index (1..max) for ``today`` (default: the class's today), relative to the start date."""
    max_weeks = _meeting_weeks(term)
    start = _parse_date(start_date)
    if start is None:
        return 1
    delta_days = ((today or _class_today()) - start).days
    week = delta_days // 7 + 1
    return max(1, min(week, max_weeks))


def _week_of_iso(start_date, week_number: int) -> str | None:
    """ISO date of the first day of the given week, for display labelling."""
    start = _parse_date(start_date)
    if start is None:
        return None
    return (start + datetime.timedelta(weeks=week_number - 1)).isoformat()


# ---------------------------------------------------------------------------
# Loading + permission helpers
# ---------------------------------------------------------------------------


def _display_name(profile: dict | None) -> str | None:
    """'First Last', else the email, else None (this module's response contract)."""
    p = profile or {}
    return f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip() or p.get("email")


def _profiles_by_id(client, user_ids) -> dict[str, dict]:
    """``{user_id: profile}`` for the given ids — one round trip, none for no ids."""
    ids = sorted({str(u) for u in user_ids if u})
    if not ids:
        return {}
    rows = (client.table("profiles").select(_PROFILE_COLUMNS).in_("id", ids).execute()).data or []
    return {str(p["id"]): p for p in rows}


def is_class_ta(user_id: str, class_id: str) -> bool:
    """True iff the user is a class TA (class_enrollments.enrollment_role='ta')."""
    if not user_id or not class_id:
        return False
    return authz.get_enrollment_role(get_client(), class_id, str(user_id)) == authz.ROLE_TA


def _load_project(client, project_id) -> dict:
    """The project with its class embedded under ``classes`` (one round trip; 404 if missing)."""
    return authz.load_project(
        client, project_id, columns=_PROJECT_COLUMNS, class_columns=_CLASS_COLUMNS
    )


def _class_of(project: dict) -> dict:
    return project.get("classes") or {}


def _is_class_owner(user_id: str, project: dict) -> bool:
    return str(_class_of(project).get("created_by")) == str(user_id)


def _is_meeting_editor(user_id: str, project: dict) -> bool:
    """The class instructor or this project's assigned TA (no extra reads)."""
    if _is_class_owner(user_id, project):
        return True
    assigned = project.get("assigned_ta_id")
    return bool(assigned) and str(assigned) == str(user_id)


def _require_meeting_editor(user_id: str, project: dict) -> None:
    if not _is_meeting_editor(user_id, project):
        raise HTTPException(
            status_code=403,
            detail="Only the class instructor or this team's assigned TA can edit this team",
        )


def _require_project_class_instructor(user_id: str, project: dict) -> None:
    if not _is_class_owner(user_id, project):
        raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)


# ---------------------------------------------------------------------------
# Meetings (per-team scheduled slots; the foundation for ad-hoc + calendar)
# ---------------------------------------------------------------------------

_MEETING_COLS = (
    "id, class_id, project_id, sequence, day_of_week, start_time, "
    "zoom_url, duration_minutes, cadence, scheduled_at, title"
)


def _parse_time(value) -> str | None:
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


def _format_time(value) -> str | None:
    """'HH:MM:SS' -> '9:00 AM' for display."""
    if not value:
        return None
    try:
        t = value if isinstance(value, datetime.time) else datetime.time.fromisoformat(str(value))
    except ValueError:
        return str(value)
    return f"{(t.hour % 12) or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"


def _weekly_meetings(client, project_ids) -> list[dict]:
    """Every weekly meeting slot (all sequences) for these projects — one round trip."""
    if not project_ids:
        return []
    return (
        client.table("meetings")
        .select(_MEETING_COLS)
        .in_("project_id", [str(p) for p in project_ids])
        .eq("cadence", "weekly")
        .execute()
    ).data or []


def _meetings_for_projects(client, project_ids: list, sequence: int) -> dict:
    """project_id -> the team's weekly meeting row for this sequence (1,2,…)."""
    if not project_ids:
        return {}
    rows = (
        client.table("meetings")
        .select(_MEETING_COLS)
        .in_("project_id", project_ids)
        .eq("cadence", "weekly")
        .eq("sequence", sequence)
        .execute()
    ).data or []
    return {r["project_id"]: r for r in rows}


def _get_or_create_meeting(
    client,
    class_id: str,
    project_id: str,
    sequence: int,
    duration_default: int = 30,
    marker_id: str | None = None,
) -> dict:
    """The team's weekly meeting slot for `sequence`, creating an empty one
    (no day/time yet) when missing so attendance can reference it."""

    def existing() -> list[dict]:
        return (
            client.table("meetings")
            .select(_MEETING_COLS)
            .eq("project_id", str(project_id))
            .eq("cadence", "weekly")
            .eq("sequence", sequence)
            .limit(1)
            .execute()
        ).data or []

    found = existing()
    if found:
        return found[0]
    row = {
        "class_id": str(class_id),
        "project_id": str(project_id),
        "cadence": "weekly",
        "sequence": int(sequence),
        "duration_minutes": int(duration_default or 30),
    }
    if marker_id:
        row["created_by"] = marker_id
    try:
        res = client.table("meetings").insert(row).execute()
    except DatabaseConflictError:
        # Another request created the same slot first (meetings_project_seq_uniq).
        found = existing()
        if found:
            return found[0]
        raise
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create the meeting slot")
    return res.data[0]


# ---------------------------------------------------------------------------
# Class TA designation
# ---------------------------------------------------------------------------


def set_class_ta(class_id: UUID, instructor_id: str, target_user_id: str, is_ta: bool) -> dict:
    """Designate or undesignate an enrolled student as a class TA.

    Class-TA status is stored in ``class_enrollments.enrollment_role`` — the
    single source of truth shared with the tas module and TA Review. The write is
    delegated to the tas controller so both designation UIs (TA Management and TA
    Meetings) stay in lockstep. On undesignate, ``demote_ta`` also clears the
    user's assigned-TA ownership (``projects.assigned_ta_id`` — meeting + TSR
    review) and any end-of-quarter review claims they hold.
    """
    cid, tid = str(class_id), str(target_user_id)
    if is_ta:
        tas_controller.promote_to_ta(instructor_id, class_id, target_user_id)
        logger.info("Class TA designated | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
        return {"message": "TA designated", "user_id": tid, "is_ta": True}

    tas_controller.demote_ta(instructor_id, class_id, target_user_id)
    logger.info("Class TA removed | class_id=%s user_id=%s by=%s", cid, tid, instructor_id)
    return {"message": "TA removed", "user_id": tid, "is_ta": False}


def list_class_tas(class_id: UUID, user_id: str) -> list:
    """Enrolled students of the class, each flagged with whether they are a TA.

    Readable by the class instructor or any enrolled member (so the UI can show
    TA badges); the designate-toggle UI is gated separately on the write path.
    The class row and the enrollment list are read concurrently, and access is
    decided from them (the caller's own enrollment is in the list), then one
    profile read: 3 round trips in 2 waves (was 4 sequential).
    """
    try:
        client = get_client()
        cid, uid = str(class_id), str(user_id)
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "enrollments": lambda: (
                    (
                        client.table("class_enrollments")
                        .select("user_id, enrollment_role")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        cls, enroll_rows = reads["class"], reads["enrollments"]
        if cls is None:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
        is_instr = str(cls.get("created_by")) == uid
        if not is_instr and not any(str(r.get("user_id")) == uid for r in enroll_rows):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)

        student_ids = [str(r["user_id"]) for r in enroll_rows if r.get("user_id")]
        if not student_ids:
            return []
        # is_ta derives from the single source of truth (enrollment_role).
        ta_ids = {
            str(r["user_id"]) for r in enroll_rows if r.get("enrollment_role") == authz.ROLE_TA
        }
        profiles = _profiles_by_id(client, student_ids)

        out = []
        for sid in student_ids:
            p = profiles.get(sid) or {}
            out.append(
                {
                    "user_id": sid,
                    "name": _display_name(p),
                    "email": p.get("email"),
                    "image_url": p.get("image_url"),
                    "is_ta": sid in ta_ids,
                }
            )
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


def assign_project_ta(project_id: UUID, instructor_id: str, ta_user_id: str | None) -> dict:
    """Assign a designated class TA to a project, or clear with ta_user_id=None."""
    try:
        client = get_client()
        project = _load_project(client, project_id)
        _require_project_class_instructor(instructor_id, project)

        if ta_user_id is None:
            client.table("projects").update({"assigned_ta_id": None}).eq(
                "id", str(project_id)
            ).execute()
            return {
                "message": "TA unassigned",
                "project_id": str(project_id),
                "assigned_ta_id": None,
            }

        if authz.get_enrollment_role(client, project["class_id"], str(ta_user_id)) != authz.ROLE_TA:
            raise HTTPException(
                status_code=400, detail="Assigned TA must be a designated TA of this class"
            )

        client.table("projects").update({"assigned_ta_id": str(ta_user_id)}).eq(
            "id", str(project_id)
        ).execute()
        logger.info("Project TA assigned | project_id=%s ta=%s", project_id, ta_user_id)
        return {
            "message": "TA assigned",
            "project_id": str(project_id),
            "assigned_ta_id": str(ta_user_id),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error assigning project TA | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to assign project TA")


def upsert_meeting(
    project_id: UUID,
    user_id: str,
    meeting_in_week: int = 1,
    zoom_url: str | None = None,
    meeting_day: str | None = None,
    meeting_time: str | None = None,
) -> dict:
    """Set a team's weekly meeting slot (day/time/Zoom) for the given
    meeting-in-week (instructor or assigned TA). Creates the slot if needed.
    Returns the slot in schedule shape (meeting_day/meeting_time strings)."""
    if zoom_url is None and meeting_day is None and meeting_time is None:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    if (
        meeting_day is not None
        and meeting_day != ""
        and meeting_day.strip().lower() not in _WEEKDAY_ORDER
    ):
        raise HTTPException(status_code=400, detail="meeting_day must be a weekday name")
    seq = int(meeting_in_week or 1)
    try:
        client = get_client()
        project = _load_project(client, project_id)
        _require_meeting_editor(user_id, project)

        updates: dict = {"updated_at": datetime.datetime.now(datetime.UTC).isoformat()}
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
                    raise HTTPException(
                        status_code=400, detail="Could not parse meeting time (try e.g. '9:00 AM')"
                    )
                updates["start_time"] = parsed

        meeting = _get_or_create_meeting(
            client, project["class_id"], str(project_id), seq, marker_id=user_id
        )
        res = client.table("meetings").update(updates).eq("id", meeting["id"]).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update meeting")
        row = res.data[0]
        logger.info(
            "Meeting slot updated | project_id=%s seq=%s fields=%s",
            project_id,
            seq,
            [k for k in updates if k != "updated_at"],
        )
        return {
            "project_id": str(project_id),
            "meeting_in_week": seq,
            "meeting_id": row["id"],
            "meeting_day": row.get("day_of_week"),
            "meeting_time": _format_time(row.get("start_time")),
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


def set_meeting_cadence(
    class_id: UUID,
    instructor_id: str,
    meetings_per_week: int | None = None,
    meeting_duration_minutes: int | None = None,
) -> dict:
    """Set a class's TA-meeting frequency + per-meeting duration (instructor only)."""
    if meetings_per_week is None and meeting_duration_minutes is None:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    try:
        client = get_client()
        authz.require_class_instructor(client, instructor_id, class_id)
        updates: dict = {}
        if meetings_per_week is not None:
            if not (1 <= int(meetings_per_week) <= 7):
                raise HTTPException(
                    status_code=400, detail="meetings_per_week must be between 1 and 7"
                )
            updates["meetings_per_week"] = int(meetings_per_week)
        if meeting_duration_minutes is not None:
            if int(meeting_duration_minutes) < 1:
                raise HTTPException(
                    status_code=400, detail="meeting_duration_minutes must be positive"
                )
            updates["meeting_duration_minutes"] = int(meeting_duration_minutes)
        res = client.table("classes").update(updates).eq("id", str(class_id)).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update meeting cadence")
        logger.info(
            "Meeting cadence updated | class_id=%s fields=%s by=%s",
            class_id,
            list(updates.keys()),
            instructor_id,
        )
        return res.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error updating meeting cadence | class_id=%s", class_id)
        raise HTTPException(status_code=500, detail="Failed to update meeting cadence")


# ---------------------------------------------------------------------------
# Schedule aggregation
# ---------------------------------------------------------------------------


def _pick_current_meeting(rows: list[dict], meetings_per_week: int, now=None) -> int:
    """Sequence (1..N) of the weekly meeting happening now or coming up soonest
    among these slot rows, so the schedule advances M1 -> M2 -> … through the week
    instead of always showing the first slot. Falls back to meeting 1."""
    if meetings_per_week <= 1 or not rows:
        return 1
    if now is None:
        now = datetime.datetime.now(_CLASS_TZ)
    best_seq, best_delta = None, None
    for r in rows:
        dow = _WEEKDAY_ORDER.get((r.get("day_of_week") or "").lower())
        parsed = _parse_time(r.get("start_time"))
        if dow is None or not parsed:
            continue
        hh, mm, _ss = (int(x) for x in parsed.split(":"))
        days_ahead = (dow - now.weekday()) % 7
        start = (now + datetime.timedelta(days=days_ahead)).replace(
            hour=hh, minute=mm, second=0, microsecond=0
        )
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


def _current_meeting_in_week(client, project_ids, meetings_per_week, now=None) -> int:
    """:func:`_pick_current_meeting` over the teams' weekly slots (reads them first).

    ``now`` is injectable for tests; it defaults to the current Pacific time.
    """
    if meetings_per_week <= 1 or not project_ids:
        return 1
    return _pick_current_meeting(_weekly_meetings(client, project_ids), meetings_per_week, now)


def get_ta_schedule(
    class_id: UUID,
    user_id: str,
    week_number: int | None = None,
    scope: str = "all",
    meeting_in_week: int | None = None,
) -> dict:
    """Weekly meeting schedule for a class.

    scope:
      * ``all``     — every team (instructor or any class TA)
      * ``mine``    — teams assigned to the caller (TA)
      * ``my-team`` — the caller's own team(s) (student/member)

    Each team carries ``viewer_status``: the caller's own attendance status for
    the selected meeting ('present' / 'late' / 'absent' / 'unmarked'), or None
    when the caller is not on that team — so the student view needs no
    per-team attendance requests.

    Round trips: wave 1 reads the class, the caller's enrollment and the class's
    projects with their member ids embedded; wave 2 the weekly meeting slots
    (reused for the current-meeting pick) and the assigned TAs' profiles; then
    one attendance read. At most 6 queries in 3 waves (was 9-11 sequential).
    """
    try:
        client = get_client()
        cid, uid = str(class_id), str(user_id)

        first = fan_out(
            {
                "class": lambda: authz.load_class(client, cid, _CLASS_COLUMNS),
                "enrollment_role": lambda: authz.get_enrollment_role(client, cid, uid),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select("id, name, assigned_ta_id, num_members, project_members(user_id)")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        class_row = first["class"]
        if not class_row:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)

        is_instr = str(class_row.get("created_by")) == uid
        enrollment_role = first["enrollment_role"]
        if scope in ("all", "mine"):
            if not (is_instr or enrollment_role == authz.ROLE_TA):
                raise HTTPException(
                    status_code=403,
                    detail="Only the instructor or a class TA can view this schedule",
                )
        elif scope == "my-team":
            if not (is_instr or enrollment_role is not None):
                raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)
        else:
            raise HTTPException(status_code=400, detail="Invalid scope")

        total_weeks = _meeting_weeks(class_row.get("term"))
        meetings_per_week = int(class_row.get("meetings_per_week") or 1)
        if week_number is None:
            week_number = _current_term_week(class_row.get("start_date"), class_row.get("term"))
        week_number = max(1, min(int(week_number), total_weeks))

        def member_ids(project: dict) -> set[str]:
            return {str(m["user_id"]) for m in (project.get("project_members") or [])}

        projects = first["projects"]
        if scope == "mine":
            projects = [
                p for p in projects if p.get("assigned_ta_id") and str(p["assigned_ta_id"]) == uid
            ]
        elif scope == "my-team":
            projects = [p for p in projects if uid in member_ids(p)]
        project_ids = [p["id"] for p in projects]

        def meta(meeting_seq: int) -> dict:
            return {
                "class_id": cid,
                "week_number": week_number,
                "total_weeks": total_weeks,
                "week_of": _week_of_iso(class_row.get("start_date"), week_number),
                "meeting_in_week": meeting_seq,
                "meetings_per_week": meetings_per_week,
                "meeting_duration_minutes": class_row.get("meeting_duration_minutes"),
                "total_meetings": total_weeks * meetings_per_week,
            }

        if not projects:
            seq = 1 if meeting_in_week is None else meeting_in_week
            return {**meta(max(1, min(int(seq), meetings_per_week))), "teams": []}

        ta_ids = [p["assigned_ta_id"] for p in projects if p.get("assigned_ta_id")]
        second = fan_out(
            {
                "meetings": lambda: _weekly_meetings(client, project_ids),
                "tas": lambda: _profiles_by_id(client, ta_ids),
            }
        )
        weekly = second["meetings"]
        # meeting-in-week: an explicit ?meeting= query wins; otherwise default to
        # the meeting happening now / coming up soonest.
        if meeting_in_week is None:
            meeting_in_week = _pick_current_meeting(weekly, meetings_per_week)
        meeting_in_week = max(1, min(int(meeting_in_week), meetings_per_week))
        meeting_map = {
            m["project_id"]: m for m in weekly if int(m.get("sequence") or 1) == meeting_in_week
        }

        meeting_ids = [m["id"] for m in meeting_map.values()]
        marks = []
        if meeting_ids:
            marks = (
                client.table("attendance")
                .select("project_id, user_id, status")
                .in_("meeting_id", meeting_ids)
                .eq("week_number", week_number)
                .execute()
            ).data or []
        present_count: dict[str, int] = {}
        own_status: dict[str, str] = {}
        for a in marks:
            pid = a.get("project_id")
            if a.get("status") == "present":
                present_count[pid] = present_count.get(pid, 0) + 1
            if str(a.get("user_id")) == uid:
                own_status[pid] = a.get("status")

        ta_map = second["tas"]
        teams = []
        for p in projects:
            ta = ta_map.get(str(p["assigned_ta_id"])) if p.get("assigned_ta_id") else None
            members = member_ids(p)
            m = meeting_map.get(p["id"]) or {}
            teams.append(
                {
                    "project_id": p["id"],
                    "project_name": p.get("name"),
                    "meeting_id": m.get("id"),
                    "meeting_day": m.get("day_of_week"),
                    "meeting_time": _format_time(m.get("start_time")),
                    "zoom_url": m.get("zoom_url"),
                    "assigned_ta": {
                        "id": ta["id"],
                        "name": _display_name(ta),
                        "email": ta.get("email"),
                        "image_url": ta.get("image_url"),
                    }
                    if ta
                    else None,
                    "attendance_present": present_count.get(p["id"], 0),
                    "attendance_total": len(members),
                    "viewer_status": (own_status.get(p["id"]) or "unmarked")
                    if uid in members
                    else None,
                }
            )

        teams.sort(
            key=lambda t: (
                _WEEKDAY_ORDER.get((t["meeting_day"] or "").lower(), 99),
                (t["project_name"] or "").lower(),
            )
        )
        return {**meta(meeting_in_week), "teams": teams}
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error building TA schedule | class_id=%s scope=%s", class_id, scope)
        raise HTTPException(status_code=500, detail="Failed to load schedule")


# ---------------------------------------------------------------------------
# Attendance read + write
# ---------------------------------------------------------------------------


def get_team_attendance(
    project_id: UUID, user_id: str, week_number: int, meeting_in_week: int = 1
) -> dict:
    """Roster + statuses for a (project, week, meeting).

    Instructor / assigned TA see every member; a plain member sees only their
    own row. At most 5 queries in 3 waves (was 6 sequential).
    """
    try:
        client = get_client()
        pid, uid = str(project_id), str(user_id)
        seq = int(meeting_in_week or 1)
        project = _load_project(client, pid)
        is_editor = _is_meeting_editor(uid, project)

        reads = fan_out(
            {
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
                "meeting": lambda: _meetings_for_projects(client, [pid], seq).get(pid),
            }
        )
        member_ids = reads["members"]
        if not is_editor:
            if uid not in member_ids:
                raise HTTPException(status_code=403, detail=authz.NOT_PROJECT_MEMBER)
            member_ids = [uid]

        if not member_ids:
            return {
                "project_id": pid,
                "week_number": week_number,
                "meeting_in_week": meeting_in_week,
                "entries": [],
            }

        meeting = reads["meeting"]

        def statuses() -> dict[str, str]:
            if not meeting:
                return {}
            rows = (
                client.table("attendance")
                .select("user_id, status")
                .eq("meeting_id", meeting["id"])
                .eq("week_number", week_number)
                .in_("user_id", member_ids)
                .execute()
            ).data or []
            return {str(a["user_id"]): a["status"] for a in rows}

        details = fan_out(
            {"profiles": lambda: _profiles_by_id(client, member_ids), "statuses": statuses}
        )
        profiles, status_map = details["profiles"], details["statuses"]

        entries = []
        for member in member_ids:
            p = profiles.get(member) or {}
            entries.append(
                {
                    "person_id": member,
                    "name": _display_name(p),
                    "email": p.get("email"),
                    "image_url": p.get("image_url"),
                    "status": status_map.get(member, "unmarked"),
                }
            )
        entries.sort(key=lambda e: (e["name"] or "").lower())
        return {
            "project_id": pid,
            "week_number": week_number,
            "meeting_in_week": meeting_in_week,
            "entries": entries,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error fetching team attendance | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to fetch attendance")


def _validate_slot(cls: dict, week_number: int, meeting_in_week: int) -> None:
    """Reject a week outside the term or a meeting outside the weekly cadence."""
    if week_number < 1 or week_number > _meeting_weeks(cls.get("term")):
        raise HTTPException(status_code=400, detail="week_number is outside the term")
    if meeting_in_week < 1 or meeting_in_week > int(cls.get("meetings_per_week") or 1):
        raise HTTPException(
            status_code=400, detail="meeting_in_week is outside this class's weekly cadence"
        )


def _write_marks(
    client,
    meeting_id: str,
    project_id: str,
    person_ids: list[str],
    status: str,
    week_number: int,
    marker_id: str,
) -> list[dict]:
    """Write one attendance mark per person in ONE statement.

    Keyed by ``attendance_meeting_slot_uniq (meeting_id, user_id, week_number)``:
    an existing mark for the slot is updated in place, a missing one inserted.
    """
    if not person_ids:
        return []
    marked_at = datetime.datetime.now(datetime.UTC).isoformat()
    rows = [
        {
            "meeting_id": meeting_id,
            "project_id": project_id,
            "user_id": person_id,
            "week_number": week_number,
            "status": status,
            "marked_by": marker_id,
            "marked_at": marked_at,
        }
        for person_id in person_ids
    ]
    res = (
        client.table("attendance")
        .upsert(rows, on_conflict="meeting_id,user_id,week_number")
        .execute()
    )
    return res.data or []


def upsert_attendance(
    project_id: UUID,
    marker_id: str,
    person_id: str,
    week_number: int,
    status: str,
    meeting_in_week: int = 1,
) -> dict:
    """Mark one member present/late/absent for a (project, week, meeting).

    Everything is validated before the first write (no meeting slot is created
    for a request that will be rejected). 4-5 round trips (was 7-8).
    """
    if status not in _VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    try:
        client = get_client()
        pid = str(project_id)
        project = _load_project(client, pid)
        _require_meeting_editor(marker_id, project)
        _validate_slot(_class_of(project), week_number, meeting_in_week)

        member = (
            client.table("project_members")
            .select("user_id")
            .eq("project_id", pid)
            .eq("user_id", str(person_id))
            .limit(1)
            .execute()
        )
        if not member.data:
            raise HTTPException(status_code=400, detail="User is not a member of this team")

        meeting = _get_or_create_meeting(
            client, project["class_id"], pid, int(meeting_in_week or 1), marker_id=marker_id
        )
        records = _write_marks(
            client, meeting["id"], pid, [str(person_id)], status, week_number, marker_id
        )
        if not records:
            raise HTTPException(status_code=500, detail="Failed to mark attendance")
        logger.info(
            "Attendance marked | project_id=%s user_id=%s week=%s meeting=%s status=%s by=%s",
            project_id,
            person_id,
            week_number,
            meeting_in_week,
            status,
            marker_id,
        )
        return records[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error marking attendance | project_id=%s user_id=%s", project_id, person_id
        )
        raise HTTPException(status_code=500, detail="Failed to mark attendance")


def mark_all_present(
    project_id: UUID, marker_id: str, week_number: int, meeting_in_week: int = 1
) -> list:
    """Mark every team member present for a (project, week, meeting).

    One bulk upsert for the whole team: 4-5 round trips regardless of team size
    (was 5 + 2 per member, and a failure part-way left a partially marked team).
    """
    try:
        client = get_client()
        pid = str(project_id)
        project = _load_project(client, pid)
        _require_meeting_editor(marker_id, project)
        _validate_slot(_class_of(project), week_number, meeting_in_week)

        members = [
            str(m["user_id"])
            for m in (
                client.table("project_members").select("user_id").eq("project_id", pid).execute()
            ).data
            or []
            if m.get("user_id")
        ]
        meeting = _get_or_create_meeting(
            client, project["class_id"], pid, int(meeting_in_week or 1), marker_id=marker_id
        )
        records = _write_marks(
            client, meeting["id"], pid, members, "present", week_number, marker_id
        )
        logger.info(
            "Marked all present | project_id=%s week=%s meeting=%s count=%d",
            project_id,
            week_number,
            meeting_in_week,
            len(records),
        )
        return records
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error marking all present | project_id=%s", project_id)
        raise HTTPException(status_code=500, detail="Failed to mark all present")
