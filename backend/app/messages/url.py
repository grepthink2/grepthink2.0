"""Routes for the messages feature."""
from fastapi import APIRouter
from app.messages import views

router = APIRouter(prefix="/api/messages", tags=["messages"])

router.get('/conversations')(views.list_conversations)
router.post('')(views.send_message)
router.get('/conversations/{conversation_id}/messages')(views.list_messages)
router.post('/conversations/{conversation_id}/read')(views.mark_conversation_read)
