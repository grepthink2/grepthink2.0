"""Request/response layer for the scrum board feature (filled in by Tasks B4-B10)."""
from fastapi import Depends, HTTPException, Response, status

from app.dependencies import require_user
from app.scrum import controller
from app.scrum.models import (BoardResponse, CommentOut, CommentResponse,
                              CommentsListResponse, CreateCommentRequest,
                              CreateSprintRequest, CreateStoryRequest,
                              CreateTaskRequest, MoveTaskRequest, PrRefreshResponse,
                              SprintOut, SprintResponse, StoryOut, StoryResponse,
                              TaskOut, TaskResponse, UpdateSettingsRequest,
                              UpdateSprintRequest, UpdateStoryRequest,
                              UpdateTaskRequest)


def _todo(*_args, **_kwargs):
    raise HTTPException(status_code=501, detail="Not implemented")


def _task_out(row: dict) -> TaskOut:
    return TaskOut(**{k: row.get(k) for k in TaskOut.model_fields if k in row} |
                   {"comment_count": row.get("comment_count", 0)})


def _story_out(row: dict) -> StoryOut:
    return StoryOut(**{k: row.get(k) for k in StoryOut.model_fields if k in row} |
                    {"comment_count": row.get("comment_count", 0),
                     "tasks": [_task_out(t) for t in row.get("tasks", [])]})


def get_board(project_id: str, sprint_id: str | None = None,
              user_id: str = Depends(require_user)) -> BoardResponse:
    board = controller.get_board(project_id=project_id, user_id=user_id, sprint_id=sprint_id)
    return BoardResponse(**board)


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


def create_story(project_id: str, body: CreateStoryRequest,
                 user_id: str = Depends(require_user)) -> StoryResponse:
    row = controller.create_story(project_id=project_id, user_id=user_id,
                                  fields=body.model_dump(exclude_unset=True))
    return StoryResponse(message="Story created successfully", story=_story_out(row))


def update_story(story_id: str, body: UpdateStoryRequest,
                 user_id: str = Depends(require_user)) -> StoryResponse:
    row = controller.update_story(story_id=story_id, user_id=user_id,
                                  fields=body.model_dump(exclude_unset=True))
    return StoryResponse(message="Story updated successfully", story=_story_out(row))


def create_task(story_id: str, body: CreateTaskRequest,
                user_id: str = Depends(require_user)) -> TaskResponse:
    row = controller.create_task(story_id=story_id, user_id=user_id,
                                 fields=body.model_dump(exclude_unset=True))
    return TaskResponse(message="Task created successfully", task=_task_out(row))


def update_task(task_id: str, body: UpdateTaskRequest,
                user_id: str = Depends(require_user)) -> TaskResponse:
    row = controller.update_task(task_id=task_id, user_id=user_id,
                                 fields=body.model_dump(exclude_unset=True))
    return TaskResponse(message="Task updated successfully", task=_task_out(row))


def delete_task(task_id: str, user_id: str = Depends(require_user)) -> Response:
    controller.delete_task(task_id=task_id, user_id=user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def move_task(task_id: str, body: MoveTaskRequest,
              user_id: str = Depends(require_user)) -> TaskResponse:
    out = controller.move_task(task_id=task_id, user_id=user_id, to_status=body.to_status)
    return TaskResponse(message="Task moved successfully", task=_task_out(out["task"]))


def list_story_comments(story_id: str, user_id: str = Depends(require_user)) -> CommentsListResponse:
    rows = controller.list_comments(parent_kind="story", parent_id=story_id, user_id=user_id)
    return CommentsListResponse(comments=[CommentOut(**r) for r in rows])


def create_story_comment(story_id: str, body: CreateCommentRequest,
                         user_id: str = Depends(require_user)) -> CommentResponse:
    row = controller.create_comment(parent_kind="story", parent_id=story_id,
                                    user_id=user_id, body_md=body.body_md)
    return CommentResponse(message="Comment added successfully",
                           comment=CommentOut(**row, author_name=""))


def list_task_comments(task_id: str, user_id: str = Depends(require_user)) -> CommentsListResponse:
    rows = controller.list_comments(parent_kind="task", parent_id=task_id, user_id=user_id)
    return CommentsListResponse(comments=[CommentOut(**r) for r in rows])


def create_task_comment(task_id: str, body: CreateCommentRequest,
                        user_id: str = Depends(require_user)) -> CommentResponse:
    row = controller.create_comment(parent_kind="task", parent_id=task_id,
                                    user_id=user_id, body_md=body.body_md)
    return CommentResponse(message="Comment added successfully",
                           comment=CommentOut(**row, author_name=""))



def refresh_pr_states(project_id: str, user_id: str = Depends(require_user)) -> PrRefreshResponse:
    return PrRefreshResponse(**controller.refresh_pr_states(project_id=project_id, user_id=user_id))
def ai_draft(project_id: str, user_id: str = Depends(require_user)): _todo()
