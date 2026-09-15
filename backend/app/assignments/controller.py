"""
Assignment business logic
"""

import datetime
import logging
from uuid import UUID

from fastapi import HTTPException

from app.core import authz
from app.core.db import fan_out, get_client
from app.database.client import (
    retry_on_disconnect,
)
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)
ALLOWED_ASSIGNMENT_TYPES = {"tsr", "interest_form", "feedback"}


def _require_instructor(user_id: str) -> None:
    """Raise 403 if the user's profile role is not instructor."""
    result = get_client().table("profiles").select("role").eq("id", user_id).execute()
    if not result.data or result.data[0].get("role") != "instructor":
        raise HTTPException(status_code=403, detail=authz.INSTRUCTOR_ROLE_REQUIRED)


def _require_class_instructor(user_id: str, class_id: str) -> None:
    """Raise 404 if the class does not exist and 403 unless the user is its instructor."""
    authz.require_class_instructor(get_client(), user_id, class_id)


def _tsr_overview_scope(
    user_id: str, class_row: dict | None, enrollment_role: str | None, projects: list[dict]
) -> set[str] | None:
    """Which of the class's projects the caller may see in a TSR overview.

    ``None`` means every project (the class instructor). A TA
    (``class_enrollments.enrollment_role == 'ta'``) sees the teams they are the
    assigned TA of (``projects.assigned_ta_id`` — the one operational TA who runs
    meetings, takes attendance and reviews TSRs). Anyone else gets a 403, and a
    missing class a 404. Pure: callers load the rows (concurrently).
    """
    if not class_row:
        raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
    if str(class_row.get("created_by")) == str(user_id):
        return None
    if enrollment_role != authz.ROLE_TA:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this assignment's TSR responses",
        )
    return {str(p["id"]) for p in projects if str(p.get("assigned_ta_id")) == str(user_id)}


def create_assignment(
    user_id: str,
    class_id: UUID,
    title: str,
    open_date: datetime.date,
    close_date: datetime.date,
    status: str,
    assignment_type: str | None = None,
) -> dict:
    """
    Create a new assignment for a class (instructor only).

    Uses the assignments.class_id FK column to link the assignment to its class.

    Returns the created assignment row.
    """
    _require_instructor(user_id)
    _require_class_instructor(user_id, str(class_id))

    if open_date > close_date:
        raise HTTPException(status_code=400, detail="open_date must be on or before close_date")

    try:
        assignment_data = {
            "Title": title,
            "open_date": open_date.isoformat(),
            "close_date": close_date.isoformat(),
            "status": status,
            "class_id": str(class_id),
        }
        if assignment_type is not None:
            normalized_type = assignment_type.strip().lower()
            if normalized_type not in ALLOWED_ASSIGNMENT_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail="assignment_type must be one of: tsr, interest_form, feedback",
                )
            assignment_data["assignment_type"] = normalized_type

        result = get_client().table("assignments").insert(assignment_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")

        logger.info(
            "Assignment created | assignment_id=%s class_id=%s title=%r type=%s created_by=%s",
            result.data[0].get("id"),
            class_id,
            title,
            assignment_type,
            user_id,
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error creating assignment | class_id=%s title=%r user_id=%s",
            class_id,
            title,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to create assignment")


def _serialize_tsr_entry(row: dict, profile_map: dict) -> dict:
    """Build the canonical TSR entry shape from a row + profile lookup map.

    Always includes tsr_id, evaluator_id, evaluator_name, evaluatee_name,
    percent_contribution, positive_feedback, constructive_feedback, and
    Scrum Master fields.
    """
    evaluator_profile = profile_map.get(row["evaluator_id"], {})
    evaluatee_profile = profile_map.get(row["evaluatee_id"], {})
    entry = {
        "tsr_id": row["id"],
        "evaluator_id": row["evaluator_id"],
        "evaluatee_id": row["evaluatee_id"],
        "project_id": row.get("project_id"),
        "evaluator_name": profile_display_name(evaluator_profile),
        "evaluatee_name": profile_display_name(evaluatee_profile),
        "percent_contribution": row["percent_contribution"],
        "positive_feedback": row["positive_feedback"],
        "constructive_feedback": row.get("constructive_feedback") or "",
        "scrum_master_tickets": row.get("scrum_master_tickets") or "",
        "scrum_master_assessment": row.get("scrum_master_assessment") or "",
        "scrum_master_notes": row.get("scrum_master_notes") or "",
    }
    return entry


def _latest_tsr_rows(rows: list) -> list:
    """Keep one row per (evaluator, evaluatee, project); prefer newest created_at."""
    best: dict[tuple, dict] = {}
    for row in rows:
        key = (row.get("evaluator_id"), row.get("evaluatee_id"), row.get("project_id"))
        if not key[0] or not key[1]:
            continue
        prev = best.get(key)
        if not prev or (row.get("created_at") or "") >= (prev.get("created_at") or ""):
            best[key] = row
    return list(best.values())


_TSR_COLUMNS = (
    "id, evaluator_id, evaluatee_id, project_id, percent_contribution, "
    "positive_feedback, constructive_feedback, scrum_master_tickets, "
    "scrum_master_assessment, scrum_master_notes, created_at"
)


def _tsr_rows_for_assignment(client, assignment_id: str) -> list:
    """The latest TSR row per (evaluator, evaluatee, project) for an assignment."""
    rows = (
        client.table("TSRs").select(_TSR_COLUMNS).eq("assignment_id", assignment_id).execute()
    ).data or []
    return _latest_tsr_rows(rows)


def _people_in(rows: list) -> set[str]:
    """Every evaluator and evaluatee id mentioned by these TSR rows."""
    return {r["evaluator_id"] for r in rows if r.get("evaluator_id")} | {
        r["evaluatee_id"] for r in rows if r.get("evaluatee_id")
    }


def _profiles_by_id(client, user_ids) -> dict:
    """``{id: profile}`` (PROFILE_SELECT columns) — one round trip, none for no ids."""
    ids = sorted({str(u) for u in user_ids if u})
    if not ids:
        return {}
    rows = (client.table("profiles").select(PROFILE_SELECT).in_("id", ids).execute()).data or []
    return {p["id"]: p for p in rows}


def _fetch_tsr_entries(client, assignment_id: str) -> list:
    """
    Return TSR data for all submissions linked to a given assignment_id.

    Each entry always includes tsr_id, evaluator_id, evaluator_name,
    evaluatee_name, percent_contribution, and positive_feedback.
    constructive_feedback and Scrum Master fields are always included.

    Because every project member evaluates every other member independently,
    multiple entries can exist for the same evaluatee (one per evaluator).
    evaluator_id is included so callers can identify their own submission
    when using the update endpoint.
    """
    rows = _tsr_rows_for_assignment(client, assignment_id)
    if not rows:
        return []
    profile_map = _profiles_by_id(client, _people_in(rows))
    return [_serialize_tsr_entry(row, profile_map) for row in rows]


def update_assignment(
    user_id: str,
    assignment_id: UUID,
    title: str | None,
    open_date: datetime.date | None,
    close_date: datetime.date | None,
    status: str | None,
    assignment_type: str | None = None,
) -> dict:
    """
    Edit an existing assignment's title, dates, or status (instructor only).

    Only the instructor who owns the class the assignment belongs to may edit it.
    Returns the updated assignment row. If the assignment type is 'tsr', a
    'tsrs' key is also included containing all linked TSR submissions with
    evaluatee_name, percent_contribution, constructive_feedback, and positive_feedback (always present)
    plus Scrum Master fields.
    """
    _require_instructor(user_id)

    try:
        client = get_client()

        assignment_result = (
            client.table("assignments").select("*").eq("id", str(assignment_id)).execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment = assignment_result.data[0]
        _require_class_instructor(user_id, assignment.get("class_id"))

        updates: dict = {}
        if title is not None:
            updates["Title"] = title
        if open_date is not None:
            updates["open_date"] = open_date.isoformat()
        if close_date is not None:
            updates["close_date"] = close_date.isoformat()
        if status is not None:
            updates["status"] = status
        if assignment_type is not None:
            normalized_type = assignment_type.strip().lower()
            if normalized_type not in ALLOWED_ASSIGNMENT_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail="assignment_type must be one of: tsr, interest_form, feedback",
                )
            updates["assignment_type"] = normalized_type

        if updates:
            effective_open = open_date or (
                datetime.date.fromisoformat(assignment["open_date"])
                if assignment.get("open_date")
                else None
            )
            effective_close = close_date or (
                datetime.date.fromisoformat(assignment["close_date"])
                if assignment.get("close_date")
                else None
            )
            if effective_open and effective_close and effective_open > effective_close:
                raise HTTPException(
                    status_code=400, detail="open_date must be on or before close_date"
                )

            result = (
                client.table("assignments").update(updates).eq("id", str(assignment_id)).execute()
            )
            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to update assignment")
            assignment = result.data[0]

        effective_type = (
            assignment_type.strip().lower()
            if assignment_type
            else assignment.get("assignment_type")
        )
        if effective_type == "tsr":
            assignment["tsrs"] = _fetch_tsr_entries(client, str(assignment_id))

        if updates:
            logger.info(
                "Assignment updated | assignment_id=%s user_id=%s fields=%s",
                assignment_id,
                user_id,
                list(updates.keys()),
            )
        return assignment
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating assignment | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to update assignment")


def delete_assignment(user_id: str, assignment_id: UUID) -> None:
    """Delete an assignment (instructor who owns the class only)."""
    _require_instructor(user_id)
    try:
        client = get_client()
        assignment_result = (
            client.table("assignments")
            .select("id, class_id")
            .eq("id", str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        _require_class_instructor(user_id, assignment_result.data[0]["class_id"])
        client.table("assignments").delete().eq("id", str(assignment_id)).execute()
        logger.info("Assignment deleted | assignment_id=%s user_id=%s", assignment_id, user_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error deleting assignment | assignment_id=%s user_id=%s", assignment_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to delete assignment")


def _apply_tsr_stats(assignments: list, projects: list, tsr_rows: list) -> None:
    """Attach has_tsr_responses / teams_total / teams_submitted to TSR assignments.

    ``projects`` are the class's projects with ``project_members(user_id)``
    embedded; ``tsr_rows`` are (assignment_id, project_id, evaluator_id) rows.
    Rows for projects outside the class are ignored.
    """
    class_project_ids = {p["id"] for p in projects}
    projects_with_members = {p["id"] for p in projects if p.get("project_members")}
    evaluators: dict[str, dict[str, set[str]]] = {}
    with_responses: set[str] = set()
    for row in tsr_rows:
        aid, pid, eid = row.get("assignment_id"), row.get("project_id"), row.get("evaluator_id")
        if pid not in class_project_ids:
            continue
        if aid:
            with_responses.add(aid)
        if aid and eid:
            evaluators.setdefault(aid, {}).setdefault(pid, set()).add(eid)

    for assignment in assignments:
        if assignment.get("assignment_type") != "tsr":
            continue
        by_project = evaluators.get(assignment["id"], {})
        assignment["has_tsr_responses"] = assignment["id"] in with_responses
        assignment["teams_total"] = len(projects_with_members)
        assignment["teams_submitted"] = sum(
            1 for pid in projects_with_members if by_project.get(pid)
        )


def _apply_feedback_stats(assignments: list, enrolled_count: int, submission_rows: list) -> None:
    """Attach feedback_submitted / feedback_total to feedback assignments."""
    submitted_by: dict[str, int] = {}
    for row in submission_rows:
        aid = row.get("assignment_id")
        if aid:
            submitted_by[aid] = submitted_by.get(aid, 0) + 1
    for assignment in assignments:
        if assignment.get("assignment_type") != "feedback":
            continue
        assignment["feedback_submitted"] = submitted_by.get(assignment["id"], 0)
        assignment["feedback_total"] = enrolled_count


def _with_instructor_stats(client, class_id: str, assignments: list) -> list:
    """Load (concurrently) and attach the instructor's per-assignment stats.

    Stat keys are only added when the class has assignments of that type, so
    the UI can tell "no feedback assignment" from "0 submissions".
    """
    tsr_ids = [a["id"] for a in assignments if a.get("assignment_type") == "tsr"]
    feedback_ids = [a["id"] for a in assignments if a.get("assignment_type") == "feedback"]
    jobs = {}
    if tsr_ids:
        jobs["projects"] = lambda: (
            (
                client.table("projects")
                .select("id, project_members(user_id)")
                .eq("class_id", class_id)
                .execute()
            ).data
            or []
        )
        jobs["tsrs"] = lambda: (
            (
                client.table("TSRs")
                .select("assignment_id, project_id, evaluator_id")
                .in_("assignment_id", tsr_ids)
                .execute()
            ).data
            or []
        )
    if feedback_ids:
        jobs["enrollments"] = lambda: (
            (
                client.table("class_enrollments")
                .select("user_id")
                .eq("class_id", class_id)
                .execute()
            ).data
            or []
        )
        jobs["feedback"] = lambda: (
            (
                client.table("feedback_submissions")
                .select("assignment_id, student_id")
                .in_("assignment_id", feedback_ids)
                .execute()
            ).data
            or []
        )
    data = fan_out(jobs)
    if tsr_ids:
        _apply_tsr_stats(assignments, data["projects"], data["tsrs"])
    if feedback_ids:
        _apply_feedback_stats(assignments, len(data["enrollments"]), data["feedback"])
    return assignments


def get_assignments_for_class(user_id: str, class_id: UUID) -> list:
    """
    Return all assignments that belong to a class.

    - Instructors: must own the class; see all statuses, with TSR and feedback
      submission stats.
    - Students: must be enrolled in the class; only see 'publish' assignments.

    404 when the class does not exist; 403 when the caller fails the rule above.

    Round trips: the caller's profile role, the class, their enrollment and the
    assignment list are read concurrently; an instructor's stats take one more
    concurrent wave. At most 8 queries in 2 waves (was 8 sequential reads for an
    instructor).
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "role": lambda: (
                    (
                        client.table("profiles").select("role").eq("id", user_id).limit(1).execute()
                    ).data
                    or []
                ),
                "class": lambda: authz.load_class(client, cid),
                "enrolled": lambda: bool(
                    (
                        client.table("class_enrollments")
                        .select("id")
                        .eq("class_id", cid)
                        .eq("user_id", user_id)
                        .limit(1)
                        .execute()
                    ).data
                ),
                "assignments": lambda: (
                    (
                        client.table("assignments")
                        .select("*")
                        .eq("class_id", cid)
                        .order("created_at", desc=True)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        role = reads["role"][0].get("role") if reads["role"] else None
        assignments = reads["assignments"]
        cls = reads["class"]
        if cls is None:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)

        if role == "instructor":
            if str(cls.get("created_by")) != str(user_id):
                raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)
            return _with_instructor_stats(client, cid, assignments)

        if not reads["enrolled"]:
            raise HTTPException(status_code=403, detail=authz.NOT_ENROLLED)
        return [a for a in assignments if a.get("status") == "publish"]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching assignments | class_id=%s user_id=%s",
            class_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch assignments")


def update_tsr_entry(
    user_id: str,
    assignment_id: UUID,
    tsr_id: UUID,
    percent_contribution: int | None = None,
    positive_feedback: str | None = None,
    constructive_feedback: str | None = None,
    scrum_master_tickets: str | None = None,
    scrum_master_assessment: str | None = None,
    scrum_master_notes: str | None = None,
) -> dict:
    """
    Update the editable fields of a single TSR linked to an assignment.

    Who can update:
    - The evaluator who originally submitted the TSR.
    - The class instructor.

    At least one field must be provided. Returns the updated TSR entry in the
    same shape as _fetch_tsr_entries (including its project_id).

    Round trips: the TSR with its project and class embedded, the update (whose
    returned row is used directly), and one profile read — 3 (was 6).
    """
    try:
        client = get_client()

        tsr_result = (
            client.table("TSRs")
            .select(
                "id, evaluator_id, evaluatee_id, project_id, assignment_id, "
                "projects(class_id, classes(created_by))"
            )
            .eq("id", str(tsr_id))
            .limit(1)
            .execute()
        )
        if not tsr_result.data:
            raise HTTPException(status_code=404, detail="TSR not found")

        tsr = tsr_result.data[0]
        if tsr.get("assignment_id") != str(assignment_id):
            raise HTTPException(status_code=400, detail="TSR does not belong to this assignment")

        project = tsr.get("projects")
        if not project:
            raise HTTPException(status_code=404, detail="Project linked to TSR not found")

        # Permission: evaluator or class instructor
        is_evaluator = tsr["evaluator_id"] == user_id
        is_instructor = str((project.get("classes") or {}).get("created_by")) == str(user_id)
        if not is_evaluator and not is_instructor:
            raise HTTPException(
                status_code=403,
                detail="Only the TSR submitter or class instructor can update this TSR",
            )

        updates: dict = {}
        if percent_contribution is not None:
            updates["percent_contribution"] = percent_contribution
        if positive_feedback is not None:
            updates["positive_feedback"] = positive_feedback
        if constructive_feedback is not None:
            updates["constructive_feedback"] = constructive_feedback
        if scrum_master_tickets is not None:
            updates["scrum_master_tickets"] = scrum_master_tickets
        if scrum_master_assessment is not None:
            updates["scrum_master_assessment"] = scrum_master_assessment
        if scrum_master_notes is not None:
            updates["scrum_master_notes"] = scrum_master_notes

        if not updates:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        result = client.table("TSRs").update(updates).eq("id", str(tsr_id)).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="TSR not found")
        row = result.data[0]
        profile_map = _profiles_by_id(client, {row["evaluator_id"], row["evaluatee_id"]})
        entry = _serialize_tsr_entry(row, profile_map)

        logger.info(
            "TSR entry updated | tsr_id=%s assignment_id=%s user_id=%s fields=%s",
            tsr_id,
            assignment_id,
            user_id,
            list(updates.keys()),
        )
        return entry
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating TSR entry | tsr_id=%s assignment_id=%s user_id=%s",
            tsr_id,
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to update TSR")


@retry_on_disconnect()
def get_my_tsr_entries(user_id: str, assignment_id: UUID) -> list:
    """
    Return all TSR submissions the requesting user made for a given assignment.

    Each entry is in the same shape as _fetch_tsr_entries (tsr_id,
    evaluator_id, evaluator_name, evaluatee_name, percent_contribution,
    positive_feedback, plus Scrum Master fields).
    """
    try:
        client = get_client()

        assignment_result = (
            client.table("assignments")
            .select("id, assignment_type, status")
            .eq("id", str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment_type = assignment_result.data[0].get("assignment_type")
        if assignment_type == "interest_form":
            # Interest forms do not write TSR rows; keep response shape stable.
            return []
        if assignment_type != "tsr" or assignment_result.data[0].get("status") != "publish":
            raise HTTPException(
                status_code=400, detail="Assignment is not a published TSR assignment"
            )

        tsr_result = (
            client.table("TSRs")
            .select(_TSR_COLUMNS)
            .eq("assignment_id", str(assignment_id))
            .eq("evaluator_id", user_id)
            .execute()
        )
        rows = _latest_tsr_rows(tsr_result.data or [])
        if not rows:
            return []

        profile_map = _profiles_by_id(client, _people_in(rows))
        return [_serialize_tsr_entry(row, profile_map) for row in rows]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching user TSR entries | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TSR entries")


def get_tsr_responses_about_user(
    user_id: str,
    assignment_id: UUID,
    evaluatee_id: UUID,
) -> list:
    """
    Return all TSR responses about a specific user (evaluatee) for an assignment.

    Instructor only. The requester must be the class instructor for the assignment's class.

    Each entry is in the same shape as _fetch_tsr_entries (tsr_id, evaluator_id,
    evaluator_name, evaluatee_name, percent_contribution, positive_feedback,
    plus optional constructive_feedback and Scrum Master fields).
    """
    try:
        client = get_client()

        assignment_result = (
            client.table("assignments")
            .select("id, assignment_type, class_id")
            .eq("id", str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get("assignment_type") != "tsr":
            raise HTTPException(status_code=400, detail="Assignment is not a TSR-type assignment")

        _require_class_instructor(user_id, assignment["class_id"])

        tsr_result = (
            client.table("TSRs")
            .select(
                "id, evaluator_id, evaluatee_id, percent_contribution, "
                "positive_feedback, constructive_feedback, scrum_master_tickets, "
                "scrum_master_assessment, scrum_master_notes"
            )
            .eq("assignment_id", str(assignment_id))
            .eq("evaluatee_id", str(evaluatee_id))
            .execute()
        )
        rows = tsr_result.data or []
        if not rows:
            return []

        profile_map = _profiles_by_id(client, _people_in(rows))
        return [_serialize_tsr_entry(row, profile_map) for row in rows]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching TSR responses about user | assignment_id=%s evaluatee=%s requester=%s",
            assignment_id,
            evaluatee_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TSR responses")


def get_instructor_tsr_overview(user_id: str, assignment_id: UUID) -> dict:
    """
    TSR responses for an assignment, grouped by project.

    The class instructor sees every project; a class TA sees the teams they are
    the assigned TA of. Returns the assignment row, the visible projects, every
    TSR entry (latest row per evaluator/evaluatee/project) and, per project with
    members, who has not submitted yet.

    Round trips: the assignment; then the class, the caller's enrollment, the
    projects (with member ids embedded) and the TSR rows concurrently; then one
    profile read for evaluators, evaluatees and non-submitters — 6 in 3 waves
    (was 7 sequential for the instructor, 9 for a TA).
    """
    try:
        client = get_client()
        aid = str(assignment_id)

        assignment_result = (
            client.table("assignments")
            .select("id, Title, open_date, close_date, status, class_id, assignment_type")
            .eq("id", aid)
            .limit(1)
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment = assignment_result.data[0]
        if assignment.get("assignment_type") != "tsr":
            raise HTTPException(status_code=400, detail="Assignment is not a TSR-type assignment")

        cid = str(assignment["class_id"])
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "role": lambda: authz.get_enrollment_role(client, cid, user_id),
                "projects": lambda: (
                    (
                        client.table("projects")
                        .select("id, name, assigned_ta_id, project_members(user_id)")
                        .eq("class_id", cid)
                        .order("name")
                        .execute()
                    ).data
                    or []
                ),
                "tsrs": lambda: _tsr_rows_for_assignment(client, aid),
            }
        )
        # Instructor -> every project (None); TA -> only the teams they oversee.
        allowed = _tsr_overview_scope(user_id, reads["class"], reads["role"], reads["projects"])
        projects = reads["projects"]
        rows = reads["tsrs"]
        if allowed is not None:
            projects = [p for p in projects if str(p["id"]) in allowed]
            rows = [r for r in rows if str(r.get("project_id")) in allowed]

        evaluators_by_project: dict[str, set[str]] = {}
        for r in rows:
            if r.get("project_id") and r.get("evaluator_id"):
                evaluators_by_project.setdefault(r["project_id"], set()).add(r["evaluator_id"])

        members_by_project = {
            p["id"]: [m["user_id"] for m in (p.get("project_members") or []) if m.get("user_id")]
            for p in projects
        }
        members_by_project = {pid: ids for pid, ids in members_by_project.items() if ids}
        non_submitter_ids = {
            uid
            for pid, ids in members_by_project.items()
            for uid in ids
            if uid not in evaluators_by_project.get(pid, set())
        }
        profile_map = _profiles_by_id(client, _people_in(rows) | non_submitter_ids)

        non_submitters_by_project: dict[str, list[dict]] = {}
        for pid, member_ids in members_by_project.items():
            submitted = evaluators_by_project.get(pid, set())
            ns_list = [
                {"id": uid, "name": profile_display_name(profile_map.get(uid, {}))}
                for uid in member_ids
                if uid not in submitted
            ]
            ns_list.sort(key=lambda x: x["name"])
            non_submitters_by_project[pid] = ns_list

        return {
            "assignment": assignment,
            "projects": [{"id": p["id"], "name": p.get("name")} for p in projects],
            "entries": [_serialize_tsr_entry(r, profile_map) for r in rows],
            "non_submitters_by_project": non_submitters_by_project,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching instructor TSR overview | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TSR overview")


def submit_feedback(
    user_id: str,
    assignment_id: UUID,
    q1_liked: str,
    q2_frustrating: str,
    q3_missing_feature: str,
    q4_bugs: str,
    q5_suggestions: str,
) -> dict:
    """Upsert a student's feedback submission for a published feedback assignment."""
    try:
        client = get_client()

        assignment_result = (
            client.table("assignments")
            .select("id, assignment_type, status, class_id")
            .eq("id", str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get("assignment_type") != "feedback":
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")
        if assignment.get("status") != "publish":
            raise HTTPException(status_code=400, detail="Assignment is not published")

        enrollment = (
            client.table("class_enrollments")
            .select("id")
            .eq("class_id", assignment["class_id"])
            .eq("user_id", user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(status_code=403, detail=authz.NOT_ENROLLED)

        row = {
            "assignment_id": str(assignment_id),
            "student_id": user_id,
            "q1_liked": q1_liked,
            "q2_frustrating": q2_frustrating,
            "q3_missing_feature": q3_missing_feature,
            "q4_bugs": q4_bugs,
            "q5_suggestions": q5_suggestions,
            "updated_at": datetime.datetime.now(datetime.UTC).isoformat(),
        }
        result = (
            client.table("feedback_submissions")
            .upsert(row, on_conflict="assignment_id,student_id")
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to save feedback")

        logger.info(
            "Feedback submitted | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error submitting feedback | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to save feedback")


def get_my_feedback(user_id: str, assignment_id: UUID) -> dict | None:
    """Return the student's own feedback submission, or None if not yet submitted."""
    try:
        client = get_client()

        assignment_result = (
            client.table("assignments")
            .select("id, assignment_type, status, class_id")
            .eq("id", str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get("assignment_type") != "feedback":
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")

        enrollment = (
            client.table("class_enrollments")
            .select("id")
            .eq("class_id", assignment["class_id"])
            .eq("user_id", user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(status_code=403, detail=authz.NOT_ENROLLED)

        result = (
            client.table("feedback_submissions")
            .select("*")
            .eq("assignment_id", str(assignment_id))
            .eq("student_id", user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching feedback submission | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch feedback submission")


def get_feedback_overview(user_id: str, assignment_id: UUID) -> dict:
    """Instructor view: all feedback submissions with student names + enrolled count.

    Round trips: the assignment; then the class, enrollments and submissions
    concurrently; then one profile read for submitters and non-submitters — 5 in
    3 waves (was 6 sequential).
    """
    try:
        client = get_client()
        aid = str(assignment_id)

        assignment_result = (
            client.table("assignments")
            .select("id, Title, open_date, close_date, status, class_id, assignment_type")
            .eq("id", aid)
            .limit(1)
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get("assignment_type") != "feedback":
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")

        cid = str(assignment["class_id"])
        reads = fan_out(
            {
                "class": lambda: authz.load_class(client, cid),
                "enrolled": lambda: [
                    row["user_id"]
                    for row in (
                        client.table("class_enrollments")
                        .select("user_id")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                    if row.get("user_id")
                ],
                "submissions": lambda: (
                    (
                        client.table("feedback_submissions")
                        .select("*")
                        .eq("assignment_id", aid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        cls = reads["class"]
        if cls is None:
            raise HTTPException(status_code=404, detail=authz.CLASS_NOT_FOUND)
        if str(cls.get("created_by")) != str(user_id):
            raise HTTPException(status_code=403, detail=authz.NOT_CLASS_INSTRUCTOR)

        enrolled, submissions = reads["enrolled"], reads["submissions"]
        submitted_ids = {s["student_id"] for s in submissions if s.get("student_id")}
        non_submitter_ids = [uid for uid in enrolled if uid not in submitted_ids]
        profile_map = _profiles_by_id(client, submitted_ids | set(non_submitter_ids))

        non_submitters = [
            {"id": uid, "name": profile_display_name(profile_map.get(uid, {}))}
            for uid in non_submitter_ids
        ]
        non_submitters.sort(key=lambda x: x["name"])

        enriched = [
            {
                "id": s["id"],
                "student_id": s["student_id"],
                "student_name": profile_display_name(profile_map.get(s.get("student_id", ""), {})),
                "q1_liked": s["q1_liked"],
                "q2_frustrating": s["q2_frustrating"],
                "q3_missing_feature": s["q3_missing_feature"],
                "q4_bugs": s["q4_bugs"],
                "q5_suggestions": s["q5_suggestions"],
                "created_at": s.get("created_at"),
                "updated_at": s.get("updated_at"),
            }
            for s in submissions
        ]

        return {
            "assignment": assignment,
            "submissions": enriched,
            "submitted_count": len(submissions),
            "total_count": len(enrolled),
            "non_submitters": non_submitters,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching feedback overview | assignment_id=%s user_id=%s",
            assignment_id,
            user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch feedback overview")


def get_my_submissions(user_id: str, class_id: UUID) -> dict:
    """The caller's own TSR and feedback submissions across a class's assignments.

    One request for what the student Assignments page and dashboard used to ask
    per assignment (``GET /{id}/tsrs`` for each TSR assignment plus
    ``GET /{id}/feedback/me`` for each feedback assignment) or per project.
    Readable by the class instructor or any enrolled member; only the caller's
    own rows are returned.

    Returns ``{"tsrs": [{assignment_id, project_id}], "feedback_assignment_ids": [...]}``
    — one entry per (TSR assignment, project) the caller evaluated for. At most
    5 queries in 2 waves.
    """
    try:
        client = get_client()
        cid = str(class_id)
        reads = fan_out(
            {
                "access": lambda: authz.require_class_access(client, user_id, cid),
                "assignments": lambda: (
                    (
                        client.table("assignments")
                        .select("id, assignment_type")
                        .eq("class_id", cid)
                        .execute()
                    ).data
                    or []
                ),
            }
        )
        tsr_ids = sorted(a["id"] for a in reads["assignments"] if a.get("assignment_type") == "tsr")
        feedback_ids = sorted(
            a["id"] for a in reads["assignments"] if a.get("assignment_type") == "feedback"
        )
        jobs = {}
        if tsr_ids:
            jobs["tsrs"] = lambda: (
                (
                    client.table("TSRs")
                    .select("assignment_id, project_id")
                    .eq("evaluator_id", user_id)
                    .in_("assignment_id", tsr_ids)
                    .execute()
                ).data
                or []
            )
        if feedback_ids:
            jobs["feedback"] = lambda: (
                (
                    client.table("feedback_submissions")
                    .select("assignment_id")
                    .eq("student_id", user_id)
                    .in_("assignment_id", feedback_ids)
                    .execute()
                ).data
                or []
            )
        found = fan_out(jobs)

        pairs = sorted(
            {
                (r["assignment_id"], r.get("project_id"))
                for r in found.get("tsrs", [])
                if r.get("assignment_id")
            },
            key=lambda pair: (pair[0], pair[1] or ""),
        )
        return {
            "tsrs": [{"assignment_id": aid, "project_id": pid} for aid, pid in pairs],
            "feedback_assignment_ids": sorted(
                {r["assignment_id"] for r in found.get("feedback", []) if r.get("assignment_id")}
            ),
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching own submissions | class_id=%s user_id=%s", class_id, user_id
        )
        raise HTTPException(status_code=500, detail="Failed to fetch submissions")
