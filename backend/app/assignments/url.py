"""
Assignment routes
"""
from fastapi import APIRouter
from app.assignments import views

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

router.post('')(views.create_assignment)
router.patch('/{assignment_id}')(views.update_assignment)
router.get('/{assignment_id}/tsrs')(views.get_my_tsrs)
router.patch('/{assignment_id}/tsrs/{tsr_id}')(views.update_tsr_entry)
router.get('')(views.get_assignments)
