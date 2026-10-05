"""Email routes: the outbox dispatcher, the Maileroo webhook, unsubscribe links, preferences."""

from fastapi import APIRouter

from app.outbox import views

router = APIRouter(prefix="/api/email", tags=["email"])

router.post("/dispatch")(views.dispatch)
router.post("/webhooks/maileroo")(views.maileroo_webhook)
router.get("/unsubscribe")(views.unsubscribe_info)
router.post("/unsubscribe")(views.unsubscribe)
router.get("/preferences")(views.get_email_preferences)
router.put("/preferences")(views.update_email_preferences)
