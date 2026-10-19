"""
Team meetings views — parameter handling and responses.

A create or an edit answers with the meeting itself; the list answers with the meetings and
whether the caller may change them.
"""

from uuid import UUID

from fastapi import Depends, Response, status

from app.dependencies import require_user
from app.team_meetings import controller
from app.team_meetings.models import TeamMeetingCreate, TeamMeetingUpdate


def list_team_meetings(project_id: UUID, user_id: str = Depends(require_user)):
    return controller.list_team_meetings(project_id, user_id)


def create_team_meeting(
    project_id: UUID, data: TeamMeetingCreate, user_id: str = Depends(require_user)
):
    return controller.create_team_meeting(project_id, user_id, data)


def update_team_meeting(
    project_id: UUID,
    meeting_id: UUID,
    data: TeamMeetingUpdate,
    user_id: str = Depends(require_user),
):
    return controller.update_team_meeting(project_id, meeting_id, user_id, data)


def delete_team_meeting(
    project_id: UUID, meeting_id: UUID, user_id: str = Depends(require_user)
) -> Response:
    controller.delete_team_meeting(project_id, meeting_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
