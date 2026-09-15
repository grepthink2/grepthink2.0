"""
Staffing / Interest-Form business logic.

This module is the canonical implementation of the workflow described in
backend/cse115b Project staffing.xlsx:

    1. Students submit an interest form per class:
         * up to 5 ranked projects with a free-form reason for each
         * general background fields (CS 115C, previous project, notes)
         * optional work-with / don't-work-with peer lists
       (see ``submit_interest`` and ``submit_form``).

    2. Instructors browse the resulting preferences in a few canonical
       views: by student, by project, project rank with breadth/depth/
       strength scores, project availability, and the all-students
       assignments grid.

    3. Instructors staff students onto projects either manually
       (``assign_user`` / ``unassign_user``) or via the auto-assign
       greedy heuristic (``auto_assign``).

Project assignments themselves live in ``project_members`` so the rest of
the system (TSRs, project pages, etc.) keeps working unchanged. Membership
rows are written directly here in bulk and ``projects.num_members`` is
rewritten from the member rows via ``app.projects.controller.set_num_members``
— the same helper every other membership write uses.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from app.core import authz
from app.core.db import get_client
from app.database.client import query_pool
from app.projects.controller import ROLE_MEMBER, ROLE_SCRUM_MASTER, set_num_members
from app.staffing.models import RankedProject

logger = logging.getLogger(__name__)


# Interest value bounds matching the spreadsheet (5 = top, 1 = lowest ranked).
MIN_INTEREST_VALUE = 1
MAX_INTEREST_VALUE = 5


# --------------------------------------------------------------------------- helpers


def _require_class_instructor(user_id: str, class_id: UUID) -> None:
    """Raise 404 if the class does not exist and 403 if the caller is not its instructor."""
    authz.require_class_instructor(get_client(), user_id, class_id)


def _require_class_member(user_id: str, class_id: UUID) -> None:
    """
    Raise 404 if the class does not exist and 403 if the caller is neither
    enrolled in it nor its instructor.

    Used for student-facing routes (submitting interest, viewing own form).
    """
    client = get_client()
    enrollment = (
        client.table("class_enrollments")
        .select("id")
        .eq("class_id", str(class_id))
        .eq("user_id", user_id)
        .execute()
    )
    if enrollment.data:
        return

    cls = authz.load_class(client, class_id)
    if cls is None:
        raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
    if str(cls.get("created_by")) != str(user_id):
        raise HTTPException(status_code=403, detail=authz.NOT_CLASS_MEMBER)


def _project_in_class(client, project_id: UUID, class_id: UUID) -> dict:
    """Return the project row, or raise 404 if missing / class mismatch."""
    res = (
        client.table("projects")
        .select("id, class_id, name, team_size, num_members")
        .eq("id", str(project_id))
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail=authz.PROJECT_NOT_FOUND)
    project = res.data[0]
    if str(project.get("class_id")) != str(class_id):
        raise HTTPException(
            status_code=400,
            detail="Project does not belong to the specified class",
        )
    return project


def _list_class_projects(client, class_id: UUID) -> list[dict]:
    """All projects for a class with the staffing-relevant columns."""
    res = (
        client.table("projects")
        .select("id, name, team_size, num_members, class_id")
        .eq("class_id", str(class_id))
        .execute()
    )
    return res.data or []


def _list_class_students(client, class_id: UUID) -> list[dict]:
    """Enrolled students for a class, with profile fields hydrated.

    TAs (``enrollment_role == 'ta'``) are intentionally excluded: they are
    overseers, not assignable team members, so they must never appear in the
    staffing/assignment pools or the assigned/unassigned counts.
    """
    enroll = (
        client.table("class_enrollments")
        .select("user_id, enrollment_role")
        .eq("class_id", str(class_id))
        .execute()
    )
    student_ids = [
        str(r["user_id"])
        for r in (enroll.data or [])
        if r.get("user_id") and (r.get("enrollment_role") or "student") != "ta"
    ]
    if not student_ids:
        return []
    profiles = (
        client.table("profiles")
        .select("id, email, first_name, last_name, role")
        .in_("id", student_ids)
        .execute()
    )
    return profiles.data or []


def _list_class_interest_rows(client, class_id: UUID) -> list[dict]:
    """All raw interest_form rows scoped to a class."""
    res = (
        client.table("interest_form")
        .select("id, user_id, class_id, project_id, interest_value, interest_reason, updated_at")
        .eq("class_id", str(class_id))
        .execute()
    )
    return res.data or []


def _project_members_for_class(
    client,
    class_id: UUID,
    *,
    projects: list[dict] | None = None,
) -> list[dict]:
    """
    Return all project_members rows whose project belongs to the given class.

    Pass ``projects`` from a prior ``_list_class_projects`` call to avoid a
    second identical projects query (several instructor endpoints were
    fetching the class project list twice per request).

    Done as two queries (projects → members) unless ``projects`` is preset;
    the in-memory test client does not rely on PostgREST embeds.
    """
    if projects is None:
        projects = _list_class_projects(client, class_id)
    if not projects:
        return []
    pids = [str(p["id"]) for p in projects]
    res = (
        client.table("project_members")
        .select("id, project_id, user_id, role")
        .in_("project_id", pids)
        .execute()
    )
    return res.data or []


def _class_projects_and_members(client, class_id: UUID) -> tuple[list[dict], list[dict]]:
    """The class's projects and every membership row on them — two round trips."""
    projects = _list_class_projects(client, class_id)
    members = _project_members_for_class(client, class_id, projects=projects)
    return projects, members


def _projects_of(members: list[dict], user_id: str) -> list[str]:
    """Sorted project ids (from ``members``) that ``user_id`` belongs to."""
    return sorted({str(m["project_id"]) for m in members if str(m.get("user_id")) == str(user_id)})


def _team_role_for_newcomer(team: list[dict]) -> str:
    """Scrum master when the team has none yet (first-member rule), else member."""
    return (
        ROLE_MEMBER if any(m.get("role") == ROLE_SCRUM_MASTER for m in team) else ROLE_SCRUM_MASTER
    )


def _profile_display_name(profile: dict | None) -> str | None:
    """Pick the most human-friendly display label for a profile row."""
    if not profile:
        return None
    first = (profile.get("first_name") or "").strip()
    last = (profile.get("last_name") or "").strip()
    full = f"{first} {last}".strip()
    return full or profile.get("name") or profile.get("email")


def _name_lookup(client, user_ids: Iterable[str]) -> dict[str, dict]:
    """Bulk-load profile rows for a set of user ids."""
    ids = list({str(u) for u in user_ids if u})
    if not ids:
        return {}
    res = (
        client.table("profiles").select("id, email, first_name, last_name").in_("id", ids).execute()
    )
    return {str(p["id"]): p for p in (res.data or [])}


def _project_lookup(client, project_ids: Iterable[str]) -> dict[str, dict]:
    """Bulk-load project rows for a set of project ids."""
    ids = list({str(p) for p in project_ids if p})
    if not ids:
        return {}
    res = (
        client.table("projects")
        .select("id, name, team_size, num_members, class_id")
        .in_("id", ids)
        .execute()
    )
    return {str(p["id"]): p for p in (res.data or [])}


# --------------------------------------------------------------------------- writes (student)


def submit_interest(
    user_id: str,
    class_id: UUID,
    project_id: UUID,
    interest_value: int,
    interest_reason: str | None = None,
) -> dict:
    """
    Upsert a single ranked preference for the current user.

    Validates:
      * ``interest_value`` is between 1 and 5 inclusive.
      * The project belongs to the given class.
      * The user is enrolled in the class (or is the class instructor).

    Returns the inserted / updated row.

    Raises:
        HTTPException 400 — invalid value or project / class mismatch.
        HTTPException 403 — caller is neither enrolled nor the class instructor.
        HTTPException 404 — class or project not found.
    """
    if not (MIN_INTEREST_VALUE <= int(interest_value) <= MAX_INTEREST_VALUE):
        raise HTTPException(
            status_code=400,
            detail=(
                f"interest_value must be between {MIN_INTEREST_VALUE} and {MAX_INTEREST_VALUE}"
            ),
        )

    _require_class_member(user_id, class_id)

    client = get_client()
    _project_in_class(client, project_id, class_id)

    existing = (
        client.table("interest_form")
        .select("id")
        .eq("user_id", user_id)
        .eq("class_id", str(class_id))
        .eq("project_id", str(project_id))
        .execute()
    )
    payload = {
        "user_id": user_id,
        "class_id": str(class_id),
        "project_id": str(project_id),
        "interest_value": int(interest_value),
        "interest_reason": interest_reason,
    }

    try:
        if existing.data:
            row_id = existing.data[0]["id"]
            updated = client.table("interest_form").update(payload).eq("id", row_id).execute()
            row = (updated.data or [{}])[0]
        else:
            inserted = client.table("interest_form").insert(payload).execute()
            if not inserted.data:
                raise HTTPException(status_code=500, detail="Failed to record interest")
            row = inserted.data[0]
        logger.info(
            "submit_interest | user=%s class=%s project=%s value=%s",
            user_id,
            class_id,
            project_id,
            interest_value,
        )
        return row
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "submit_interest failed | user=%s class=%s project=%s",
            user_id,
            class_id,
            project_id,
        )
        raise HTTPException(status_code=500, detail="Failed to record interest")


def submit_form(
    user_id: str,
    class_id: UUID,
    *,
    taking_115c: bool | None,
    previous_project_name: str | None,
    previous_project_link: str | None,
    notes: str | None,
    ranked_projects: list[RankedProject],
    work_with: list[UUID],
    dont_work_with: list[UUID],
    submitted: bool,
) -> dict:
    """
    Upsert the entire interest-form submission for the current user.

    This is the "Submit" button in the UI: it replaces the user's
    ``interest_form`` rows for this class, replaces the user's
    ``interest_team_preferences`` rows, and upserts the
    ``interest_submissions`` row with the general background fields.

    The replacement strategy (delete + insert per side table) keeps the
    semantics simple: the latest submission is the truth. Drafts that
    save piecewise should call ``submit_interest`` instead.
    """
    _require_class_member(user_id, class_id)
    client = get_client()

    # Validate every ranked-project entry up front so we never half-write.
    for rp in ranked_projects:
        if not (MIN_INTEREST_VALUE <= int(rp.interest_value) <= MAX_INTEREST_VALUE):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"interest_value must be between {MIN_INTEREST_VALUE} and {MAX_INTEREST_VALUE}"
                ),
            )
        _project_in_class(client, rp.project_id, class_id)

    seen_projects: set[str] = set()
    for rp in ranked_projects:
        pid = str(rp.project_id)
        if pid in seen_projects:
            raise HTTPException(
                status_code=400,
                detail="Each project may only be ranked once per submission",
            )
        seen_projects.add(pid)

    # The peer lists must reference real users in the same class — guarding
    # this here avoids dangling rows pointing at outsiders.
    enrolled_ids = {str(p["id"]) for p in _list_class_students(client, class_id)}
    instructor_row = client.table("classes").select("created_by").eq("id", str(class_id)).execute()
    if instructor_row.data:
        enrolled_ids.add(str(instructor_row.data[0].get("created_by")))

    for peer in list(work_with) + list(dont_work_with):
        if str(peer) == str(user_id):
            raise HTTPException(
                status_code=400,
                detail="You cannot list yourself as a teammate preference",
            )
        if str(peer) not in enrolled_ids:
            raise HTTPException(
                status_code=400,
                detail="Teammate preference references a user not in this class",
            )

    # Replace ranked projects (delete-all + bulk-insert).
    client.table("interest_form").delete().eq("user_id", user_id).eq(
        "class_id", str(class_id)
    ).execute()
    if ranked_projects:
        rows = [
            {
                "user_id": user_id,
                "class_id": str(class_id),
                "project_id": str(rp.project_id),
                "interest_value": int(rp.interest_value),
                "interest_reason": rp.interest_reason,
            }
            for rp in ranked_projects
        ]
        client.table("interest_form").insert(rows).execute()

    # Replace team-preference rows.
    client.table("interest_team_preferences").delete().eq("user_id", user_id).eq(
        "class_id", str(class_id)
    ).execute()

    pref_rows: list[dict] = []
    for peer in work_with:
        pref_rows.append(
            {
                "user_id": user_id,
                "class_id": str(class_id),
                "peer_user_id": str(peer),
                "kind": "work_with",
            }
        )
    for peer in dont_work_with:
        pref_rows.append(
            {
                "user_id": user_id,
                "class_id": str(class_id),
                "peer_user_id": str(peer),
                "kind": "dont_work_with",
            }
        )
    if pref_rows:
        client.table("interest_team_preferences").insert(pref_rows).execute()

    # Upsert the general-fields row. We avoid the supabase upsert helper so
    # behavior matches the in-memory test client (which only knows id-based
    # upsert) and so submitted_at clamps correctly.
    submitted_at_value = "now()" if submitted else None
    existing = (
        client.table("interest_submissions")
        .select("id")
        .eq("user_id", user_id)
        .eq("class_id", str(class_id))
        .execute()
    )
    sub_payload: dict[str, Any] = {
        "user_id": user_id,
        "class_id": str(class_id),
        "taking_115c": taking_115c,
        "previous_project_name": previous_project_name,
        "previous_project_link": previous_project_link,
        "notes": notes,
    }
    if submitted:
        # `now()` is rendered server-side for live Supabase. The in-memory
        # client treats this as a literal string, which is fine for our
        # tests — we only check truthiness, not exact timestamps.
        sub_payload["submitted_at"] = submitted_at_value

    if existing.data:
        sub_id = existing.data[0]["id"]
        client.table("interest_submissions").update(sub_payload).eq("id", sub_id).execute()
    else:
        client.table("interest_submissions").insert(sub_payload).execute()

    logger.info(
        "submit_form | user=%s class=%s ranked=%d work_with=%d dont_work_with=%d submitted=%s",
        user_id,
        class_id,
        len(ranked_projects),
        len(work_with),
        len(dont_work_with),
        submitted,
    )
    return get_my_submission(user_id, class_id)


# --------------------------------------------------------------------------- reads (self)


def get_my_interests(user_id: str, class_id: UUID) -> list[dict]:
    """
    Return the current user's ranked-project rows for the class, hydrated
    with ``project_name`` and sorted from highest to lowest interest.
    """
    client = get_client()
    rows = (
        client.table("interest_form")
        .select("id, user_id, class_id, project_id, interest_value, interest_reason, updated_at")
        .eq("user_id", user_id)
        .eq("class_id", str(class_id))
        .execute()
    )
    interest_rows = list(rows.data or [])
    project_map = _project_lookup(client, [r["project_id"] for r in interest_rows])
    for row in interest_rows:
        proj = project_map.get(str(row["project_id"])) or {}
        row["project_name"] = proj.get("name")
    interest_rows.sort(
        key=lambda r: (
            -int(r.get("interest_value") or 0),
            (r.get("project_name") or "").lower(),
        )
    )
    return interest_rows


def get_my_submission(user_id: str, class_id: UUID) -> dict:
    """
    Return the current user's full interest-form payload for the class, in
    the same shape the frontend uses to render the form on revisit.

    Result is always a dict (never None) so the frontend doesn't need to
    distinguish "no record" from "blank record".
    """
    client = get_client()
    sub = (
        client.table("interest_submissions")
        .select(
            "id, user_id, class_id, taking_115c, previous_project_name, "
            "previous_project_link, notes, submitted_at, updated_at"
        )
        .eq("user_id", user_id)
        .eq("class_id", str(class_id))
        .execute()
    )
    submission_row = sub.data[0] if sub.data else {}

    ranked_projects = get_my_interests(user_id, class_id)

    prefs = (
        client.table("interest_team_preferences")
        .select("id, peer_user_id, kind")
        .eq("user_id", user_id)
        .eq("class_id", str(class_id))
        .execute()
    )
    pref_rows = list(prefs.data or [])
    peer_lookup = _name_lookup(client, [p["peer_user_id"] for p in pref_rows])

    def _peer_view(row: dict) -> dict:
        peer = peer_lookup.get(str(row["peer_user_id"])) or {}
        return {
            "user_id": str(row["peer_user_id"]),
            "name": _profile_display_name(peer),
            "email": peer.get("email"),
        }

    work_with = [_peer_view(r) for r in pref_rows if r.get("kind") == "work_with"]
    dont_work_with = [_peer_view(r) for r in pref_rows if r.get("kind") == "dont_work_with"]

    return {
        "user_id": user_id,
        "class_id": str(class_id),
        "taking_115c": submission_row.get("taking_115c"),
        "previous_project_name": submission_row.get("previous_project_name"),
        "previous_project_link": submission_row.get("previous_project_link"),
        "notes": submission_row.get("notes"),
        "submitted_at": submission_row.get("submitted_at"),
        "ranked_projects": ranked_projects,
        "work_with": work_with,
        "dont_work_with": dont_work_with,
    }


# --------------------------------------------------------------------------- reads (instructor)


def pref_by_student(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: every enrolled student paired with their ranked
    preferences (highest interest first), sorted alphabetically by student
    name. Mirrors the spreadsheet's "pref by student" sheet.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_students = query_pool.submit(lambda: _list_class_students(client, class_id))
    fut_interest = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    students = fut_students.result()
    interest_rows = fut_interest.result()
    student_lookup = {str(s["id"]): s for s in students}
    project_map = _project_lookup(client, [r["project_id"] for r in interest_rows])

    grouped: dict[str, list[dict]] = {sid: [] for sid in student_lookup}
    for row in interest_rows:
        uid = str(row["user_id"])
        if uid not in grouped:
            # An interest row for someone not currently enrolled (e.g. the
            # student dropped the class). Skip but log so we can spot stale
            # data during instructor reviews.
            logger.debug(
                "pref_by_student: orphan interest row | user=%s class=%s project=%s",
                uid,
                class_id,
                row.get("project_id"),
            )
            continue
        grouped[uid].append(row)

    out: list[dict] = []
    for sid, profile in student_lookup.items():
        rows = sorted(
            grouped.get(sid, []),
            key=lambda r: (
                -int(r.get("interest_value") or 0),
                (project_map.get(str(r["project_id"])) or {}).get("name") or "",
            ),
        )
        out.append(
            {
                "user_id": sid,
                "user_name": _profile_display_name(profile),
                "user_email": profile.get("email"),
                "preferences": [
                    {
                        "project_id": str(r["project_id"]),
                        "project_name": (project_map.get(str(r["project_id"])) or {}).get("name"),
                        "interest_value": int(r.get("interest_value") or 0),
                        "interest_reason": r.get("interest_reason"),
                    }
                    for r in rows
                ],
            }
        )

    out.sort(key=lambda e: (e["user_name"] or "").lower())
    return out


def pref_by_project(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: every project paired with the students that ranked it
    (highest interest first), sorted alphabetically by project name.
    Mirrors the spreadsheet's "pref by project" sheet.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_projects = query_pool.submit(lambda: _list_class_projects(client, class_id))
    fut_interest = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    projects = fut_projects.result()
    interest_rows = fut_interest.result()
    student_lookup = _name_lookup(client, [r["user_id"] for r in interest_rows])

    grouped: dict[str, list[dict]] = {str(p["id"]): [] for p in projects}
    for row in interest_rows:
        pid = str(row["project_id"])
        if pid in grouped:
            grouped[pid].append(row)

    out: list[dict] = []
    for project in projects:
        pid = str(project["id"])
        rows = sorted(
            grouped.get(pid, []),
            key=lambda r: (
                -int(r.get("interest_value") or 0),
                (student_lookup.get(str(r["user_id"])) or {}).get("name") or "",
            ),
        )
        out.append(
            {
                "project_id": pid,
                "project_name": project.get("name"),
                "team_size": int(project.get("team_size") or 0),
                "num_members": int(project.get("num_members") or 0),
                "interested_students": [
                    {
                        "user_id": str(r["user_id"]),
                        "user_name": _profile_display_name(student_lookup.get(str(r["user_id"]))),
                        "user_email": (student_lookup.get(str(r["user_id"])) or {}).get("email"),
                        "interest_value": int(r.get("interest_value") or 0),
                        "interest_reason": r.get("interest_reason"),
                    }
                    for r in rows
                ],
            }
        )

    out.sort(key=lambda e: (e["project_name"] or "").lower())
    return out


def project_rank(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: per-project breadth / depth / strength + ranks.

    Definitions match the staffing spreadsheet:
      * breadth   = number of students that submitted *any* interest
      * depth     = sum of interest_value across all submitters
      * strength  = depth / breadth (0 if no submitters)
      * num_staff = current count of project_members for this project
                    (within this class)
      * team_size = configured project capacity (projects.team_size)
      * availability = team_size - num_staff
      * breadth_rank / depth_rank / strength_rank: 1 = highest;
        ties get the same rank.
      * sum_of_ranks = breadth_rank + depth_rank + strength_rank
      * total_rank   = 1 = lowest sum_of_ranks (overall most desirable)

    Returned list is sorted by ``total_rank`` ascending so the instructor's
    "best" project shows up first.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_projects = query_pool.submit(lambda: _list_class_projects(client, class_id))
    fut_interest = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    projects = fut_projects.result()
    interest_rows = fut_interest.result()
    members = _project_members_for_class(client, class_id, projects=projects)

    member_counts: dict[str, int] = {}
    for m in members:
        pid = str(m.get("project_id"))
        member_counts[pid] = member_counts.get(pid, 0) + 1

    interest_by_project: dict[str, list[dict]] = {}
    for r in interest_rows:
        interest_by_project.setdefault(str(r.get("project_id")), []).append(r)

    summary: list[dict] = []
    for project in projects:
        pid = str(project["id"])
        rows = interest_by_project.get(pid, [])
        breadth = len(rows)
        depth = sum(int(r.get("interest_value") or 0) for r in rows)
        strength = (depth / breadth) if breadth > 0 else 0.0
        num_staff = member_counts.get(pid, 0)
        team_size = int(project.get("team_size") or 0)
        summary.append(
            {
                "project_id": pid,
                "project_name": project.get("name"),
                "breadth": breadth,
                "depth": depth,
                "strength": strength,
                "num_staff": num_staff,
                "team_size": team_size,
                "availability": team_size - num_staff,
            }
        )

    def _rank_desc(items: list[dict], key: str) -> dict[str, int]:
        """Return {project_id: rank} where rank 1 is the largest value, ties tie."""
        ordered = sorted(items, key=lambda x: x[key], reverse=True)
        ranks: dict[str, int] = {}
        last_value: Any = object()
        last_rank = 0
        for idx, entry in enumerate(ordered, start=1):
            if entry[key] != last_value:
                last_rank = idx
                last_value = entry[key]
            ranks[entry["project_id"]] = last_rank
        return ranks

    breadth_ranks = _rank_desc(summary, "breadth")
    depth_ranks = _rank_desc(summary, "depth")
    strength_ranks = _rank_desc(summary, "strength")

    for entry in summary:
        pid = entry["project_id"]
        entry["breadth_rank"] = breadth_ranks.get(pid, 0)
        entry["depth_rank"] = depth_ranks.get(pid, 0)
        entry["strength_rank"] = strength_ranks.get(pid, 0)
        entry["sum_of_ranks"] = entry["breadth_rank"] + entry["depth_rank"] + entry["strength_rank"]

    # Total rank: lowest sum_of_ranks wins (rank 1).
    sum_sorted = sorted(summary, key=lambda x: x["sum_of_ranks"])
    last_value = object()
    last_rank = 0
    for idx, entry in enumerate(sum_sorted, start=1):
        if entry["sum_of_ranks"] != last_value:
            last_rank = idx
            last_value = entry["sum_of_ranks"]
        entry["total_rank"] = last_rank

    summary.sort(key=lambda x: (x["total_rank"], (x["project_name"] or "").lower()))
    return summary


def get_assignments(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: every enrolled student plus the project they are
    currently assigned to (or ``None`` if unassigned).

    Sorted alphabetically by student name so the AU sheet shape matches
    the spreadsheet.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_students = query_pool.submit(lambda: _list_class_students(client, class_id))
    fut_projects = query_pool.submit(lambda: _list_class_projects(client, class_id))
    students = fut_students.result()
    projects = fut_projects.result()
    members = _project_members_for_class(client, class_id, projects=projects)
    project_lookup = _project_lookup(client, [m.get("project_id") for m in members])

    student_to_project: dict[str, dict] = {}
    for m in members:
        uid = str(m.get("user_id"))
        pid = str(m.get("project_id"))
        # If a student happens to be on multiple projects in the class
        # (legacy data, manual edits) we surface the first one but log it.
        if uid in student_to_project:
            logger.warning(
                "get_assignments: user assigned to multiple projects in class | "
                "user_id=%s class=%s",
                uid,
                class_id,
            )
            continue
        proj = project_lookup.get(pid) or {}
        student_to_project[uid] = {
            "project_id": pid,
            "project_name": proj.get("name"),
            "role": m.get("role"),
        }

    out: list[dict] = []
    for profile in students:
        uid = str(profile["id"])
        assignment = student_to_project.get(uid)
        out.append(
            {
                "user_id": uid,
                "user_name": _profile_display_name(profile),
                "user_email": profile.get("email"),
                "assigned_project_id": assignment["project_id"] if assignment else None,
                "assigned_project_name": (assignment["project_name"] if assignment else None),
                "role": assignment["role"] if assignment else None,
            }
        )

    out.sort(key=lambda e: (e["user_name"] or "").lower())
    return out


def get_project_availability(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: one row per (interested student, project) showing
    interest, current student assignment, and project remaining seats.

    Mirrors the spreadsheet's "PA" sheet — useful for spotting projects
    where every interested student is already assigned elsewhere.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_projects = query_pool.submit(lambda: _list_class_projects(client, class_id))
    fut_interest = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    projects = fut_projects.result()
    interest_rows = fut_interest.result()
    members = _project_members_for_class(client, class_id, projects=projects)

    project_lookup = {str(p["id"]): p for p in projects}
    student_lookup = _name_lookup(client, [r["user_id"] for r in interest_rows])

    member_counts: dict[str, int] = {}
    user_to_project: dict[str, str] = {}
    for m in members:
        pid = str(m.get("project_id"))
        member_counts[pid] = member_counts.get(pid, 0) + 1
        user_to_project[str(m.get("user_id"))] = pid

    out: list[dict] = []
    for row in interest_rows:
        pid = str(row["project_id"])
        proj = project_lookup.get(pid)
        if not proj:
            continue
        team_size = int(proj.get("team_size") or 0)
        num_staff = member_counts.get(pid, 0)
        uid = str(row["user_id"])
        out.append(
            {
                "user_id": uid,
                "user_name": _profile_display_name(student_lookup.get(uid)),
                "user_email": (student_lookup.get(uid) or {}).get("email"),
                "project_id": pid,
                "project_name": proj.get("name"),
                "interest_value": int(row.get("interest_value") or 0),
                "interest_reason": row.get("interest_reason"),
                "user_assignment": user_to_project.get(uid),
                "project_availability": team_size - num_staff,
            }
        )

    out.sort(
        key=lambda e: (
            (e["project_name"] or "").lower(),
            -e["interest_value"],
            (e["user_name"] or "").lower(),
        )
    )
    return out


def get_class_students_with_interest(user_id: str, class_id: UUID) -> list[dict]:
    """
    Instructor view: a single payload that the Assign UI can render without
    making N+1 calls. Each entry combines the student's profile, their
    ranked preferences, the team-preference lists, and their current
    project assignment (if any).
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()
    cid = str(class_id)

    def _fetch_submissions():
        return (
            client.table("interest_submissions")
            .select(
                "user_id, taking_115c, previous_project_name, "
                "previous_project_link, notes, submitted_at"
            )
            .eq("class_id", cid)
            .execute()
        )

    def _fetch_prefs():
        return (
            client.table("interest_team_preferences")
            .select("user_id, peer_user_id, kind")
            .eq("class_id", cid)
            .execute()
        )

    fut_students = query_pool.submit(lambda: _list_class_students(client, class_id))
    fut_sub = query_pool.submit(_fetch_submissions)
    fut_int = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    fut_pref = query_pool.submit(_fetch_prefs)
    fut_proj = query_pool.submit(lambda: _list_class_projects(client, class_id))

    students = fut_students.result()
    submissions = fut_sub.result()
    interest_rows = fut_int.result()
    prefs = fut_pref.result()
    projects = fut_proj.result()

    members = _project_members_for_class(client, class_id, projects=projects)

    submission_lookup = {str(s["user_id"]): s for s in (submissions.data or [])}

    project_ids: set[str] = {str(r["project_id"]) for r in interest_rows}
    interest_by_user: dict[str, list[dict]] = {}
    for row in interest_rows:
        interest_by_user.setdefault(str(row["user_id"]), []).append(row)

    prefs_by_user: dict[str, list[dict]] = {}
    for row in prefs.data or []:
        prefs_by_user.setdefault(str(row["user_id"]), []).append(row)

    member_lookup: dict[str, dict] = {}
    for m in members:
        member_lookup[str(m["user_id"])] = m
        if m.get("project_id"):
            project_ids.add(str(m["project_id"]))

    peer_ids = [p["peer_user_id"] for rows in prefs_by_user.values() for p in rows]
    fut_proj_lookup = query_pool.submit(lambda: _project_lookup(client, project_ids))
    fut_peer = query_pool.submit(lambda: _name_lookup(client, peer_ids))
    project_lookup = fut_proj_lookup.result()
    peer_lookup = fut_peer.result()

    out: list[dict] = []
    for profile in students:
        uid = str(profile["id"])
        sub = submission_lookup.get(uid, {})

        prefs_rows = sorted(
            interest_by_user.get(uid, []),
            key=lambda r: -int(r.get("interest_value") or 0),
        )
        preferences = [
            {
                "project_id": str(r["project_id"]),
                "project_name": (project_lookup.get(str(r["project_id"])) or {}).get("name"),
                "interest_value": int(r.get("interest_value") or 0),
                "interest_reason": r.get("interest_reason"),
            }
            for r in prefs_rows
        ]

        peer_rows = prefs_by_user.get(uid, [])

        def _peer_view(row: dict) -> dict:
            peer = peer_lookup.get(str(row["peer_user_id"])) or {}
            return {
                "user_id": str(row["peer_user_id"]),
                "name": _profile_display_name(peer),
                "email": peer.get("email"),
            }

        work_with = [_peer_view(r) for r in peer_rows if r.get("kind") == "work_with"]
        dont_work_with = [_peer_view(r) for r in peer_rows if r.get("kind") == "dont_work_with"]

        member = member_lookup.get(uid)
        if member:
            assigned_project = project_lookup.get(str(member["project_id"])) or {}
            assignment = {
                "project_id": str(member["project_id"]),
                "project_name": assigned_project.get("name"),
                "role": member.get("role"),
            }
        else:
            assignment = None

        out.append(
            {
                "user_id": uid,
                "user_name": _profile_display_name(profile),
                "user_email": profile.get("email"),
                "submitted_at": sub.get("submitted_at"),
                "taking_115c": sub.get("taking_115c"),
                "previous_project_name": sub.get("previous_project_name"),
                "previous_project_link": sub.get("previous_project_link"),
                "notes": sub.get("notes"),
                "preferences": preferences,
                "work_with": work_with,
                "dont_work_with": dont_work_with,
                "assigned_project": assignment,
            }
        )

    out.sort(key=lambda e: (e["user_name"] or "").lower())
    return out


# --------------------------------------------------------------------------- writes (instructor)


def assign_user(
    user_id: str,
    class_id: UUID,
    target_user_id: UUID,
    project_id: UUID,
) -> dict:
    """
    Place ``target_user_id`` onto ``project_id``, removing them from any
    other project they currently belong to in this class.

    Reads the class's projects and memberships once (2 round trips), then
    inserts the new membership **before** deleting the old ones — a failure
    can leave a student on two teams for a moment, never on none — and
    rewrites ``num_members`` for every touched project from the rows it
    already holds. ~7 round trips (was ~18).

    Raises:
        HTTPException 404 — class / project not found.
        HTTPException 403 — caller is not the class instructor.
        HTTPException 400 — project belongs to a different class.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()
    projects, members = _class_projects_and_members(client, class_id)
    pid, tid = str(project_id), str(target_user_id)

    if pid not in {str(p["id"]) for p in projects}:
        _project_in_class(client, project_id, class_id)  # raises 404 / 400 with the usual detail
        raise HTTPException(status_code=404, detail=authz.PROJECT_NOT_FOUND)

    previous = _projects_of(members, tid)
    if pid in previous:
        return {
            "message": "User already assigned to this project",
            "user_id": tid,
            "project_id": pid,
        }

    team = [m for m in members if str(m["project_id"]) == pid]
    try:
        client.table("project_members").insert(
            {"project_id": pid, "user_id": tid, "role": _team_role_for_newcomer(team)}
        ).execute()
        if previous:
            client.table("project_members").delete().eq("user_id", tid).in_(
                "project_id", previous
            ).execute()
        set_num_members(client, pid, len(team) + 1)
        for old_pid in previous:
            set_num_members(
                client,
                old_pid,
                sum(
                    1
                    for m in members
                    if str(m["project_id"]) == old_pid and str(m.get("user_id")) != tid
                ),
            )
    except HTTPException:
        raise
    except Exception:
        logger.exception("assign_user failed | class=%s user=%s project=%s", class_id, tid, pid)
        raise HTTPException(status_code=500, detail="Failed to assign user to project")

    logger.info(
        "assign_user | class=%s user=%s -> project=%s removed_from=%d",
        class_id,
        tid,
        pid,
        len(previous),
    )
    return {
        "message": "User assigned to project",
        "user_id": tid,
        "project_id": pid,
        "previous_project_ids": previous,
        "added": {"message": "Added member successfully", "user_id": tid, "role": ROLE_MEMBER},
    }


def unassign_user(
    user_id: str,
    class_id: UUID,
    target_user_id: UUID,
) -> dict:
    """
    Remove ``target_user_id`` from whichever project(s) they belong to in
    this class (one bulk delete + a count write per project; ~5 round trips).
    Raises 404 if the student is not currently assigned.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()
    _projects, members = _class_projects_and_members(client, class_id)
    tid = str(target_user_id)

    current = _projects_of(members, tid)
    if not current:
        raise HTTPException(
            status_code=404,
            detail="User is not assigned to a project in this class",
        )

    client.table("project_members").delete().eq("user_id", tid).in_("project_id", current).execute()
    for pid in current:
        set_num_members(
            client,
            pid,
            sum(1 for m in members if str(m["project_id"]) == pid and str(m.get("user_id")) != tid),
        )

    logger.info("unassign_user | class=%s user=%s removed_from=%s", class_id, tid, current)
    return {
        "message": "User unassigned from project",
        "user_id": tid,
        "removed_project_ids": current,
    }


def auto_assign(user_id: str, class_id: UUID) -> list[dict]:
    """
    Greedy least-options-first auto-assignment.

    For every currently unassigned enrolled student, pick the project with
    the highest ``interest_value`` that still has open seats. To minimize
    the chance of a "dead" student (one with zero remaining matches),
    students with the fewest viable options go first.

    Placements are decided in memory and written as ONE bulk insert plus one
    ``num_members`` write per touched project (~9 round trips for a whole
    class; it used to be ~8 per placement). A team that has no scrum master
    gets one from its first placement, matching the single-add rule.

    Returns the list of newly placed assignments. If everyone is already
    placed (or nobody had a viable option), returns an empty list.
    """
    _require_class_instructor(user_id, class_id)
    client = get_client()

    fut_students = query_pool.submit(lambda: _list_class_students(client, class_id))
    fut_projects = query_pool.submit(lambda: _list_class_projects(client, class_id))
    fut_interest = query_pool.submit(lambda: _list_class_interest_rows(client, class_id))
    students = fut_students.result()
    projects = fut_projects.result()
    all_interest_rows = fut_interest.result()

    student_ids = {str(s["id"]) for s in students}
    if not student_ids:
        return []

    members = _project_members_for_class(client, class_id, projects=projects)
    assigned_ids = {str(m["user_id"]) for m in members}
    unassigned_ids = sorted(student_ids - assigned_ids)
    if not unassigned_ids:
        return []

    project_lookup = {str(p["id"]): p for p in projects}
    seats_left: dict[str, int] = {
        str(p["id"]): max(int(p.get("team_size") or 0), 0) for p in projects
    }
    counts: dict[str, int] = dict.fromkeys(seats_left, 0)
    has_scrum_master: dict[str, bool] = dict.fromkeys(seats_left, False)
    for m in members:
        pid = str(m["project_id"])
        if pid in seats_left:
            seats_left[pid] = max(seats_left[pid] - 1, 0)
            counts[pid] += 1
            if m.get("role") == ROLE_SCRUM_MASTER:
                has_scrum_master[pid] = True

    prefs_by_user: dict[str, list[dict]] = {}
    for row in all_interest_rows:
        if str(row["user_id"]) in unassigned_ids:
            prefs_by_user.setdefault(str(row["user_id"]), []).append(row)

    # Students with the fewest viable choices first, ties broken by id.
    def _viable_count(uid: str) -> int:
        return sum(
            1 for r in prefs_by_user.get(uid, []) if seats_left.get(str(r["project_id"]), 0) > 0
        )

    order = sorted(unassigned_ids, key=lambda uid: (_viable_count(uid), uid))

    placements: list[dict] = []
    new_rows: list[dict] = []
    for uid in order:
        sorted_prefs = sorted(
            prefs_by_user.get(uid, []),
            key=lambda r: -int(r.get("interest_value") or 0),
        )
        for row in sorted_prefs:
            pid = str(row["project_id"])
            if seats_left.get(pid, 0) <= 0:
                continue
            role = ROLE_MEMBER if has_scrum_master.get(pid) else ROLE_SCRUM_MASTER
            has_scrum_master[pid] = True
            seats_left[pid] -= 1
            counts[pid] = counts.get(pid, 0) + 1
            new_rows.append({"project_id": pid, "user_id": uid, "role": role})
            placements.append(
                {
                    "user_id": uid,
                    "project_id": pid,
                    "project_name": (project_lookup.get(pid) or {}).get("name"),
                    "interest_value": int(row.get("interest_value") or 0),
                }
            )
            break

    if new_rows:
        client.table("project_members").insert(new_rows).execute()
        for pid in sorted({r["project_id"] for r in new_rows}):
            set_num_members(client, pid, counts[pid])

    logger.info(
        "auto_assign | class=%s placed=%d unassigned=%d",
        class_id,
        len(placements),
        len(unassigned_ids),
    )
    return placements
