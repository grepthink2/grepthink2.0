"""Routes for the notifications feature."""
from fastapi import APIRouter

from app.notifications import views

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

router.get("")(views.list_notifications)
router.post("/read-all")(views.mark_all_read)
router.post("/{notification_id}/read")(views.mark_notification_read)
