"""Institution routes."""

from fastapi import APIRouter

from app.institutions import views

router = APIRouter(prefix="/api/institutions", tags=["institutions"])

router.get("")(views.list_institutions)
