"""Request/response layer for the scrum board feature (filled in by Tasks B4-B10)."""
from fastapi import Depends, HTTPException

from app.dependencies import require_user


def _todo(*_args, **_kwargs):
    raise HTTPException(status_code=501, detail="Not implemented")

def get_board(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_settings(project_id: str, user_id: str = Depends(require_user)): _todo()
def create_sprint(project_id: str, user_id: str = Depends(require_user)): _todo()
def update_sprint(sprint_id: str, user_id: str = Depends(require_user)): _todo()
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
