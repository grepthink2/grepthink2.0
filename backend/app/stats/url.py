from fastapi import APIRouter, Request

from app.limiter import limiter
from app.stats import views

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get('/usercount')
@limiter.limit("30/minute")
async def get_user_count(request: Request):
    return views.get_user_count()
