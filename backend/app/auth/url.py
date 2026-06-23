"""
Authentication routes
"""
from fastapi import APIRouter
from app.auth import views

router = APIRouter(prefix="/api", tags=["auth"])

router.get('/test-auth')(views.test_auth)
router.get('/login-check')(views.login_check)
router.post('/create-user')(views.create_user)
router.post('/check-email')(views.check_email)
router.post('/check-user-exists')(views.check_user_exists)
