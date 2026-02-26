"""
TSR routes
"""
from fastapi import APIRouter
from app.tsr import views

router = APIRouter(prefix="/api/tsrs", tags=["tsrs"])

router.post('')(views.submit_tsr)
router.get('/{project_id}')(views.view_project_tsrs)
router.get('/{project_id}/submitted')(views.get_submitted_tsrs)
router.get('/{project_id}/received')(views.get_received_tsrs)
