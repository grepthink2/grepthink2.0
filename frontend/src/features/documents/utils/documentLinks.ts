/** Where a document, its team's Documents tab and a board story live in the app. */

/** A document's page, at `revision` when one is named. */
export function documentPath(projectId: string, documentId: string, revision?: number): string {
  const path = `/app/projects/${projectId}/documents/${documentId}`;
  return revision != null ? `${path}?revision=${revision}` : path;
}

/** The team's Documents tab on its board. */
export function boardDocumentsPath(projectId: string): string {
  return `/app/projects/${projectId}/board?view=documents`;
}

/**
 * A story open on its team's board. The board opens `?story=` among the stories it shows, the shown
 * sprint's and the backlog's, so a story in a sprint names that sprint (`?sprint=`, which the board
 * switches to first) and a backlog story opens on the Backlog tab, as the search links do.
 */
export function storyBoardPath(projectId: string, storyId: string, sprintId?: string | null): string {
  const where = sprintId ? `sprint=${sprintId}` : sprintId === null ? 'view=backlog' : '';
  return `/app/projects/${projectId}/board?${where ? `${where}&` : ''}story=${storyId}`;
}

/** `?revision=` as a revision number; undefined for none or for anything but a whole number from 1. */
export function parseRevision(raw: string | null): number | undefined {
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n >= 1 && n <= 2_147_483_647 ? n : undefined;
}
