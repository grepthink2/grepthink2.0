"""
Class management routes
"""
from fastapi import APIRouter
from app.classes import views

router = APIRouter(prefix="/api/classes", tags=["classes"])

router.post('')(views.create_class)
router.get('')(views.get_classes)
router.get('/{class_id}')(views.get_class)
router.post('/join')(views.join_class)
router.post('/{class_id}/invite')(views.invite_student)
router.get('/{class_id}/students')(views.get_class_students)
router.get('/{class_id}/projects')(views.get_class_projects)
