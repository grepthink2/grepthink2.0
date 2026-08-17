"""Request/response layer for the scrum board feature (filled in by Tasks B4-B10)."""
from fastapi import Depends, HTTPException, Response, status

from app.dependencies import require_user
from app.scrum import controller
from app.scrum.models import (CreateSprintRequest, SprintOut, SprintResponse,
                              UpdateSettingsRequest, UpdateSprintRequest)


def _todo(*_args, **_kwargs):
    raise HTTPException(status_code=501, detail="Not implemented")

def get_board(project_id: str, user_id: str = Depends(require_user)): _todo()


def update_settings(project_id: str, body: UpdateSettingsRequest,
                    user_id: str = Depends(require_user)) -> Response:
    controller.update_settings(project_id=project_id, user_id=user_id,
                               estimate_scale=body.estimate_scale)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def create_sprint(project_id: str, body: CreateSprintRequest,
                  user_id: str = Depends(require_user)) -> SprintResponse:
    row = controller.create_sprint(project_id=project_id, user_id=user_id,
                                   name=body.name, starts_at=body.starts_at, ends_at=body.ends_at)
    return SprintResponse(message="Sprint created successfully", sprint=SprintOut(**{
        k: row[k] for k in ("id", "name", "starts_at", "ends_at", "status")}))


def update_sprint(sprint_id: str, body: UpdateSprintRequest,
                  user_id: str = Depends(require_user)) -> SprintResponse:
    row = controller.update_sprint(sprint_id=sprint_id, user_id=user_id,
                                   fields=body.model_dump(exclude_unset=True))
    return SprintResponse(message="Sprint updated successfully", sprint=SprintOut(**{
        k: row[k] for k in ("id", "name", "starts_at", "ends_at", "status")}))


def create_story(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_story(story_id: str, user_id: str = Depends(require_user)): _todo()
def create_task(story_id: str, user_id: str = Depends(require_user)): _todo()
def update_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def delete_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def move_task(task_id: str, user_id: str = Depends(require_user)): _todo()
def list_story_comments(story_id: str, user_id: str = Depends(require_user)): _todo()
def create_story_comment(story_id: str, user_id: str = Depends(require_user)): _todo()
def list_task_comments(task_id: str, user_id: str = Depends(require_user)): _todo()
def create_task_comment(task_id: str, user_id: str = Depends(require_user)): _todo()
def refresh_pr_states(project_id: str, user_id: str = Depends(require_user)): _todo()
def ai_draft(project_id: str, user_id: str = Depends(require_user)): _todo()
