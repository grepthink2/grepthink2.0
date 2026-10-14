"""Routes for global search."""

from fastapi import APIRouter

from app.search import views

router = APIRouter(prefix="/api/search", tags=["search"])

router.get("/index", response_model_exclude_none=True)(views.get_search_index)
