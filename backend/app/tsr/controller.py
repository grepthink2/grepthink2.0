"""
TSR business logic
"""
from uuid import UUID
from fastapi import HTTPException
from app.database.client import service_client, supabase
from app.tsr.models import CreateTSRRequest


TSR_FIELDS = (
    'id, evaluator_id, evaluatee_id, project_id, week, '
    'percent_contribution, positive_feedback, constructive_feedback, '
    'scrum_master_notes, assignment_id, created_at'
)


def _client():
    return service_client if service_client else supabase


def _enrich_tsrs(client, tsrs: list) -> list:
    """Attach evaluator_email and evaluatee_email to each TSR dict."""
    all_ids = list(
        {r['evaluator_id'] for r in tsrs if r.get('evaluator_id')} |
        {r['evaluatee_id'] for r in tsrs if r.get('evaluatee_id')}
    )
    if not all_ids:
        return tsrs
    profiles = client.table('profiles').select('id, email, name').in_('id', all_ids).execute()
    profile_map = {p['id']: p for p in (profiles.data or [])}
    for tsr in tsrs:
        ev_profile = profile_map.get(tsr.get('evaluator_id'), {})
        ee_profile = profile_map.get(tsr.get('evaluatee_id'), {})
        tsr['evaluator_email'] = ev_profile.get('email')
        tsr['evaluator_name'] = ev_profile.get('name') or ev_profile.get('email')
        tsr['evaluatee_email'] = ee_profile.get('email')
        tsr['evaluatee_name'] = ee_profile.get('name') or ee_profile.get('email')
    return tsrs


def _get_project_role(client, project_id: str, user_id: str) -> str:
    """Return the user's role in a project, or raise 403 if not a member."""
    membership = (
        client.table('project_members')
        .select('role')
        .eq('project_id', project_id)
        .eq('user_id', user_id)
        .execute()
    )
    if not membership.data:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return membership.data[0]['role']


def create_tsr(user_id: str, data: CreateTSRRequest) -> dict:
    """
    Submit a new TSR.

    Validates:
    - The project exists.
    - The evaluator (submitting user) is enrolled in the class the project belongs to.
    - If assignment_id is provided, it must belong to the same class and have assignment_type='tsr'.
    """
    try:
        client = _client()

        # Resolve project → class
        project_result = (
            client.table('projects')
            .select('id, class_id')
            .eq('id', str(data.project_id))
            .execute()
        )
        if not project_result.data:
            raise HTTPException(status_code=404, detail="Project not found")

        class_id = project_result.data[0].get('class_id')

        # Evaluator must be enrolled in the class
        enrollment = (
            client.table('class_enrollments')
            .select('id')
            .eq('class_id', str(class_id))
            .eq('user_id', user_id)
            .execute()
        )
        if not enrollment.data:
            raise HTTPException(
                status_code=403,
                detail="You must be enrolled in this project's class to submit a TSR",
            )

        # Validate assignment_id if provided
        if data.assignment_id:
            assignment_result = (
                client.table('assignments')
                .select('id, assignment_type, class_id')
                .eq('id', str(data.assignment_id))
                .execute()
            )
            if not assignment_result.data:
                raise HTTPException(status_code=404, detail="Assignment not found")
            assignment = assignment_result.data[0]
            if assignment.get('assignment_type') != 'tsr':
                raise HTTPException(status_code=400, detail="Assignment is not a TSR-type assignment")
            if assignment.get('class_id') != str(class_id):
                raise HTTPException(status_code=400, detail="Assignment does not belong to this project's class")

        tsr_data = {
            "evaluator_id": user_id,
            "evaluatee_id": str(data.evaluatee_id),
            "project_id": str(data.project_id),
            "week": data.week,
            "percent_contribution": data.percent_contribution,
            "positive_feedback": data.positive_feedback,
            "constructive_feedback": data.constructive_feedback,
            "scrum_master_notes": data.scrum_master_notes,
        }
        if data.assignment_id:
            tsr_data["assignment_id"] = str(data.assignment_id)

        result = client.table('TSRs').insert(tsr_data).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to create TSR")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error creating TSR: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create TSR: {str(e)}")


def view_tsrs(user_id: str, project_id: UUID) -> list:
    """
    View all TSRs for a project.
    Admin / scrum master see everything; others see only their own submitted TSRs.
    """
    try:
        client = _client()

        user_role = _get_project_role(client, str(project_id), user_id)

        if user_role in ("admin", "scrum master"):
            result = (
                client.table('TSRs')
                .select(TSR_FIELDS)
                .eq('project_id', str(project_id))
                .order('week')
                .order('created_at')
                .execute()
            )
        else:
            result = (
                client.table('TSRs')
                .select(TSR_FIELDS)
                .eq('project_id', str(project_id))
                .eq('evaluator_id', user_id)
                .order('week')
                .order('created_at')
                .execute()
            )

        return _enrich_tsrs(client, result.data or [])
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching TSRs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch TSRs: {str(e)}")


def get_tsrs_submitted_by(
    requester_id: str,
    project_id: UUID,
    target_user_id: str | None = None,
    week: int | None = None,
) -> list:
    """
    TSRs submitted (evaluator) by a user in a project.
    Any member sees their own; admin/scrum master can specify target_user_id.
    Optionally filtered by week.
    """
    try:
        client = _client()

        requester_role = _get_project_role(client, str(project_id), requester_id)
        subject_id = target_user_id or requester_id

        if subject_id != requester_id and requester_role not in ('admin', 'scrum master'):
            raise HTTPException(
                status_code=403,
                detail="Only admins and scrum masters can view another member's submitted TSRs",
            )

        query = (
            client.table('TSRs')
            .select(TSR_FIELDS)
            .eq('project_id', str(project_id))
            .eq('evaluator_id', subject_id)
        )
        if week is not None:
            query = query.eq('week', week)

        result = query.order('week').order('created_at').execute()
        return _enrich_tsrs(client, result.data or [])
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching submitted TSRs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch submitted TSRs: {str(e)}")


def get_tsrs_received_by(
    requester_id: str,
    project_id: UUID,
    target_user_id: str | None = None,
    week: int | None = None,
) -> list:
    """
    TSRs received (evaluatee) by a user in a project.
    Any member sees their own; admin/scrum master can specify target_user_id.
    Optionally filtered by week.
    """
    try:
        client = _client()

        requester_role = _get_project_role(client, str(project_id), requester_id)
        subject_id = target_user_id or requester_id

        if subject_id != requester_id and requester_role not in ('admin', 'scrum master'):
            raise HTTPException(
                status_code=403,
                detail="Only admins and scrum masters can view another member's received TSRs",
            )

        query = (
            client.table('TSRs')
            .select(TSR_FIELDS)
            .eq('project_id', str(project_id))
            .eq('evaluatee_id', subject_id)
        )
        if week is not None:
            query = query.eq('week', week)

        result = query.order('week').order('created_at').execute()
        return _enrich_tsrs(client, result.data or [])
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error fetching received TSRs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch received TSRs: {str(e)}")
