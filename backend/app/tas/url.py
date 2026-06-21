"""Teaching Assistant (TA) routes."""
from fastapi import APIRouter
from app.tas import views

router = APIRouter(prefix="/api/tas", tags=["tas"])

# Class-level TA management (instructor only).
router.get('/classes/{class_id}')(views.list_class_tas)
router.post('/classes/{class_id}/promote')(views.promote_to_ta)
router.post('/classes/{class_id}/demote')(views.demote_ta)

# Class-level role lookups for the current user.
router.get('/classes/{class_id}/my-role')(views.get_my_enrollment_role)
router.get('/classes/{class_id}/review-targets')(views.get_ta_review_targets)

# Project-level TA assignment.
router.get('/projects/{project_id}')(views.list_project_tas)
router.post('/projects/{project_id}/assign')(views.assign_ta_to_project)
router.delete('/projects/{project_id}/tas/{target_user_id}')(views.remove_ta_from_project)
