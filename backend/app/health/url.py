"""
Health check routes
"""
from fastapi import APIRouter
from app.health import views

router = APIRouter(tags=["health"])

router.get('/health')(views.health_check)
