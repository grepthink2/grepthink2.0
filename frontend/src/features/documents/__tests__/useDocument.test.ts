import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ApiReleaseSummaryBody, ApiSprintReportBody } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import { DOCUMENT_CHANGED, STORY_NOT_IN_PROJECT, useDocument } from '../hooks/useDocument';
import { makeDocument, releaseSummaryDerived } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    getDocument: vi.fn(),
    saveDocument: vi.fn(),
    finalizeDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}));
const { api } = await import('@/lib/api');

const report = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [], start: [{ id: 'a', action: 'Pair', reason: '' }], keep: [], satisfied_note: '', ...over,
});

beforeEach(() => {
  vi.mocked(api.getDocument).mockReset().mockResolvedValue(makeDocument('sprint_report', { body: report() }));
  vi.mocked(api.saveDocument).mockReset();
  vi.mocked(api.finalizeDocument).mockReset();
  vi.mocked(api.deleteDocument).mockReset();
});

async function opened(revision?: number) {
  const hook = renderHook((props: { revision?: number }) => useDocument('d1', props), { initialProps: { revision } });
  await waitFor(() => expect(hook.result.current.doc).not.toBeNull());
  return hook;
}

describe('useDocument: loading', () => {
  it('opens the head for a member, editable and clean', async () => {
    const { result } = await opened();
    expect(api.getDocument).toHaveBeenCalledWith('d1', undefined);
    expect(result.current.working).toEqual(report());
    expect(result.current.editable).toBe(true);
    expect(result.current.dirty).toBe(false);
    expect(result.current.baseRevision).toBe(3);
  });

  it('says a document that is not there, or not for this reader', async () => {
    vi.mocked(api.getDocument).mockRejectedValueOnce(new ApiError(404, 'Revision not found', 'x'));
    const { result } = renderHook(() => useDocument('d1', { revision: 2 }));
    await waitFor(() => expect(result.current.failure).toEqual({ kind: 'not_found', message: 'Revision not found' }));
    expect(result.current.loading).toBe(false);

    vi.mocked(api.getDocument).mockRejectedValueOnce(new ApiError(403, 'You are not on this team', 'x'));
    const other = renderHook(() => useDocument('d2'));
    await waitFor(() => expect(other.result.current.failure?.kind).toBe('forbidden'));
  });

  it('edits nothing for staff, on a revision asked for, or on one that is not the head', async () => {
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', { access: 'staff' }));
    expect((await opened()).result.current.editable).toBe(false);

    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report'));
    expect((await opened(3)).result.current.editable).toBe(false);

    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', { revision: { number: 2 } }));
    expect((await opened()).result.current.editable).toBe(false);
  });

  it('is dirty once the body would save something new, and not for whitespace', async () => {
    const { result } = await opened();
    act(() => result.current.setWorking((b) => ({ ...(b as ApiSprintReportBody), satisfied_note: '   ' })));
    expect(result.current.dirty).toBe(false);
    act(() => result.current.setWorking((b) => ({ ...(b as ApiSprintReportBody), satisfied_note: 'All good' })));
    expect(result.current.dirty).toBe(true);
  });
});

describe('useDocument: saving', () => {
  it('stores the trimmed body against its base, then reads the revision it saved', async () => {
    const { result } = await opened();
    act(() => result.current.setWorking(report({ satisfied_note: ' All good ' })));
    vi.mocked(api.saveDocument).mockResolvedValueOnce({ revision: 4, overwrote: null });
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', {
      body: report({ satisfied_note: 'All good' }), document: { head_revision: 4 }, revision: { number: 4 },
    }));

    let ok = false;
    await act(async () => { ok = await result.current.save(); });
    expect(ok).toBe(true);
    expect(api.saveDocument).toHaveBeenCalledWith('d1', report({ satisfied_note: 'All good' }), 3);
    expect(api.getDocument).toHaveBeenLastCalledWith('d1', 4);
    expect(result.current.notice).toEqual({ kind: 'success', message: 'Saved as revision 4' });
    expect(result.current.baseRevision).toBe(4);
    expect(result.current.working).toEqual(report({ satisfied_note: 'All good' }));
    expect(result.current.dirty).toBe(false);
  });

  it('refuses a body the API would refuse, naming the fields, and sends nothing', async () => {
    const { result } = await opened();
    act(() => result.current.setWorking(report({ start: [{ id: 'a', action: '', reason: 'why' }] })));
    let ok = true;
    await act(async () => { ok = await result.current.save(); });
    expect(ok).toBe(false);
    expect(api.saveDocument).not.toHaveBeenCalled();
    expect(result.current.problems).toEqual(['Start doing 1 needs an action']);
    // The list follows the edits until a save lands.
    act(() => result.current.setWorking(report({ start: [{ id: 'a', action: 'Pair', reason: 'why' }] })));
    expect(result.current.problems).toEqual([]);
  });

  it("says when the save replaced a revision someone saved since, and offers to compare them", async () => {
    const { result } = await opened();
    act(() => result.current.setWorking(report({ satisfied_note: 'x' })));
    vi.mocked(api.saveDocument).mockResolvedValueOnce({ revision: 5, overwrote: { number: 4, by: 'u3', by_name: 'Alex' } });
    await act(async () => { await result.current.save(); });
    expect(result.current.notice).toEqual({
      kind: 'info', message: 'Revision 5 replaced Alex’s revision 4', compare: { older: 4, newer: 5 },
    });
  });

  it('calls a replaced revision of the viewer’s own theirs', async () => {
    const { result } = renderHook(() => useDocument('d1', { viewerId: 'u1' }));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    act(() => result.current.setWorking(report({ satisfied_note: 'x' })));
    vi.mocked(api.saveDocument).mockResolvedValueOnce({ revision: 5, overwrote: { number: 4, by: 'u1', by_name: 'Tony Wu' } });
    await act(async () => { await result.current.save(); });
    expect(result.current.notice?.message).toBe('Revision 5 replaced your revision 4');
  });

  it('drops the stories the board no longer has when the API refuses one, and stays dirty', async () => {
    const body: ApiReleaseSummaryBody = { key_story_ids: ['s1', 's2'], known_problems: [], follow_ups: [] };
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('release_summary', { body }));
    const findMissingStories = vi.fn().mockResolvedValue(['s3']);
    const { result } = renderHook(() => useDocument('d1', { findMissingStories }));
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.setWorking({ ...body, key_story_ids: ['s1', 's2', 's3'] }));
    vi.mocked(api.saveDocument).mockRejectedValueOnce(new ApiError(422, STORY_NOT_IN_PROJECT, 'x'));
    // The revision the edit started from marks s2 deleted; the board says the added s3 is gone too.
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('release_summary', {
      body,
      derived: releaseSummaryDerived({
        key_stories: [{ id: 's1', key: 'US-1', title: 'A', acceptance_criteria: ['x'], completed: true }, { id: 's2', missing: true }],
      }),
    }));
    let ok = true;
    await act(async () => { ok = await result.current.save(); });

    expect(ok).toBe(false);
    expect(api.getDocument).toHaveBeenLastCalledWith('d1', 3);
    expect(findMissingStories).toHaveBeenCalledWith(['s3']);
    expect((result.current.working as ApiReleaseSummaryBody).key_story_ids).toEqual(['s1']);
    expect(result.current.notice?.message).toBe(
      'A story was deleted from the board, so it was taken out of Key stories. Save again to keep the rest.',
    );
    expect(result.current.dirty).toBe(true);
    expect(api.saveDocument).toHaveBeenCalledTimes(1);
  });

  it('asks the board about every story sent when the edit started from a hand-in', async () => {
    const body: ApiReleaseSummaryBody = { key_story_ids: ['s1', 's2'], known_problems: [], follow_ups: [] };
    const known = { title: 'A', acceptance_criteria: ['x'], completed: true };
    // The load and the read of the base: the hand-in, whose sections say nothing of the board since.
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('release_summary', {
      body,
      document: { status: 'final', finalized_revision: 3 },
      derived_frozen: true,
      derived: releaseSummaryDerived({ key_stories: [{ id: 's1', key: 'US-1', ...known }, { id: 's2', key: 'US-2', ...known }] }),
    }));
    const findMissingStories = vi.fn().mockResolvedValue(['s2']);
    const { result } = renderHook(() => useDocument('d1', { findMissingStories }));
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.setWorking({ ...body, follow_ups: [{ id: 'f1', text: 'Dark mode' }] }));
    vi.mocked(api.saveDocument).mockRejectedValueOnce(new ApiError(422, STORY_NOT_IN_PROJECT, 'x'));
    await act(async () => { await result.current.save(); });
    expect(findMissingStories).toHaveBeenCalledWith(['s1', 's2']);
    expect((result.current.working as ApiReleaseSummaryBody).key_story_ids).toEqual(['s1']);
  });

  it('asks the board about every story sent when the base cannot be read', async () => {
    const body: ApiReleaseSummaryBody = { key_story_ids: ['s1', 's2'], known_problems: [], follow_ups: [] };
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('release_summary', { body }));
    const findMissingStories = vi.fn().mockResolvedValue([]);
    const { result } = renderHook(() => useDocument('d1', { findMissingStories }));
    await waitFor(() => expect(result.current.doc).not.toBeNull());

    act(() => result.current.setWorking({ ...body, follow_ups: [{ id: 'f1', text: 'Dark mode' }] }));
    vi.mocked(api.saveDocument).mockRejectedValueOnce(new ApiError(422, STORY_NOT_IN_PROJECT, 'x'));
    vi.mocked(api.getDocument).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.save(); });
    expect(findMissingStories).toHaveBeenCalledWith(['s1', 's2']);
    // Nothing the board can name is gone: the API's own sentence.
    expect(result.current.notice).toEqual({ kind: 'error', message: STORY_NOT_IN_PROJECT });
  });

  it('shows the API’s sentence for any other refusal, and the preview’s calmly', async () => {
    const { result } = await opened();
    act(() => result.current.setWorking(report({ satisfied_note: 'x' })));
    vi.mocked(api.saveDocument).mockRejectedValueOnce(new ApiError(422, 'This document is too long', 'x'));
    await act(async () => { await result.current.save(); });
    expect(result.current.notice).toEqual({ kind: 'error', message: 'This document is too long' });

    vi.mocked(api.finalizeDocument).mockRejectedValueOnce(new ReadOnlyPreviewError());
    await act(async () => { await result.current.finalize(); });
    expect(result.current.notice).toEqual({ kind: 'info', message: new ReadOnlyPreviewError().message });
  });
});

describe('useDocument: finalize and delete', () => {
  it('hands in the revision on screen', async () => {
    const { result } = await opened();
    vi.mocked(api.finalizeDocument).mockResolvedValueOnce(makeDocument('sprint_report', {
      body: report(), document: { status: 'final', finalized_revision: 3 }, derived_frozen: true,
    }));
    let ok = false;
    await act(async () => { ok = await result.current.finalize(); });
    expect(ok).toBe(true);
    expect(api.finalizeDocument).toHaveBeenCalledWith('d1', 3);
    expect(result.current.doc?.document.status).toBe('final');
    expect(result.current.notice?.message).toBe('Handed in revision 3. The team’s TAs are told.');
  });

  it('reloads and says so when a newer revision was saved first', async () => {
    const { result } = await opened();
    vi.mocked(api.finalizeDocument).mockRejectedValueOnce(new ApiError(409, DOCUMENT_CHANGED, 'x'));
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', { document: { head_revision: 4 }, revision: { number: 4 } }));
    await act(async () => { await result.current.finalize(); });
    await waitFor(() => expect(result.current.baseRevision).toBe(4));
    expect(api.getDocument).toHaveBeenCalledTimes(2);
    expect(result.current.notice?.message).toMatch(/newer revision, so the document was reloaded/);
  });

  it("shows the server's sentence for a check that fails", async () => {
    const { result } = await opened();
    vi.mocked(api.finalizeDocument).mockRejectedValueOnce(new ApiError(409, 'The sprint has not ended yet', 'x'));
    let ok = true;
    await act(async () => { ok = await result.current.finalize(); });
    expect(ok).toBe(false);
    expect(result.current.notice).toEqual({ kind: 'error', message: 'The sprint has not ended yet' });
  });

  it('deletes a draft, and says why when the API refuses', async () => {
    const { result } = await opened();
    vi.mocked(api.deleteDocument).mockResolvedValueOnce(undefined);
    let ok = false;
    await act(async () => { ok = await result.current.remove(); });
    expect(ok).toBe(true);

    vi.mocked(api.deleteDocument).mockRejectedValueOnce(new ApiError(409, "A finalized document can't be deleted", 'x'));
    await act(async () => { ok = await result.current.remove(); });
    expect(ok).toBe(false);
    expect(result.current.notice?.message).toBe("A finalized document can't be deleted");
  });
});

describe('useDocument: the read-only preview', () => {
  it('edits nothing and saves nothing', async () => {
    const { result } = renderHook(() => useDocument('d1', { isPreviewing: true }));
    await waitFor(() => expect(result.current.doc).not.toBeNull());
    expect(result.current.editable).toBe(false);
    act(() => result.current.setWorking(report({ satisfied_note: 'x' })));
    expect(result.current.dirty).toBe(false);
    let ok = true;
    await act(async () => { ok = await result.current.save(); });
    expect(ok).toBe(false);
    expect(api.saveDocument).not.toHaveBeenCalled();
  });
});
