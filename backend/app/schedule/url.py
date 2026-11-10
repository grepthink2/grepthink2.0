"""Schedule routes: the caller's schedule items in one class."""

from fastapi import APIRouter

from app.schedule import views

router = APIRouter(prefix="/api/schedule", tags=["schedule"])

router.get("")(views.get_schedule)
