"""Routes for the analytics feature (spec §6.3)."""

from fastapi import APIRouter

from app.analytics import views

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

router.get("/scope")(views.get_scope)
router.get("/dashboard")(views.get_dashboard)
