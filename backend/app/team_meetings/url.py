"""
Team meetings routes — a team's one-off meetings, under its project.

``/meetings`` (plural) is this module; ``/meeting`` (singular) is a TA's weekly slot in
``app/attendance``. No path here equals one the projects router registers.
"""

from fastapi import APIRouter

from app.team_meetings import views

router = APIRouter(prefix="/api/projects", tags=["team-meetings"])

router.get("/{project_id}/meetings")(views.list_team_meetings)
router.post("/{project_id}/meetings")(views.create_team_meeting)
router.patch("/{project_id}/meetings/{meeting_id}")(views.update_team_meeting)
router.delete("/{project_id}/meetings/{meeting_id}", status_code=204)(views.delete_team_meeting)
