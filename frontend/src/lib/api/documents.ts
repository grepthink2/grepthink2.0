/** Project documents: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiClassDocument,
  ApiDocumentBody,
  ApiDocumentKind,
  ApiDocumentRevisionEntry,
  ApiDocumentSaved,
  ApiDocumentSlot,
  ApiProjectDocument,
} from './types';

export const documentsApi = {

  // ----- Project documents (app/documents backend) ---------------------------

  /** The team's Documents tab: every document it can have, made or not, in the tab's order. */
  getProjectDocuments: async (projectId: string) =>
    apiRequest<{ documents: ApiDocumentSlot[] }>(`/api/projects/${projectId}/documents`),

  /**
   * Make one of the team's documents (team members): a sprint report names its sprint, a project's
   * document none. Answers the new draft as `getDocument` does; 409 when the team already has it.
   */
  createDocument: async (projectId: string, kind: ApiDocumentKind, sprintId?: string) =>
    apiRequest<ApiProjectDocument>(`/api/projects/${projectId}/documents`, {
      method: 'POST',
      body: JSON.stringify(sprintId ? { kind, sprint_id: sprintId } : { kind }),
    }),

  /** One document at `revision`, else at the revision its reader opens on (see the type). */
  getDocument: async (documentId: string, revision?: number) =>
    apiRequest<ApiProjectDocument>(
      `/api/documents/${documentId}${revision != null ? `?revision=${revision}` : ''}`,
    ),

  /**
   * Save the whole body as a new revision (team members); the last writer wins. `baseRevision` is the
   * revision the edit started from: `overwrote` names a revision saved since that this save replaced.
   */
  saveDocument: async (documentId: string, body: ApiDocumentBody, baseRevision: number | null) =>
    apiRequest<ApiDocumentSaved>(`/api/documents/${documentId}`, {
      method: 'PUT',
      body: JSON.stringify({ body, base_revision: baseRevision }),
    }),

  /** The document's revisions, newest first, without their bodies. */
  getDocumentRevisions: async (documentId: string) =>
    apiRequest<{ revisions: ApiDocumentRevisionEntry[] }>(`/api/documents/${documentId}/revisions`),

  /**
   * Hand in `revision`, which must still be the head (409 otherwise): the board's sections are frozen
   * on it and the team's TAs are told. The team's Scrum Master, Product Owner, owner or admin only;
   * 409 with the first check that fails, e.g. "The sprint has not ended yet".
   */
  finalizeDocument: async (documentId: string, revision: number) =>
    apiRequest<ApiProjectDocument>(`/api/documents/${documentId}/finalize`, {
      method: 'POST',
      body: JSON.stringify({ revision }),
    }),

  /** Delete a document that was never finalized (409 otherwise), with its revisions. */
  deleteDocument: async (documentId: string) =>
    apiRequest<void>(`/api/documents/${documentId}`, { method: 'DELETE' }),

  /** The document as Markdown: the finalized revision of a final document, else the head. */
  getDocumentMarkdown: async (documentId: string) =>
    apiRequest<string>(
      `/api/documents/${documentId}/markdown`,
      { headers: { Accept: 'text/markdown' } },
      'text',
    ),

  /** Every document of the class's teams, for the class's instructor and TAs. */
  getClassDocuments: async (classId: string) =>
    apiRequest<{ documents: ApiClassDocument[] }>(`/api/classes/${classId}/documents`),
};
