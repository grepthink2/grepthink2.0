"""The site's side of the MCP connector's sign-in: the consent page's two calls, and Settings →
Connected apps. All for the signed-in student only (a normal site session)."""

from fastapi import Depends, Response, status

from app.dependencies import require_user
from app.mcp import oauth
from app.mcp.models import AuthorizationAnswer


def get_authorization(request_id: str, user_id: str = Depends(require_user)):
    return oauth.authorization_details(request_id=request_id, user_id=user_id)


def answer_authorization(
    request_id: str, data: AuthorizationAnswer, user_id: str = Depends(require_user)
):
    return oauth.answer_authorization(request_id=request_id, user_id=user_id, approve=data.approve)


def list_connections(user_id: str = Depends(require_user)):
    return {"connections": oauth.list_connections(user_id=user_id)}


def disconnect(client_id: str, user_id: str = Depends(require_user)) -> Response:
    oauth.disconnect(user_id=user_id, client_id=client_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
