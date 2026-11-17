import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiDocumentBody, ApiDocumentKind, ApiProjectDocument, ApiTestReportDerived, ApiReleaseSummaryDerived } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import { bodyChanged, prepareBody, storyIdsOf, withoutStories } from '../utils/documentBody';

/** The API's sentences the page answers in its own way (backend/app/documents/controller.py). */
export const STORY_NOT_IN_PROJECT = "A story is not on this team's board";
export const DOCUMENT_CHANGED = 'The document changed; reload and try again';

/** Why the document is not on screen. */
export type DocumentFailure = 'not_found' | 'forbidden' | 'error';

/** A passing message for the page's toasts; `compare` offers "View changes" between two revisions. */
export interface DocumentNotice {
  kind: 'success' | 'error' | 'info';
  message: string;
  compare?: { older: number; newer: number };
}

export interface UseDocumentOptions {
  /** The revision to show; undefined for the one the API opens on (a member's head, staff's hand-in). */
  revision?: number;
  /**
   * Which of these stories are no longer on the team's board. A save refused because a story is not
   * on the board asks it about the stories this edit added, which the saved revision cannot know.
   */
  findMissingStories?: (ids: string[]) => Promise<string[]>;
  /** The signed-in user, so a save that replaced their own revision (another tab) says so. */
  viewerId?: string;
  /** The read-only preview is on: nothing is edited. */
  isPreviewing?: boolean;
}

/** What is being edited: the body as typed, the body as last loaded or saved, and the revision it is. */
interface Edit {
  working: ApiDocumentBody;
  saved: ApiDocumentBody;
  /** The revision the edit started from: the one loaded, or the one this page last saved. */
  base: number;
}

/** The API's own sentence when it sent one, else a fallback that names the action. */
function messageOf(err: unknown, fallback: string): string {
  if (err instanceof ApiError && typeof err.detail === 'string' && err.detail) return err.detail;
  return fallback;
}

/** A refusal as a notice: the read-only preview's is calm, any other an error. */
function failureNotice(err: unknown, fallback: string): DocumentNotice {
  if (err instanceof ReadOnlyPreviewError) return { kind: 'info', message: err.message };
  return { kind: 'error', message: messageOf(err, fallback) };
}

/** The stories the revision's derived sections mark deleted from the board. */
function missingStories(doc: ApiProjectDocument): string[] {
  if (doc.derived_frozen) return []; // as handed in, not as the board is now
  if (doc.document.kind === 'release_summary') {
    return (doc.derived as ApiReleaseSummaryDerived).key_stories.filter((s) => s.missing).map((s) => s.id);
  }
  if (doc.document.kind === 'test_report') {
    return Object.entries((doc.derived as ApiTestReportDerived).stories)
      .filter(([, story]) => story.missing)
      .map(([id]) => id);
  }
  return [];
}

/** "Key stories", "Key stories and Scenario 2", "A, B and C". */
function joinPlaces(places: string[]): string {
  if (places.length <= 1) return places.join('');
  return `${places.slice(0, -1).join(', ')} and ${places[places.length - 1]}`;
}

/**
 * One document on its page: the revision on screen, the body being edited, and the writes.
 *
 * Loads `documentId` at `revision` (else where the API opens it for this reader) and keeps the newest
 * answer. A team member edits the head, only when no revision is asked for and never in the read-only
 * preview (`editable`); `dirty` says the body would save something new. There is no autosave: `save`
 * stores a revision (the last writer wins), says when it replaced one this page never saw, and
 * refetches what it saved so the board's sections follow the body. A save the API refuses because a
 * story left the board drops the stories that are gone and leaves the body to be saved again.
 * `finalize` hands in the head; `remove` deletes a draft. Each reports through `notice`.
 */
export function useDocument(documentId: string | undefined, options: UseDocumentOptions = {}) {
  const { revision, findMissingStories, viewerId, isPreviewing = false } = options;
  const key = `${documentId ?? ''}:${revision ?? ''}`;

  /** The newest document answered, and the request it answered. */
  const [loaded, setLoaded] = useState<{ key: string; doc: ApiProjectDocument } | null>(null);
  const [failure, setFailure] = useState<{ key: string; kind: DocumentFailure; message: string } | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [reloads, setReloads] = useState(0);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  /** A save was refused for the body's own problems: they show, and follow the edits, until a save lands. */
  const [refused, setRefused] = useState(false);
  const [notice, setNotice] = useState<DocumentNotice | null>(null);

  // Only the newest request may commit, so a slow answer for another revision is dropped.
  const requestSeq = useRef(0);
  useEffect(() => {
    if (!documentId) return;
    const seq = ++requestSeq.current;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    api
      .getDocument(documentId, revision)
      .then((doc) => {
        if (seq !== requestSeq.current) return;
        setLoaded({ key, doc });
        setEdit({ working: doc.body, saved: doc.body, base: doc.revision.number });
        setFailure(null);
        setRefused(false);
      })
      .catch((err: unknown) => {
        if (seq !== requestSeq.current) return;
        const status = err instanceof ApiError ? err.status : 0;
        setFailure({
          key,
          kind: status === 404 ? 'not_found' : status === 403 ? 'forbidden' : 'error',
          message: messageOf(err, 'Couldn’t load the document.'),
        });
      });
  }, [documentId, revision, key, reloads]);

  const doc = loaded?.key === key ? loaded.doc : null;
  const failed = failure?.key === key ? failure : null;
  const kind: ApiDocumentKind | null = doc?.document.kind ?? null;
  const editable = Boolean(
    doc && doc.can_write && !isPreviewing && revision === undefined
      && doc.revision.number === doc.document.head_revision,
  );
  const working = doc && edit ? edit.working : null;
  const dirty = Boolean(editable && kind && edit && bodyChanged(kind, edit.working, edit.saved));
  const problems = useMemo(
    () => (refused && kind && edit ? prepareBody(kind, edit.working).problems : []),
    [refused, kind, edit],
  );

  /** Set the body being edited (a value, or a function of the body before). */
  const setWorking = useCallback((next: ApiDocumentBody | ((before: ApiDocumentBody) => ApiDocumentBody)) => {
    setEdit((e) => (e ? { ...e, working: typeof next === 'function' ? next(e.working) : next } : e));
  }, []);

  // The writes read the newest edit through a ref, so a save started before a keystroke sees it.
  const editRef = useRef<Edit | null>(edit);
  useEffect(() => { editRef.current = edit; }, [edit]);

  const clearNotice = useCallback(() => setNotice(null), []);
  const reload = useCallback(() => setReloads((n) => n + 1), []);

  /** After a save the API refused for a story off the board: drop the stories that are gone. */
  const dropMissingStories = useCallback(async (
    documentKind: ApiDocumentKind, base: number, sent: ApiDocumentBody,
  ): Promise<DocumentNotice> => {
    if (!documentId) return { kind: 'error', message: STORY_NOT_IN_PROJECT };
    const missing = new Set<string>();
    // The revision the edit started from marks the stories deleted from the board since, unless it is a
    // hand-in: its sections are the board as it was then.
    const before = await api.getDocument(documentId, base).catch(() => null);
    if (before) for (const id of missingStories(before)) missing.add(id);
    // The board is asked about every story that revision cannot vouch for: the ones this edit added, or
    // all of them when it is a hand-in or could not be read.
    if (findMissingStories) {
      const vouched = new Set(before && !before.derived_frozen ? storyIdsOf(documentKind, before.body) : []);
      const asked = [...new Set(storyIdsOf(documentKind, sent))].filter((id) => !vouched.has(id));
      for (const id of await findMissingStories(asked).catch(() => [])) missing.add(id);
    }
    const current = editRef.current;
    if (!current) return { kind: 'error', message: STORY_NOT_IN_PROJECT };
    const { body, changed } = withoutStories(documentKind, current.working, missing);
    if (changed.length === 0) return { kind: 'error', message: STORY_NOT_IN_PROJECT };
    setEdit({ ...current, working: body });
    return {
      kind: 'error',
      message: `A story was deleted from the board, so it was taken out of ${joinPlaces(changed)}. Save again to keep the rest.`,
    };
  }, [documentId, findMissingStories]);

  /** Save the body as a new revision. True once it is stored. */
  const save = useCallback(async (): Promise<boolean> => {
    const current = editRef.current;
    if (!documentId || !kind || !current || !editable || saving) return false;
    const prepared = prepareBody(kind, current.working);
    if (prepared.problems.length) {
      setRefused(true);
      return false;
    }
    setSaving(true);
    try {
      const saved = await api.saveDocument(documentId, prepared.body, current.base);
      setRefused(false);
      // Stored: this is the base now, whatever the refetch below does. Typing since the save began stays.
      setEdit((e) => (e ? { ...e, saved: prepared.body, base: saved.revision } : e));
      const { overwrote } = saved;
      if (overwrote) {
        const whose = overwrote.by && overwrote.by === viewerId ? 'your ' : overwrote.by_name ? `${overwrote.by_name}’s ` : '';
        setNotice({
          kind: 'info',
          message: `Revision ${saved.revision} replaced ${whose}revision ${overwrote.number}`,
          compare: { older: overwrote.number, newer: saved.revision },
        });
      } else {
        setNotice({ kind: 'success', message: `Saved as revision ${saved.revision}` });
      }
      // The board's sections follow the body: read the revision just saved, derived from the board now.
      try {
        const fresh = await api.getDocument(documentId, saved.revision);
        setLoaded({ key, doc: fresh });
        // The stored body (trimmed, blank rows gone) replaces the one typed, unless typing went on.
        setEdit((e) => (e && e.working === current.working ? { working: fresh.body, saved: fresh.body, base: saved.revision } : e));
      } catch {
        // Saved all the same; the sections show the board as it was until the page loads again.
      }
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && err.detail === STORY_NOT_IN_PROJECT) {
        setNotice(await dropMissingStories(kind, current.base, prepared.body));
      } else {
        setNotice(failureNotice(err, 'Couldn’t save the document.'));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [documentId, kind, editable, saving, key, viewerId, dropMissingStories]);

  /** Hand in the revision on screen, which must still be the head. True once it is final. */
  const finalize = useCallback(async (): Promise<boolean> => {
    const current = editRef.current;
    if (!documentId || !doc || !current || finalizing) return false;
    setFinalizing(true);
    try {
      const handedIn = await api.finalizeDocument(documentId, current.base);
      setLoaded({ key, doc: handedIn });
      setEdit({ working: handedIn.body, saved: handedIn.body, base: handedIn.revision.number });
      setNotice({ kind: 'success', message: `Handed in revision ${handedIn.revision.number}. The team’s TAs are told.` });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.detail === DOCUMENT_CHANGED) {
        reload();
        setNotice({
          kind: 'error',
          message: 'Someone saved a newer revision, so the document was reloaded. Check it, then finalize again.',
        });
      } else {
        setNotice(failureNotice(err, 'Couldn’t finalize the document.'));
      }
      return false;
    } finally {
      setFinalizing(false);
    }
  }, [documentId, doc, finalizing, key, reload]);

  /** Delete the document, a draft never handed in. True once it is gone. */
  const remove = useCallback(async (): Promise<boolean> => {
    if (!documentId || deleting) return false;
    setDeleting(true);
    try {
      await api.deleteDocument(documentId);
      return true;
    } catch (err) {
      setNotice(failureNotice(err, 'Couldn’t delete the document.'));
      return false;
    } finally {
      setDeleting(false);
    }
  }, [documentId, deleting]);

  return {
    /** The document at the revision on screen; null while it loads or when it failed. */
    doc,
    loading: Boolean(documentId) && !doc && !failed,
    failure: failed ? { kind: failed.kind, message: failed.message } : null,
    working,
    setWorking,
    editable,
    dirty,
    /** The revision the edit started from: the one loaded, or the one last saved here. */
    baseRevision: edit?.base ?? null,
    problems,
    saving,
    finalizing,
    deleting,
    save,
    finalize,
    remove,
    reload,
    notice,
    clearNotice,
  };
}
