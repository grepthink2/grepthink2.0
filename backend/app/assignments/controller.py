"""
Assignment business logic
"""
import datetime
import logging
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import (
    _TRANSIENT_HTTPX_ERRORS,
    retry_on_disconnect,
    service_client,
    supabase,
)
from app.utils.profiles import PROFILE_SELECT, profile_display_name

logger = logging.getLogger(__name__)
ALLOWED_ASSIGNMENT_TYPES = {"tsr", "interest_form", "feedback"}


def _client():
    return service_client if service_client else supabase


def _require_instructor(user_id: str) -> None:
    """Raise 403 if the user is not an instructor."""
    result = _client().table('profiles').select('role').eq('id', user_id).execute()
    if not result.data or result.data[0].get('role') != 'instructor':
        raise HTTPException(status_code=403, detail="Only instructors can perform this action")


def _require_class_instructor(user_id: str, class_id: str) -> None:
    """Raise 403/404 if the class doesn't exist or the instructor doesn't own it."""
    result = (
        _client()
        .table('classes')
        .select('id')
        .eq('id', class_id)
        .eq('created_by', user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Class not found or you don't have permission")


def create_assignment(
    user_id: str,
    class_id: UUID,
    title: str,
    open_date: datetime.date,
    close_date: datetime.date,
    status: str,
    assignment_type: Optional[str] = None,
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

        result = _client().table('assignments').insert(assignment_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")

        logger.info(
            "Assignment created | assignment_id=%s class_id=%s title=%r type=%s created_by=%s",
            result.data[0].get('id'), class_id, title, assignment_type, user_id,
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error creating assignment | class_id=%s title=%r user_id=%s",
            class_id, title, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to create assignment")


def _serialize_tsr_entry(row: dict, profile_map: dict) -> dict:
    """Build the canonical TSR entry shape from a row + profile lookup map.

    Always includes tsr_id, evaluator_id, evaluator_name, evaluatee_name,
    percent_contribution, positive_feedback, constructive_feedback, and
    Scrum Master fields.
    """
    evaluator_profile = profile_map.get(row['evaluator_id'], {})
    evaluatee_profile = profile_map.get(row['evaluatee_id'], {})
    entry = {
        "tsr_id": row['id'],
        "evaluator_id": row['evaluator_id'],
        "evaluatee_id": row['evaluatee_id'],
        "project_id": row.get('project_id'),
        "evaluator_name": profile_display_name(evaluator_profile),
        "evaluatee_name": profile_display_name(evaluatee_profile),
        "percent_contribution": row['percent_contribution'],
        "positive_feedback": row['positive_feedback'],
        "constructive_feedback": row.get('constructive_feedback') or '',
        "scrum_master_tickets": row.get('scrum_master_tickets') or '',
        "scrum_master_assessment": row.get('scrum_master_assessment') or '',
        "scrum_master_notes": row.get('scrum_master_notes') or '',
    }
    return entry


def _latest_tsr_rows(rows: list) -> list:
    """Keep one row per (evaluator, evaluatee, project); prefer newest created_at."""
    best: dict[tuple, dict] = {}
    for row in rows:
        key = (row.get('evaluator_id'), row.get('evaluatee_id'), row.get('project_id'))
        if not key[0] or not key[1]:
            continue
        prev = best.get(key)
        if not prev or (row.get('created_at') or '') >= (prev.get('created_at') or ''):
            best[key] = row
    return list(best.values())


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
    tsr_result = (
        client.table('TSRs')
        .select(
            'id, evaluator_id, evaluatee_id, project_id, percent_contribution, '
            'positive_feedback, constructive_feedback, scrum_master_tickets, '
            'scrum_master_assessment, scrum_master_notes, created_at'
        )
        .eq('assignment_id', assignment_id)
        .execute()
    )
    rows = _latest_tsr_rows(tsr_result.data or [])
    if not rows:
        return []

    all_user_ids = list(
        {r['evaluator_id'] for r in rows if r.get('evaluator_id')} |
        {r['evaluatee_id'] for r in rows if r.get('evaluatee_id')}
    )
    profiles = (
        client.table('profiles')
        .select(PROFILE_SELECT)
        .in_('id', all_user_ids)
        .execute()
    )
    profile_map = {p['id']: p for p in (profiles.data or [])}

    entries = [_serialize_tsr_entry(row, profile_map) for row in rows]
    return entries


def update_assignment(
    user_id: str,
    assignment_id: UUID,
    title: Optional[str],
    open_date: Optional[datetime.date],
    close_date: Optional[datetime.date],
    status: Optional[str],
    assignment_type: Optional[str] = None,
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
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('*')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment = assignment_result.data[0]
        _require_class_instructor(user_id, assignment.get('class_id'))

        updates: dict = {}
        if title is not None:
            updates['Title'] = title
        if open_date is not None:
            updates['open_date'] = open_date.isoformat()
        if close_date is not None:
            updates['close_date'] = close_date.isoformat()
        if status is not None:
            updates['status'] = status
        if assignment_type is not None:
            normalized_type = assignment_type.strip().lower()
            if normalized_type not in ALLOWED_ASSIGNMENT_TYPES:
                raise HTTPException(
                    status_code=400,
                    detail="assignment_type must be one of: tsr, interest_form, feedback",
                )
            updates['assignment_type'] = normalized_type

        if updates:
            effective_open = open_date or (
                datetime.date.fromisoformat(assignment['open_date']) if assignment.get('open_date') else None
            )
            effective_close = close_date or (
                datetime.date.fromisoformat(assignment['close_date']) if assignment.get('close_date') else None
            )
            if effective_open and effective_close and effective_open > effective_close:
                raise HTTPException(status_code=400, detail="open_date must be on or before close_date")

            result = (
                client.table('assignments')
                .update(updates)
                .eq('id', str(assignment_id))
                .execute()
            )
            if not result.data:
                raise HTTPException(status_code=500, detail="Failed to update assignment")
            assignment = result.data[0]

        effective_type = (
            assignment_type.strip().lower() if assignment_type else assignment.get('assignment_type')
        )
        if effective_type == 'tsr':
            assignment['tsrs'] = _fetch_tsr_entries(client, str(assignment_id))

        if updates:
            logger.info(
                "Assignment updated | assignment_id=%s user_id=%s fields=%s",
                assignment_id, user_id, list(updates.keys()),
            )
        return assignment
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating assignment | assignment_id=%s user_id=%s",
            assignment_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to update assignment")


def delete_assignment(user_id: str, assignment_id: UUID) -> None:
    """Delete an assignment (instructor who owns the class only)."""
    _require_instructor(user_id)
    try:
        client = _client()
        assignment_result = (
            client.table('assignments')
            .select('id, class_id')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        _require_class_instructor(user_id, assignment_result.data[0]['class_id'])
        client.table('assignments').delete().eq('id', str(assignment_id)).execute()
        logger.info("Assignment deleted | assignment_id=%s user_id=%s", assignment_id, user_id)
    except HTTPException:
        raise
    except Exception:
        logger.exception("Error deleting assignment | assignment_id=%s user_id=%s", assignment_id, user_id)
        raise HTTPException(status_code=500, detail="Failed to delete assignment")


def _enrich_instructor_tsr_stats(client, class_id: str, assignments: list) -> list:
    """Attach TSR response flags and team submission counts for instructor assignment lists."""
    tsr_ids = [a['id'] for a in assignments if a.get('assignment_type') == 'tsr']
    if not tsr_ids:
        return assignments

    projects_result = (
        client.table('projects')
        .select('id')
        .eq('class_id', class_id)
        .execute()
    )
    project_ids = [p['id'] for p in (projects_result.data or [])]

    projects_with_members: set[str] = set()
    if project_ids:
        memberships = (
            client.table('project_members')
            .select('project_id')
            .in_('project_id', project_ids)
            .execute()
        )
        for row in memberships.data or []:
            if row.get('project_id'):
                projects_with_members.add(row['project_id'])

    teams_total = len(projects_with_members)
    evaluators_by_assignment_project: dict[str, dict[str, set[str]]] = {}
    assignments_with_responses: set[str] = set()

    if project_ids and tsr_ids:
        tsr_result = (
            client.table('TSRs')
            .select('assignment_id, project_id, evaluator_id')
            .in_('assignment_id', tsr_ids)
            .in_('project_id', project_ids)
            .execute()
        )
        for row in tsr_result.data or []:
            aid = row.get('assignment_id')
            pid = row.get('project_id')
            eid = row.get('evaluator_id')
            if aid:
                assignments_with_responses.add(aid)
            if aid and pid and eid:
                evaluators_by_assignment_project.setdefault(aid, {}).setdefault(pid, set()).add(eid)

    for assignment in assignments:
        if assignment.get('assignment_type') != 'tsr':
            continue
        aid = assignment['id']
        assignment['has_tsr_responses'] = aid in assignments_with_responses
        assignment['teams_total'] = teams_total
        by_project = evaluators_by_assignment_project.get(aid, {})
        assignment['teams_submitted'] = sum(
            1 for pid in projects_with_members if by_project.get(pid)
        )

    return assignments


def get_assignments_for_class(user_id: str, class_id: UUID) -> list:
    """
    Return all assignments that belong to a class.

    - Instructors: must own the class; see all statuses.
    - Students: must be enrolled in the class; only see 'publish' assignments.
    """
    try:
        client = _client()

        profile_result = client.table('profiles').select('role').eq('id', user_id).execute()
        role = profile_result.data[0].get('role') if profile_result.data else None

        if role == 'instructor':
            class_check = (
                client.table('classes')
                .select('id')
                .eq('id', str(class_id))
                .eq('created_by', user_id)
                .execute()
            )
            if not class_check.data:
                raise HTTPException(status_code=403, detail="You do not own this class")

            result = (
                client.table('assignments')
                .select('*')
                .eq('class_id', str(class_id))
                .order('created_at', desc=True)
                .execute()
            )
            assignments = result.data or []
            assignments = _enrich_instructor_tsr_stats(client, str(class_id), assignments)
            return _enrich_instructor_feedback_stats(client, str(class_id), assignments)
        else:
            enrollment = (
                client.table('class_enrollments')
                .select('id')
                .eq('class_id', str(class_id))
                .eq('user_id', user_id)
                .execute()
            )
            if not enrollment.data:
                raise HTTPException(status_code=403, detail="You are not enrolled in this class")

            result = (
                client.table('assignments')
                .select('*')
                .eq('class_id', str(class_id))
                .eq('status', 'publish')
                .order('created_at', desc=True)
                .execute()
            )

        return result.data or []
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching assignments | class_id=%s user_id=%s",
            class_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch assignments")


def update_tsr_entry(
    user_id: str,
    assignment_id: UUID,
    tsr_id: UUID,
    percent_contribution: Optional[int] = None,
    positive_feedback: Optional[str] = None,
    constructive_feedback: Optional[str] = None,
    scrum_master_tickets: Optional[str] = None,
    scrum_master_assessment: Optional[str] = None,
    scrum_master_notes: Optional[str] = None,
) -> dict:
    """
    Update the editable fields of a single TSR linked to an assignment.

    Who can update:
    - The evaluator who originally submitted the TSR.
    - The class instructor.

    At least one field must be provided. Returns the updated TSR entry in the
    same shape as _fetch_tsr_entries (tsr_id, evaluatee_name,
    percent_contribution, positive_feedback, plus optional fields).
    """
    try:
        client = _client()

        # Fetch the TSR and verify it belongs to this assignment
        tsr_result = (
            client.table('TSRs')
            .select('id, evaluator_id, evaluatee_id, project_id, assignment_id')
            .eq('id', str(tsr_id))
            .execute()
        )
        if not tsr_result.data:
            raise HTTPException(status_code=404, detail="TSR not found")

        tsr = tsr_result.data[0]
        if tsr.get('assignment_id') != str(assignment_id):
            raise HTTPException(status_code=400, detail="TSR does not belong to this assignment")

        # Resolve class_id via project
        project_result = (
            client.table('projects')
            .select('class_id')
            .eq('id', tsr['project_id'])
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project linked to TSR not found")
        class_id = project_result.data[0]['class_id']

        # Permission: evaluator or class instructor
        is_evaluator = tsr['evaluator_id'] == user_id
        is_instructor = False
        if not is_evaluator:
            instructor_check = (
                client.table('classes')
                .select('id')
                .eq('id', class_id)
                .eq('created_by', user_id)
                .execute()
            )
            is_instructor = bool(instructor_check.data)

        if not is_evaluator and not is_instructor:
            raise HTTPException(
                status_code=403,
                detail="Only the TSR submitter or class instructor can update this TSR"
            )

        updates: dict = {}
        if percent_contribution is not None:
            updates['percent_contribution'] = percent_contribution
        if positive_feedback is not None:
            updates['positive_feedback'] = positive_feedback
        if constructive_feedback is not None:
            updates['constructive_feedback'] = constructive_feedback
        if scrum_master_tickets is not None:
            updates['scrum_master_tickets'] = scrum_master_tickets
        if scrum_master_assessment is not None:
            updates['scrum_master_assessment'] = scrum_master_assessment
        if scrum_master_notes is not None:
            updates['scrum_master_notes'] = scrum_master_notes

        if not updates:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        client.table('TSRs').update(updates).eq('id', str(tsr_id)).execute()

        # Return the entry in the same shape as _fetch_tsr_entries
        updated_rows = (
            client.table('TSRs')
            .select(
                'id, evaluator_id, evaluatee_id, percent_contribution, '
                'positive_feedback, constructive_feedback, scrum_master_tickets, '
                'scrum_master_assessment, scrum_master_notes'
            )
            .eq('id', str(tsr_id))
            .execute()
        )
        row = updated_rows.data[0]
        profile_ids = list({row['evaluator_id'], row['evaluatee_id']})
        profiles_result = (
            client.table('profiles')
            .select(PROFILE_SELECT)
            .in_('id', profile_ids)
            .execute()
        )
        profile_map = {p['id']: p for p in (profiles_result.data or [])}
        entry = _serialize_tsr_entry(row, profile_map)

        logger.info(
            "TSR entry updated | tsr_id=%s assignment_id=%s user_id=%s fields=%s",
            tsr_id, assignment_id, user_id, list(updates.keys()),
        )
        return entry
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error updating TSR entry | tsr_id=%s assignment_id=%s user_id=%s",
            tsr_id, assignment_id, user_id,
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
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, assignment_type, status')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment_type = assignment_result.data[0].get('assignment_type')
        if assignment_type == 'interest_form':
            # Interest forms do not write TSR rows; keep response shape stable.
            return []
        if assignment_type != 'tsr' or assignment_result.data[0].get('status') != 'publish':
            raise HTTPException(status_code=400, detail="Assignment is not a published TSR assignment")

        tsr_result = (
            client.table('TSRs')
            .select(
                'id, evaluator_id, evaluatee_id, project_id, percent_contribution, '
                'positive_feedback, constructive_feedback, scrum_master_tickets, '
                'scrum_master_assessment, scrum_master_notes, created_at'
            )
            .eq('assignment_id', str(assignment_id))
            .eq('evaluator_id', user_id)
            .execute()
        )
        rows = _latest_tsr_rows(tsr_result.data or [])
        if not rows:
            return []

        all_user_ids = list(
            {r['evaluator_id'] for r in rows if r.get('evaluator_id')} |
            {r['evaluatee_id'] for r in rows if r.get('evaluatee_id')}
        )
        profiles = (
            client.table('profiles')
            .select(PROFILE_SELECT)
            .in_('id', all_user_ids)
            .execute()
        )
        profile_map = {p['id']: p for p in (profiles.data or [])}

        entries = [_serialize_tsr_entry(row, profile_map) for row in rows]
        return entries
    except HTTPException:
        raise
    except _TRANSIENT_HTTPX_ERRORS:
        # Bubble to @retry_on_disconnect; if the retry also fails the
        # decorator re-raises and the framework returns 500.
        raise
    except Exception:
        logger.exception(
            "Error fetching user TSR entries | assignment_id=%s user_id=%s",
            assignment_id, user_id,
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
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, assignment_type, class_id')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get('assignment_type') != 'tsr':
            raise HTTPException(status_code=400, detail="Assignment is not a TSR-type assignment")

        _require_class_instructor(user_id, assignment['class_id'])

        tsr_result = (
            client.table('TSRs')
            .select(
                'id, evaluator_id, evaluatee_id, percent_contribution, '
                'positive_feedback, constructive_feedback, scrum_master_tickets, '
                'scrum_master_assessment, scrum_master_notes'
            )
            .eq('assignment_id', str(assignment_id))
            .eq('evaluatee_id', str(evaluatee_id))
            .execute()
        )
        rows = tsr_result.data or []
        if not rows:
            return []

        all_user_ids = list(
            {r['evaluator_id'] for r in rows if r.get('evaluator_id')} |
            {r['evaluatee_id'] for r in rows if r.get('evaluatee_id')}
        )
        profiles = (
            client.table('profiles')
            .select(PROFILE_SELECT)
            .in_('id', all_user_ids)
            .execute()
        )
        profile_map = {p['id']: p for p in (profiles.data or [])}

        entries = [_serialize_tsr_entry(row, profile_map) for row in rows]
        return entries
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching TSR responses about user | assignment_id=%s evaluatee=%s requester=%s",
            assignment_id, evaluatee_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch TSR responses")


def get_instructor_tsr_overview(user_id: str, assignment_id: UUID) -> dict:
    """
    Instructor overview of all TSR responses for an assignment, grouped by project.

    Returns the assignment row, class projects, and every TSR entry linked to the
    assignment (evaluator/evaluatee names, contributions, feedback).
    """
    try:
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, Title, open_date, close_date, status, class_id, assignment_type')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")

        assignment = assignment_result.data[0]
        if assignment.get('assignment_type') != 'tsr':
            raise HTTPException(status_code=400, detail="Assignment is not a TSR-type assignment")

        _require_class_instructor(user_id, assignment['class_id'])

        projects_result = (
            client.table('projects')
            .select('id, name')
            .eq('class_id', assignment['class_id'])
            .order('name')
            .execute()
        )
        projects = projects_result.data or []

        entries = _fetch_tsr_entries(client, str(assignment_id))

        return {
            'assignment': assignment,
            'projects': projects,
            'entries': entries,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching instructor TSR overview | assignment_id=%s user_id=%s",
            assignment_id, user_id,
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
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, assignment_type, status, class_id')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get('assignment_type') != 'feedback':
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")
        if assignment.get('status') != 'publish':
            raise HTTPException(status_code=400, detail="Assignment is not published")

        enrollment = (
            client.table('class_enrollments')
            .select('id')
            .eq('class_id', assignment['class_id'])
            .eq('user_id', user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(status_code=403, detail="You are not enrolled in this class")

        row = {
            'assignment_id': str(assignment_id),
            'student_id': user_id,
            'q1_liked': q1_liked,
            'q2_frustrating': q2_frustrating,
            'q3_missing_feature': q3_missing_feature,
            'q4_bugs': q4_bugs,
            'q5_suggestions': q5_suggestions,
            'updated_at': datetime.datetime.utcnow().isoformat(),
        }
        result = (
            client.table('feedback_submissions')
            .upsert(row, on_conflict='assignment_id,student_id')
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to save feedback")

        logger.info(
            "Feedback submitted | assignment_id=%s user_id=%s",
            assignment_id, user_id,
        )
        return result.data[0]
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error submitting feedback | assignment_id=%s user_id=%s",
            assignment_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to save feedback")


def get_my_feedback(user_id: str, assignment_id: UUID) -> Optional[dict]:
    """Return the student's own feedback submission, or None if not yet submitted."""
    try:
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, assignment_type, status, class_id')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get('assignment_type') != 'feedback':
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")

        enrollment = (
            client.table('class_enrollments')
            .select('id')
            .eq('class_id', assignment['class_id'])
            .eq('user_id', user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(status_code=403, detail="You are not enrolled in this class")

        result = (
            client.table('feedback_submissions')
            .select('*')
            .eq('assignment_id', str(assignment_id))
            .eq('student_id', user_id)
            .execute()
        )
        return result.data[0] if result.data else None
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching feedback submission | assignment_id=%s user_id=%s",
            assignment_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch feedback submission")


def get_feedback_overview(user_id: str, assignment_id: UUID) -> dict:
    """Instructor view: all feedback submissions with student names + enrolled count."""
    try:
        client = _client()

        assignment_result = (
            client.table('assignments')
            .select('id, Title, open_date, close_date, status, class_id, assignment_type')
            .eq('id', str(assignment_id))
            .execute()
        )
        if not assignment_result.data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        assignment = assignment_result.data[0]
        if assignment.get('assignment_type') != 'feedback':
            raise HTTPException(status_code=400, detail="Assignment is not a feedback assignment")

        _require_class_instructor(user_id, assignment['class_id'])

        enrolled_result = (
            client.table('class_enrollments')
            .select('user_id')
            .eq('class_id', assignment['class_id'])
            .execute()
        )
        total_count = len(enrolled_result.data or [])

        submissions_result = (
            client.table('feedback_submissions')
            .select('*')
            .eq('assignment_id', str(assignment_id))
            .execute()
        )
        submissions = submissions_result.data or []

        student_ids = [s['student_id'] for s in submissions if s.get('student_id')]
        profile_map: dict = {}
        if student_ids:
            profiles = (
                client.table('profiles')
                .select(PROFILE_SELECT)
                .in_('id', student_ids)
                .execute()
            )
            profile_map = {p['id']: p for p in (profiles.data or [])}

        enriched = [
            {
                'id': s['id'],
                'student_id': s['student_id'],
                'student_name': profile_display_name(profile_map.get(s.get('student_id', ''), {})),
                'q1_liked': s['q1_liked'],
                'q2_frustrating': s['q2_frustrating'],
                'q3_missing_feature': s['q3_missing_feature'],
                'q4_bugs': s['q4_bugs'],
                'q5_suggestions': s['q5_suggestions'],
                'created_at': s.get('created_at'),
                'updated_at': s.get('updated_at'),
            }
            for s in submissions
        ]

        return {
            'assignment': assignment,
            'submissions': enriched,
            'submitted_count': len(submissions),
            'total_count': total_count,
        }
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Error fetching feedback overview | assignment_id=%s user_id=%s",
            assignment_id, user_id,
        )
        raise HTTPException(status_code=500, detail="Failed to fetch feedback overview")


def _enrich_instructor_feedback_stats(client, class_id: str, assignments: list) -> list:
    """Attach feedback_submitted / feedback_total counts to feedback-type assignments."""
    feedback_ids = [a['id'] for a in assignments if a.get('assignment_type') == 'feedback']
    if not feedback_ids:
        return assignments

    enrolled_result = (
        client.table('class_enrollments')
        .select('user_id')
        .eq('class_id', class_id)
        .execute()
    )
    total_count = len(enrolled_result.data or [])

    subs_result = (
        client.table('feedback_submissions')
        .select('assignment_id, student_id')
        .in_('assignment_id', feedback_ids)
        .execute()
    )
    submitted_by: dict[str, int] = {}
    for row in subs_result.data or []:
        aid = row.get('assignment_id')
        if aid:
            submitted_by[aid] = submitted_by.get(aid, 0) + 1

    for assignment in assignments:
        if assignment.get('assignment_type') != 'feedback':
            continue
        aid = assignment['id']
        assignment['feedback_submitted'] = submitted_by.get(aid, 0)
        assignment['feedback_total'] = total_count

    return assignments
