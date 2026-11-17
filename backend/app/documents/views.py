"""Project documents views: parameters, the caller, and the answers.

Saving and finalizing are limited per signed-in user (``_documents_rate_key``): a save stores a revision
of up to 256 kB, and a finalize emails the team's TAs.
"""

from uuid import UUID

from fastapi import Depends, Query, Request, Response, status
from slowapi.util import get_remote_address

from app.dependencies import require_user
from app.documents import controller
from app.documents.models import (
    CreateDocumentRequest,
    FinalizeDocumentRequest,
    SaveDocumentRequest,
)
from app.limiter import limiter


def _caller(request: Request, user_id: str = Depends(require_user)) -> str:
    """The signed-in user, also kept on the request as its rate-limit key."""
    request.state.documents_rate_key = user_id
    return user_id


def _documents_rate_key(request: Request) -> str:
    """A limited request's bucket: the signed-in user's own. On Vercel every request arrives from the
    proxy's address, so a limit keyed by address would be one bucket for everybody; the address is only
    a fallback (the limit is checked after ``_caller`` has run)."""
    return getattr(request.state, "documents_rate_key", None) or get_remote_address(request)


def list_project_documents(project_id: UUID, user_id: str = Depends(require_user)) -> dict:
    return controller.list_project_documents(project_id, user_id)


def create_document(
    project_id: UUID, data: CreateDocumentRequest, user_id: str = Depends(require_user)
) -> dict:
    return controller.create_document(project_id, user_id, data.kind, data.sprint_id)


def get_document(
    document_id: UUID,
    revision: int | None = Query(None, ge=1),
    user_id: str = Depends(require_user),
) -> dict:
    return controller.get_document(document_id, user_id, revision)


@limiter.limit("30/minute", key_func=_documents_rate_key)
def save_document(
    request: Request,
    document_id: UUID,
    data: SaveDocumentRequest,
    user_id: str = Depends(_caller),
) -> dict:
    return controller.save_document(document_id, user_id, data.body, data.base_revision)


def list_revisions(document_id: UUID, user_id: str = Depends(require_user)) -> dict:
    return controller.list_revisions(document_id, user_id)


@limiter.limit("10/minute", key_func=_documents_rate_key)
def finalize_document(
    request: Request,
    document_id: UUID,
    data: FinalizeDocumentRequest,
    user_id: str = Depends(_caller),
) -> dict:
    return controller.finalize_document(document_id, user_id, data.revision)


def delete_document(document_id: UUID, user_id: str = Depends(require_user)) -> Response:
    controller.delete_document(document_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_document_markdown(document_id: UUID, user_id: str = Depends(require_user)) -> Response:
    """The document as a Markdown file to download."""
    filename, text = controller.document_markdown(document_id, user_id)
    return Response(
        content=text,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def list_class_documents(class_id: UUID, user_id: str = Depends(require_user)) -> dict:
    return controller.list_class_documents(class_id, user_id)
