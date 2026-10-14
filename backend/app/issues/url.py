"""Routes for the issue form."""

from fastapi import APIRouter

from app.issues import views

router = APIRouter(prefix="/api/issues", tags=["issues"])

router.post("")(views.submit_issue)
