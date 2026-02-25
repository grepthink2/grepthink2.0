"""
Assignment routes
"""
from fastapi import APIRouter
from app.assignments import views

router = APIRouter(prefix="/api/assignments", tags=["assignments"])

router.post('')(views.create_assignment)
router.patch('/{assignment_id}')(views.update_assignment)
router.get('')(views.get_assignments)
