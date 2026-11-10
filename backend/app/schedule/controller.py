"""The caller's schedule in one class, for a range of instants.

One read model over what the feature modules already store; nothing here is written, and nothing
is computed that those modules would disagree with:

* **TA meeting**: a team's weekly slot (``meetings`` with ``cadence = 'weekly'``, as every TA query
  filters; ``app/attendance`` owns them) expanded into dated occurrences in the school's zone, from
  the later of the class's ``start_date`` and the day the slot was created, through the term's
  last day. Past attendance uses ``app/attendance``'s term-week numbering.
* **Team meeting**: a team's one-off meeting (``kind = 'team_meeting'``, ``app/team_meetings``).
* **Final review**: ``projects.final_review_at`` (written only by the slot booking in
  ``app/tas/review_slots``), an hour long, with the Home TA and the Review TA.
* **Deadline**: a published assignment, one minute before its ``due_at`` (the last minute of the
  closing day, which the app shows as 11:59 PM).
* **Sprint edge**: an all-day rule on the day a sprint starts or ends, the team's own sprints for a
  student and the class's schedule (``app.scrum.schedule``) for staff.

What each lens gets:

============  ===============  ===========================  ===================
kind          student          ta                           instructor
============  ===============  ===========================  ===================
ta_meeting    their teams'     the teams they are assigned  none
meeting       their teams'     none                         none
final_review  their teams'     where Home TA or Review TA   every booked team
deadline      published        published                    published
sprint        their teams'     the class schedule           the class schedule
============  ===============  ===========================  ===================

Access: the class instructor or anyone enrolled; 404 for no such class, 403 otherwise. The lens is
the caller's role in the class.

Round trips: one wave reads the class, the caller's enrollment, the teams with their member ids,
the Review TAs, the published assignments and both kinds of meeting; a second reads the people
named on the items, the attendance for the TA-meeting occurrences, and a student's sprints. Two
waves, at most ten requests. The school's zone comes from the institutions list, which its
in-process cache usually answers without a query.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.assignments import deadlines
from app.attendance.controller import _current_term_week, _parse_date, _parse_time
from app.classes import terms
from app.core import authz
from app.core.db import fan_out, get_client
from app.institutions.controller import institution_timezone
from app.scrum import schedule as sprint_schedule
from app.tas.controller import REVIEW_TA_TABLE

LENS_STUDENT = "student"
LENS_TA = "ta"
LENS_INSTRUCTOR = "instructor"

#: How long a final review lasts: the slots are an hour.
FINAL_REVIEW_MINUTES = 60
#: The longest team meeting the database allows (meetings_team_meeting_shape).
_LONGEST_TEAM_MEETING = timedelta(minutes=240)

_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_WEEKDAY_SHORT = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")

_CLASS_COLUMNS = (
    "id, created_by, term, start_date, end_date, institution_id, meetings_per_week, "
    "meeting_duration_minutes, review_zoom_url, sprints_start_on, sprint_count, sprint_frequency"
)
_PROJECT_COLUMNS = "id, name, assigned_ta_id, final_review_at, project_members(user_id)"
_SLOT_COLUMNS = (
    "id, project_id, sequence, day_of_week, start_time, duration_minutes, zoom_url, location, "
    "created_at"
)
_TEAM_MEETING_COLUMNS = (
    "id, project_id, title, scheduled_at, duration_minutes, location, zoom_url, note, created_by"
)
_PROFILE_COLUMNS = "id, email, first_name, last_name, image_url"


# ------------------------------------------------------------------ calendar ----


def midnight(day: date, zone: ZoneInfo) -> datetime:
    """The first instant of ``day`` in ``zone``, in UTC."""
    return datetime(day.year, day.month, day.day, tzinfo=zone).astimezone(UTC)


def overlaps(start: datetime, end: datetime | None, lo: datetime, hi: datetime) -> bool:
    """Whether an item overlaps the range ``[lo, hi)``.

    A timed item does when it starts before ``hi`` and ends after ``lo``. A point in time (no
    end, or an end at its start) does when it falls inside the range.
    """
    if end is None or end <= start:
        return lo <= start < hi
    return start < hi and end > lo


def day_touches(day: date, zone: ZoneInfo, lo: datetime, hi: datetime) -> bool:
    """Whether ``day``, in the school's ``zone``, shares any instant with ``[lo, hi)``."""
    return overlaps(midnight(day, zone), midnight(day + timedelta(days=1), zone), lo, hi)


def deadline_instant(due_at: datetime) -> datetime:
    """Where a deadline lists: the last minute of its closing day, one minute before ``due_at``."""
    return due_at - timedelta(minutes=1)


def occurrence_bounds(class_row: dict, slot_created_at, zone: ZoneInfo) -> tuple[date, date] | None:
    """The first and last day a weekly slot meets, or ``None`` when it never does.

    From the later of the class's ``start_date`` and the day the slot was created (in the school's
    zone), so a slot set in week 4 has no earlier meetings, through the term's last day. A class
    with no ``start_date`` has no term weeks to key attendance to, so its slots never meet here.
    """
    start = _parse_date(class_row.get("start_date"))
    if start is None:
        return None
    last = terms.term_last_day(class_row.get("term"), start, _parse_date(class_row.get("end_date")))
    created = deadlines.parse_ts(slot_created_at) if slot_created_at else None
    first = max(start, created.astimezone(zone).date()) if created else start
    if last is None or first > last:
        return None
    return first, last


def weekly_occurrences(
    *,
    day_of_week: str | None,
    start_time: str | None,
    length_minutes: int,
    first_day: date,
    last_day: date,
    zone: ZoneInfo,
    lo: datetime,
    hi: datetime,
) -> list[tuple[date, datetime, datetime]]:
    """``(day, start, end)`` of each meeting of a weekly slot that overlaps ``[lo, hi)``.

    The slot meets on ``day_of_week`` at the wall-clock ``start_time`` in the school's ``zone``,
    every week from ``first_day`` through ``last_day``. A slot with no day or no time has none.
    """
    name = (day_of_week or "").strip().lower()
    weekday = _WEEKDAYS.index(name) if name in _WEEKDAYS else None
    clock = _parse_time(start_time)
    if weekday is None or clock is None:
        return []
    at = time.fromisoformat(clock)
    length = timedelta(minutes=max(int(length_minutes), 1))
    # Only the days the range can reach: a meeting that starts the day before `lo` may run into it.
    day = max(first_day, lo.astimezone(zone).date() - timedelta(days=1))
    stop = min(last_day, hi.astimezone(zone).date())
    out = []
    while day <= stop:
        if day.weekday() == weekday:
            start = datetime.combine(day, at, tzinfo=zone).astimezone(UTC)
            if overlaps(start, start + length, lo, hi):
                out.append((day, start, start + length))
        day += timedelta(days=1)
    return out


def class_sprint_edges(class_row: dict) -> list[tuple[str, str, date]]:
    """``(name, edge, day)`` for each start and end of the class's sprint schedule.

    The windows ``app.scrum.schedule.sprint_windows`` gives, named "Sprint N". None when the
    class has no sprint schedule (or one this code cannot read).
    """
    sched = sprint_schedule.Schedule.from_class(class_row)
    if sched is None:
        return []
    try:
        windows = sprint_schedule.sprint_windows(sched.start_on, sched.count, sched.frequency)
    except (ValueError, OverflowError):
        return []
    edges = []
    for k, (starts, ends) in enumerate(windows, start=1):
        name = sprint_schedule.SPRINT_NAME.format(k=k)
        edges += [(name, "start", starts), (name, "end", ends)]
    return edges


# -------------------------------------------------------------------- items ----


def _iso(instant: datetime) -> str:
    return instant.astimezone(UTC).isoformat()


def _person(profiles: dict[str, dict], user_id, viewer: str, **extra) -> dict | None:
    """A person as the items name them; ``None`` for no one, or for an account that is gone."""
    if not user_id:
        return None
    profile = profiles.get(str(user_id))
    if profile is None:
        return None
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    return {
        "id": str(user_id),
        "name": f"{first} {last}".strip() or profile.get("email") or "",
        "avatar_url": profile.get("image_url"),
        "you": str(user_id) == viewer,
        **extra,
    }


def _member_ids(project: dict) -> set[str]:
    return {str(m["user_id"]) for m in (project.get("project_members") or []) if m.get("user_id")}


def _sprint_item(item_id: str, name: str, edge: str, day: date, zone: ZoneInfo, **extra) -> dict:
    return {
        "id": item_id,
        "kind": "sprint",
        "title": name,
        "starts_at": _iso(midnight(day, zone)),
        "ends_at": None,
        "all_day": True,
        "sprint": {"name": name, "edge": edge},
        **extra,
    }


def _deadline_items(assignments: Iterable[dict], lo: datetime, hi: datetime) -> Iterator[dict]:
    for a in assignments:
        due_at = deadlines.parse_ts(a.get("due_at"))
        if due_at is None:
            continue
        at = deadline_instant(due_at)
        if not overlaps(at, None, lo, hi):
            continue
        yield {
            "id": f"deadline:{a['id']}",
            "kind": "deadline",
            "title": f"{(a.get('Title') or 'Assignment').strip()} due",
            "starts_at": _iso(at),
            "ends_at": None,
            "all_day": False,
            "assignment_id": str(a["id"]),
            "assignment_type": a.get("assignment_type"),
        }


# ----------------------------------------------------------------- endpoint ----


def _lens(class_row: dict, enrollment_role: str | None, user_id: str) -> str:
    if str(class_row.get("created_by")) == user_id:
        return LENS_INSTRUCTOR
    if enrollment_role is None:
        raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)
    return LENS_TA if enrollment_role == authz.ROLE_TA else LENS_STUDENT


def get_schedule(user_id: str, class_id, start: datetime, end: datetime) -> dict:
    """The caller's schedule items in one class that overlap ``[start, end)``.

    Who can call: the class instructor or anyone enrolled in the class.
    Returns: ``{"lens": "student" | "ta" | "instructor", "items": [...]}``, items in start order.
    Raises: 404 when the class does not exist; 403 when the caller is neither.
    """
    client = get_client()
    cid, uid = str(class_id), str(user_id)
    lo, hi = start.astimezone(UTC), end.astimezone(UTC)

    first = fan_out(
        {
            "class": lambda: authz.load_class(client, cid, _CLASS_COLUMNS),
            "enrollment_role": lambda: authz.get_enrollment_role(client, cid, uid),
            "projects": lambda: (
                (
                    client.table("projects").select(_PROJECT_COLUMNS).eq("class_id", cid).execute()
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
            "assignments": lambda: (
                (
                    client.table("assignments")
                    .select("id, Title, assignment_type, due_at")
                    .eq("class_id", cid)
                    .eq("status", "publish")
                    .execute()
                ).data
                or []
            ),
            # TA code reads weekly rows only: a team meeting is never one.
            "slots": lambda: (
                (
                    client.table("meetings")
                    .select(_SLOT_COLUMNS)
                    .eq("class_id", cid)
                    .eq("cadence", "weekly")
                    .execute()
                ).data
                or []
            ),
            "team_meetings": lambda: (
                (
                    client.table("meetings")
                    .select(_TEAM_MEETING_COLUMNS)
                    .eq("class_id", cid)
                    .eq("kind", "team_meeting")
                    .eq("cadence", "once")
                    .gte("scheduled_at", _iso(lo - _LONGEST_TEAM_MEETING))
                    .lt("scheduled_at", _iso(hi))
                    .execute()
                ).data
                or []
            ),
        }
    )
    class_row = first["class"]
    if class_row is None:
        raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
    lens = _lens(class_row, first["enrollment_role"], uid)
    zone = institution_timezone(class_row.get("institution_id"))

    projects = {str(p["id"]): p for p in first["projects"]}
    review_ta_of = {
        str(r["project_id"]): str(r["user_id"])
        for r in first["review_tas"]
        if r.get("project_id") and r.get("user_id")
    }
    if lens == LENS_STUDENT:
        mine = {pid for pid, p in projects.items() if uid in _member_ids(p)}
        meeting_teams, team_meeting_teams, review_teams = mine, mine, mine
    elif lens == LENS_TA:
        meeting_teams = {
            pid for pid, p in projects.items() if str(p.get("assigned_ta_id") or "") == uid
        }
        team_meeting_teams = set()
        review_teams = meeting_teams | {pid for pid, ta in review_ta_of.items() if ta == uid}
    else:
        meeting_teams, team_meeting_teams, review_teams = set(), set(), set(projects)

    # TA meetings: the slots of the lens's teams, expanded over the range.
    meetings_per_week = int(class_row.get("meetings_per_week") or 1)
    occurrences = []  # (slot, day, start, end, week)
    for slot in first["slots"]:
        if str(slot.get("project_id")) not in meeting_teams:
            continue
        if int(slot.get("sequence") or 1) > meetings_per_week:
            continue  # a slot left over from a busier cadence
        bounds = occurrence_bounds(class_row, slot.get("created_at"), zone)
        if bounds is None:
            continue
        length = class_row.get("meeting_duration_minutes") or slot.get("duration_minutes") or 30
        for day, s, e in weekly_occurrences(
            day_of_week=slot.get("day_of_week"),
            start_time=slot.get("start_time"),
            length_minutes=int(length),
            first_day=bounds[0],
            last_day=bounds[1],
            zone=zone,
            lo=lo,
            hi=hi,
        ):
            occurrences.append((slot, day, s, e, _current_term_week(class_row, day)))

    team_meetings = []
    for m in first["team_meetings"]:
        if str(m.get("project_id")) not in team_meeting_teams:
            continue
        s = deadlines.parse_ts(m.get("scheduled_at"))
        if s is None:
            continue
        e = s + timedelta(minutes=int(m.get("duration_minutes") or 30))
        if overlaps(s, e, lo, hi):
            team_meetings.append((m, s, e))

    reviews = []
    for pid in sorted(review_teams):
        s = deadlines.parse_ts(projects[pid].get("final_review_at")) if pid in projects else None
        if s is None:
            continue
        e = s + timedelta(minutes=FINAL_REVIEW_MINUTES)
        if overlaps(s, e, lo, hi):
            reviews.append((projects[pid], s, e))

    # Second wave: the people the items name, attendance, a student's own sprints.
    people = {projects[str(slot["project_id"])].get("assigned_ta_id") for slot, *_ in occurrences}
    people |= {m.get("created_by") for m, *_ in team_meetings}
    for p, *_ in reviews:
        people |= {p.get("assigned_ta_id"), review_ta_of.get(str(p["id"]))}
    people_ids = sorted({str(i) for i in people if i})
    slot_ids = sorted({str(slot["id"]) for slot, *_ in occurrences})
    weeks = sorted({week for *_, week in occurrences})
    lo_day, hi_day = lo.astimezone(zone).date(), hi.astimezone(zone).date()

    def attendance_rows() -> list[dict]:
        query = (
            client.table("attendance")
            .select("meeting_id, user_id, week_number, status")
            .in_("meeting_id", slot_ids)
            .in_("week_number", weeks)
        )
        if lens == LENS_STUDENT:
            query = query.eq("user_id", uid)
        return query.execute().data or []

    jobs = {}
    if people_ids:
        jobs["profiles"] = lambda: (
            (client.table("profiles").select(_PROFILE_COLUMNS).in_("id", people_ids).execute()).data
            or []
        )
    if slot_ids:
        jobs["attendance"] = attendance_rows
    if lens == LENS_STUDENT and meeting_teams:
        jobs["sprints"] = lambda: (
            (
                client.table("sprints")
                .select("id, project_id, name, starts_at, ends_at")
                .in_("project_id", sorted(meeting_teams))
                .lte("starts_at", (hi_day + timedelta(days=1)).isoformat())
                .gte("ends_at", (lo_day - timedelta(days=1)).isoformat())
                .execute()
            ).data
            or []
        )
    second = fan_out(jobs) if jobs else {}
    profiles = {str(p["id"]): p for p in second.get("profiles", [])}

    items: list[dict] = []

    # TA meetings, with the attendance recorded so far: the caller's own status for a student,
    # the team's present count for staff. The client shows it once the meeting is over.
    own_status: dict[tuple[str, int], str] = {}
    present: dict[tuple[str, int], int] = {}
    for a in second.get("attendance", []):
        key = (str(a.get("meeting_id")), int(a.get("week_number") or 0))
        if str(a.get("user_id")) == uid:
            own_status[key] = a.get("status")
        if a.get("status") == "present":
            present[key] = present.get(key, 0) + 1
    for slot, day, s, e, week in occurrences:
        project = projects[str(slot["project_id"])]
        sid = str(slot["id"])
        if lens == LENS_STUDENT:
            attendance = own_status.get((sid, week)) or "unmarked"
        else:
            total = len(_member_ids(project))
            attendance = {"present": present.get((sid, week), 0), "total": total}
        item = {
            "id": f"ta_meeting:{sid}:{day.isoformat()}",
            "kind": "ta_meeting",
            "title": "TA meeting",
            "starts_at": _iso(s),
            "ends_at": _iso(e),
            "all_day": False,
            "project_id": str(project["id"]),
            "team_name": project.get("name"),
            "location": slot.get("location"),
            "zoom_url": slot.get("zoom_url"),
            "host": _person(profiles, project.get("assigned_ta_id"), uid, role="TA"),
            "recurrence_label": f"Weekly · {_WEEKDAY_SHORT[day.weekday()]}",
            "attendance": attendance,
        }
        if meetings_per_week > 1:
            item["meeting_index"] = int(slot.get("sequence") or 1)
            item["meetings_per_week"] = meetings_per_week
        items.append(item)

    for m, s, e in team_meetings:
        project = projects.get(str(m["project_id"])) or {}
        items.append(
            {
                "id": f"meeting:{m['id']}",
                "kind": "meeting",
                "title": m.get("title") or "Team meeting",
                "starts_at": _iso(s),
                "ends_at": _iso(e),
                "all_day": False,
                "project_id": str(m["project_id"]),
                "team_name": project.get("name"),
                "location": m.get("location"),
                "zoom_url": m.get("zoom_url"),
                "host": _person(profiles, m.get("created_by"), uid, role="Organizer"),
                "note": m.get("note"),
                "scope": "team",
            }
        )

    for project, s, e in reviews:
        pid = str(project["id"])
        reviewers = [
            _person(profiles, project.get("assigned_ta_id"), uid, slot="home"),
            _person(profiles, review_ta_of.get(pid), uid, slot="review"),
        ]
        items.append(
            {
                "id": f"final_review:{pid}",
                "kind": "final_review",
                "title": "Final review",
                "starts_at": _iso(s),
                "ends_at": _iso(e),
                "all_day": False,
                "project_id": pid,
                "team_name": project.get("name"),
                "zoom_url": class_row.get("review_zoom_url"),
                "reviewers": [r for r in reviewers if r is not None],
            }
        )

    items.extend(_deadline_items(first["assignments"], lo, hi))

    if lens == LENS_STUDENT:
        seen = set()
        for sprint in second.get("sprints", []):
            for edge, column in (("start", "starts_at"), ("end", "ends_at")):
                day = _parse_date(sprint.get(column))
                key = (sprint.get("name"), edge, day)
                if day is None or key in seen or not day_touches(day, zone, lo, hi):
                    continue
                seen.add(key)
                items.append(
                    _sprint_item(
                        f"sprint:{sprint['id']}:{edge}",
                        sprint.get("name") or "Sprint",
                        edge,
                        day,
                        zone,
                        project_id=str(sprint["project_id"]),
                    )
                )
    else:
        for name, edge, day in class_sprint_edges(class_row):
            if day_touches(day, zone, lo, hi):
                items.append(_sprint_item(f"sprint:{cid}:{name}:{edge}", name, edge, day, zone))

    items.sort(key=lambda it: (deadlines.parse_ts(it["starts_at"]), it["kind"], it["id"]))
    return {"lens": lens, "items": items}
