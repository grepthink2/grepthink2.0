/**
 * Read-only guard for "View as Student" preview mode.
 *
 * Preview mode lets an instructor experience the student UI without touching
 * the database. This module is the enforcement point: while read-only is on,
 * the centralized API client (`apiRequest` / `apiUpload`) refuses every
 * mutating request (anything that isn't GET/HEAD).
 *
 * It lives outside React because `api.ts` is a plain module — it can't read
 * context. `PreviewProvider` flips the flag on enter/exit.
 */

let readOnly = false;

/** Error thrown when a write is attempted during read-only preview. */
export class ReadOnlyPreviewError extends Error {
  constructor() {
    super('Read-only preview — changes are disabled.');
    this.name = 'ReadOnlyPreviewError';
  }
}

export function setReadOnly(value: boolean): void {
  readOnly = value;
}

export function isReadOnly(): boolean {
  return readOnly;
}

/** HTTP methods that only read state and are therefore always allowed. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Throws `ReadOnlyPreviewError` if `method` would mutate state while read-only
 * preview is active. A missing method defaults to GET (fetch's default).
 *
 * Also emits a `preview:blocked` window event so the UI can surface a toast.
 * Callers that fire mutations as a side effect of reading (mark-as-read) can
 * pass `silent` to suppress the toast.
 */
export function assertWritableRequest(method: string | undefined, silent = false): void {
  if (!readOnly) return;
  const normalized = (method ?? 'GET').toUpperCase();
  if (SAFE_METHODS.has(normalized)) return;

  if (!silent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('preview:blocked'));
  }
  throw new ReadOnlyPreviewError();
}
