"""
Assignment business logic
"""
import datetime
from typing import Optional
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase


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
            assignment_data["assignment_type"] = assignment_type

        result = _client().table('assignments').insert(assignment_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create assignment")

        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating assignment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create assignment: {str(e)}")


def _fetch_tsr_entries(client, assignment_id: str) -> list:
    """
    Return TSR data for all submissions linked to a given assignment_id.

    Each entry always includes tsr_id, evaluator_id, evaluator_name,
    evaluatee_name, percent_contribution, and positive_feedback.
    constructive_feedback and scrum_master_notes are only included when
    they are non-empty.

    Because every project member evaluates every other member independently,
    multiple entries can exist for the same evaluatee (one per evaluator).
    evaluator_id is included so callers can identify their own submission
    when using the update endpoint.
    """
    tsr_result = (
        client.table('TSRs')
        .select(
            'id, evaluator_id, evaluatee_id, percent_contribution, '
            'positive_feedback, constructive_feedback, scrum_master_notes'
        )
        .eq('assignment_id', assignment_id)
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
        .select('id, name, email')
        .in_('id', all_user_ids)
        .execute()
    )
    profile_map = {p['id']: p for p in (profiles.data or [])}

    entries = []
    for row in rows:
        evaluator_profile = profile_map.get(row['evaluator_id'], {})
        evaluatee_profile = profile_map.get(row['evaluatee_id'], {})
        entry = {
            "tsr_id": row['id'],
            "evaluator_id": row['evaluator_id'],
            "evaluator_name": evaluator_profile.get('name') or evaluator_profile.get('email'),
            "evaluatee_name": evaluatee_profile.get('name') or evaluatee_profile.get('email'),
            "percent_contribution": row['percent_contribution'],
            "positive_feedback": row['positive_feedback'],
        }
        if row.get('constructive_feedback'):
            entry["constructive_feedback"] = row['constructive_feedback']
        if row.get('scrum_master_notes'):
            entry["scrum_master_notes"] = row['scrum_master_notes']
        entries.append(entry)
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
    plus scrum_master_notes when non-empty.
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
            updates['assignment_type'] = assignment_type

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

        effective_type = assignment_type or assignment.get('assignment_type')
        if effective_type == 'tsr':
            assignment['tsrs'] = _fetch_tsr_entries(client, str(assignment_id))

        return assignment
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating assignment: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update assignment: {str(e)}")


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
    except Exception as e:
        print(f"Error fetching assignments: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch assignments: {str(e)}")


def update_tsr_entry(
    user_id: str,
    assignment_id: UUID,
    tsr_id: UUID,
    percent_contribution: Optional[int] = None,
    positive_feedback: Optional[str] = None,
    constructive_feedback: Optional[str] = None,
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
                'positive_feedback, constructive_feedback, scrum_master_notes'
            )
            .eq('id', str(tsr_id))
            .execute()
        )
        row = updated_rows.data[0]
        profile_ids = list({row['evaluator_id'], row['evaluatee_id']})
        profiles_result = (
            client.table('profiles')
            .select('id, name, email')
            .in_('id', profile_ids)
            .execute()
        )
        profile_map = {p['id']: p for p in (profiles_result.data or [])}
        evaluator_profile = profile_map.get(row['evaluator_id'], {})
        evaluatee_profile = profile_map.get(row['evaluatee_id'], {})

        entry = {
            "tsr_id": row['id'],
            "evaluator_id": row['evaluator_id'],
            "evaluator_name": evaluator_profile.get('name') or evaluator_profile.get('email'),
            "evaluatee_name": evaluatee_profile.get('name') or evaluatee_profile.get('email'),
            "percent_contribution": row['percent_contribution'],
            "positive_feedback": row['positive_feedback'],
        }
        if row.get('constructive_feedback'):
            entry["constructive_feedback"] = row['constructive_feedback']
        if row.get('scrum_master_notes'):
            entry["scrum_master_notes"] = row['scrum_master_notes']

        return entry
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error updating TSR entry: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update TSR: {str(e)}")
