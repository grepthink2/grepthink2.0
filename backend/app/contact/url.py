"""Routes for the contact feature."""
from fastapi import APIRouter
from app.contact import views

router = APIRouter(prefix="/api/contact", tags=["contact"])

router.post('')(views.submit_contact)
