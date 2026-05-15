"""
Staffing / Interest-Form routes.
"""
from fastapi import APIRouter

from app.staffing import views

router = APIRouter(prefix="/api/staffing", tags=["staffing"])

# Student-facing.
router.post("/interest")(views.submit_interest)
router.post("/{class_id}/submission")(views.submit_form)
router.get("/{class_id}/my-interests")(views.get_my_interests)
router.get("/{class_id}/my-submission")(views.get_my_submission)

# Instructor-facing analytics.
router.get("/{class_id}/pref-by-student")(views.get_pref_by_student)
router.get("/{class_id}/pref-by-project")(views.get_pref_by_project)
router.get("/{class_id}/project-rank")(views.get_project_rank)
router.get("/{class_id}/project-availability")(views.get_project_availability)
router.get("/{class_id}/assignments")(views.get_assignments)
router.get("/{class_id}/students")(views.get_students_with_interest)

# Instructor-facing actions.
router.post("/{class_id}/assign")(views.assign)
router.post("/{class_id}/unassign")(views.unassign)
router.post("/{class_id}/auto-assign")(views.auto_assign)
