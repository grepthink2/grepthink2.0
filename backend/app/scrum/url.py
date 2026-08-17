"""Routes for the scrum board feature.

Full paths under /api (attendance-style): board routes hang off
/projects/{project_id}/scrum/..., entity routes off /scrum/...
"""
from fastapi import APIRouter

from app.scrum import views

router = APIRouter(prefix="/api", tags=["scrum"])

router.get('/projects/{project_id}/scrum/board')(views.get_board)
router.patch('/projects/{project_id}/scrum/settings')(views.update_settings)
router.post('/projects/{project_id}/scrum/sprints')(views.create_sprint)
router.patch('/scrum/sprints/{sprint_id}')(views.update_sprint)
router.post('/projects/{project_id}/scrum/stories')(views.create_story)
router.patch('/scrum/stories/{story_id}')(views.update_story)
router.post('/scrum/stories/{story_id}/tasks')(views.create_task)
router.patch('/scrum/tasks/{task_id}')(views.update_task)
router.delete('/scrum/tasks/{task_id}')(views.delete_task)
router.post('/scrum/tasks/{task_id}/move')(views.move_task)
router.get('/scrum/stories/{story_id}/comments')(views.list_story_comments)
router.post('/scrum/stories/{story_id}/comments')(views.create_story_comment)
router.get('/scrum/tasks/{task_id}/comments')(views.list_task_comments)
router.post('/scrum/tasks/{task_id}/comments')(views.create_task_comment)
router.post('/projects/{project_id}/scrum/pr-refresh')(views.refresh_pr_states)
router.post('/projects/{project_id}/scrum/ai-draft')(views.ai_draft)
