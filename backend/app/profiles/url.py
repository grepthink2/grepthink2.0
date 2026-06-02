"""
Profile routes
"""
from fastapi import APIRouter
from app.profiles import views

router = APIRouter(prefix="/api/profiles", tags=["profiles"])

router.get('/me')(views.get_my_profile)
router.patch('/me')(views.update_my_profile)
router.get('/{user_id}')(views.get_user_profile)
router.post('/send-edu-verification')(views.send_edu_verification)
router.post('/verify-edu-email')(views.verify_edu_email)
