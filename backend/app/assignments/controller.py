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
    Returns the updated assignment row.
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

        if not updates:
            return assignment

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

        return result.data[0]
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
