"""
Health check routes
"""
from fastapi import APIRouter

router = APIRouter(tags=["health"])


@router.get('/health')
def health_check():
    """Basic health check endpoint"""
    return {"status": "healthy", "service": "backend"}
