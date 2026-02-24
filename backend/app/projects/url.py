"""
Project management routes
"""
from fastapi import APIRouter
from app.projects import views

router = APIRouter(prefix="/api/projects", tags=["projects"])

router.post('')(views.create_project)
router.get('')(views.get_projects)
router.get('/{project_id}')(views.get_project)
router.patch('/{project_id}')(views.update_project)
router.post('/request-join')(views.request_join)
router.post('/accept-request')(views.accept_request)
router.post('/reject-request')(views.reject_request)
router.get('/{project_id}/members')(views.get_project_members)
router.get('/{project_id}/join-requests')(views.get_join_requests)
router.post('/{project_id}/role')(views.set_role)
