"""Routes for a team's project documents (attendance-style full paths under /api): a team's documents
hang off /projects/{project_id}/documents (and its board's stories, for the documents' story pickers, off
/projects/{project_id}/documents/stories), one document off /documents/{document_id}, and a class's list
off /classes/{class_id}/documents."""

from fastapi import APIRouter

from app.documents import views
from app.documents.models import DocumentStoriesResponse

router = APIRouter(prefix="/api", tags=["documents"])

router.get("/projects/{project_id}/documents")(views.list_project_documents)
router.get("/projects/{project_id}/documents/stories", response_model=DocumentStoriesResponse)(
    views.list_project_stories
)
router.post("/projects/{project_id}/documents", status_code=201)(views.create_document)
router.get("/documents/{document_id}")(views.get_document)
router.put("/documents/{document_id}")(views.save_document)
router.delete("/documents/{document_id}", status_code=204)(views.delete_document)
router.get("/documents/{document_id}/revisions")(views.list_revisions)
router.post("/documents/{document_id}/finalize")(views.finalize_document)
router.get("/documents/{document_id}/markdown")(views.get_document_markdown)
router.get("/classes/{class_id}/documents")(views.list_class_documents)
