import type { BadgeStatus } from '@components/Badge/badgeStatus';
import type { ApiDocumentRevisionSource, ApiDocumentStatus } from '@/lib/api';

/**
 * Where a document stands, as its badge says it: not made yet, a draft, final, or final and saved
 * again since it was handed in (it stays final at its finalized revision; the API's `edited_since`).
 */
export type DocumentState = 'not_started' | 'draft' | 'final' | 'edited_since';

/** The fields of a document (the tab's summary, the class's row or the page's) that decide its state. */
interface StateFields {
  status: ApiDocumentStatus;
  edited_since: boolean;
}

/** A document's state; `not_started` for a place on the tab whose document the team has not made. */
export function documentState(doc: StateFields | null | undefined): DocumentState {
  if (!doc) return 'not_started';
  if (doc.status === 'final') return doc.edited_since ? 'edited_since' : 'final';
  return 'draft';
}

/** Each state's badge: "Not started", "Draft", "Final", "Final · edited since". */
export const STATE_BADGE: Record<DocumentState, BadgeStatus> = {
  not_started: 'document.not_started',
  draft: 'document.draft',
  final: 'document.final',
  edited_since: 'document.edited_since',
};

/** A revision's source badge: "Started" for a new document's first revision, "Edited" for a save. */
export const SOURCE_BADGE: Record<ApiDocumentRevisionSource, BadgeStatus> = {
  seed: 'revision.seed',
  edit: 'revision.edit',
  import: 'revision.import',
  export: 'revision.export',
};

/** A document was handed in: final, edited since or not. */
export function isHandedIn(doc: StateFields | null | undefined): boolean {
  return doc?.status === 'final';
}
