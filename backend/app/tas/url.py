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

# Project-level: the team's assigned TA (0 or 1).
router.get('/projects/{project_id}')(views.list_project_tas)

# End-of-quarter review: instructor toggles the class window; a TA self-appoints
# (or the instructor appoints) the team's additional reviewer.
router.post('/classes/{class_id}/review-window')(views.set_review_window)
router.get('/projects/{project_id}/review-tas')(views.list_project_review_tas)
router.post('/projects/{project_id}/review-tas')(views.set_review_ta)
router.delete('/projects/{project_id}/review-tas/{target_user_id}')(views.release_review_ta)

# Final Reviews schedule: the class-wide shared Zoom room + one review slot per
# team (both instructor-set); the schedule read is for the instructor + class TAs.
router.get('/classes/{class_id}/final-reviews')(views.get_final_review_schedule)
router.post('/classes/{class_id}/review-zoom')(views.set_review_zoom)
router.post('/projects/{project_id}/review-time')(views.set_final_review_time)

# Final Reviews workspace: per-team scores (Home TA categories, Review TA +
# instructor overalls) and the Review-TA structured notes form.
router.get('/projects/{project_id}/final-review')(views.get_final_review_detail)
router.put('/projects/{project_id}/final-review/scores')(views.save_final_review_scores)
router.put('/projects/{project_id}/final-review/notes')(views.save_final_review_notes)
