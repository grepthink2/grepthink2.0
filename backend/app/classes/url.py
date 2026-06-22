"""
Class management routes
"""
from fastapi import APIRouter
from app.classes import views

router = APIRouter(prefix="/api/classes", tags=["classes"])

router.post('')(views.create_class)
router.get('')(views.get_classes)
router.get('/{class_id}')(views.get_class)
router.patch('/{class_id}/status')(views.update_class_status)
router.post('/join')(views.join_class)
router.post('/{class_id}/invite')(views.invite_student)
router.get('/{class_id}/roster')(views.get_class_roster)
router.post('/{class_id}/roster')(views.upload_class_roster)
router.get('/{class_id}/students')(views.get_class_students)
router.delete('/{class_id}/students/{student_id}')(views.remove_student)
router.delete('/{class_id}/leave')(views.leave_class)
router.post('/{class_id}/students/bulk-invite')(views.bulk_invite)
router.get('/{class_id}/projects')(views.get_class_projects)
router.get('/{class_id}/turn-in-stats')(views.get_class_turn_in_stats)
