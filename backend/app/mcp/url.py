"""Routes for the MCP connector's consent page and Settings → Connected apps. The OAuth endpoints
themselves (/register, /authorize, /token, /revoke) and /mcp are the MCP SDK's (app/mcp/server.py)."""

from fastapi import APIRouter, status

from app.mcp import views

router = APIRouter(prefix="/api/mcp", tags=["mcp"])

router.get("/authorizations/{request_id}")(views.get_authorization)
router.post("/authorizations/{request_id}")(views.answer_authorization)
router.get("/connections")(views.list_connections)
router.delete("/connections/{client_id}", status_code=status.HTTP_204_NO_CONTENT)(views.disconnect)
