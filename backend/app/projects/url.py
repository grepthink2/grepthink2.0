"""
Project management routes
"""
from fastapi import APIRouter
from app.projects import views

router = APIRouter(prefix="/api/projects", tags=["projects"])

router.post('')(views.create_project)
router.get('')(views.get_projects)
router.get('/pending-invites')(views.get_pending_team_invites)
router.get('/my-join-requests')(views.get_my_join_requests)
router.get('/{project_id}')(views.get_project)
router.patch('/{project_id}')(views.update_project)
router.delete('/{project_id}')(views.delete_project)
router.post('/request-join')(views.request_join)
router.post('/accept-request')(views.accept_request)
router.post('/reject-request')(views.reject_request)
router.post('/dismiss-request')(views.dismiss_request)
router.post('/cancel-request')(views.cancel_request)
router.post('/cancel-invite')(views.cancel_invite)
router.get('/{project_id}/members')(views.get_project_members)
router.post('/{project_id}/members')(views.add_project_member)
router.delete('/{project_id}/members/{user_id}')(views.remove_project_member)
router.post('/{project_id}/assign-product-owner')(views.assign_product_owner)
router.post('/{project_id}/assign-scrum-master')(views.assign_scrum_master)
router.post('/{project_id}/assign-admin')(views.assign_admin)
router.post('/{project_id}/remove-product-owner')(views.remove_product_owner)
router.post('/{project_id}/remove-scrum-master')(views.remove_scrum_master)
router.post('/{project_id}/remove-admin')(views.remove_admin)
router.get('/{project_id}/join-requests')(views.get_join_requests)
router.get('/{project_id}/pending-invites')(views.get_project_pending_invites)