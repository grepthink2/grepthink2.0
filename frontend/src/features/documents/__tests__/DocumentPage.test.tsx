import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import type { ApiSprintReportBody } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import DocumentPage from '../pages/DocumentPage';
import DocumentRedirect from '../pages/DocumentRedirect';
import { makeDocument, releaseSummaryDerived } from './fixtures';

vi.mock('@/lib/api', () => ({
  api: {
    getDocument: vi.fn(),
    saveDocument: vi.fn(),
    finalizeDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getDocumentRevisions: vi.fn(),
    getDocumentMarkdownFile: vi.fn(),
    getDocumentStories: vi.fn(),
    // Never called: a document reads the board's stories through its own route.
    getScrumBoard: vi.fn(),
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1', email: 'tony@ucsc.edu' } }) }));
/** The read-only preview, as AppView hands it to its pages through the outlet context. */
const preview = { on: false };
const saveFile = vi.hoisted(() => vi.fn());
vi.mock('../utils/saveFile', () => ({ saveFile }));
const { api } = await import('@/lib/api');

/** A sprint report on an ended sprint that every check passes. */
const ready = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [{ id: 'a', action: 'Skip standups', reason: 'we lost track' }],
  start: [{ id: 'b', action: 'Pair', reason: 'fewer bugs' }],
  keep: [{ id: 'c', action: 'Review', reason: 'it works' }],
  satisfied_note: '',
  ...over,
});

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

const renderAt = (entry = '/app/projects/p1/documents/d1') => render(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route element={<Outlet context={{ openJoinClassModal: () => {}, isPreviewing: preview.on }} />}>
        <Route path="/app/projects/:projectId/documents/:documentId" element={<DocumentPage />} />
        <Route path="/app/documents/:documentId" element={<DocumentRedirect />} />
        <Route path="*" element={<p>Elsewhere</p>} />
      </Route>
    </Routes>
    <Where />
  </MemoryRouter>,
);
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  preview.on = false;
  vi.mocked(api.getDocument).mockReset().mockResolvedValue(makeDocument('sprint_report', { body: ready() }));
  vi.mocked(api.saveDocument).mockReset();
  vi.mocked(api.finalizeDocument).mockReset();
  vi.mocked(api.deleteDocument).mockReset();
  vi.mocked(api.getDocumentRevisions).mockReset().mockResolvedValue({ revisions: [] });
  vi.mocked(api.getDocumentMarkdownFile).mockReset();
  vi.mocked(api.getDocumentStories).mockReset().mockResolvedValue({ stories: [] });
  vi.mocked(api.getScrumBoard).mockReset();
  saveFile.mockReset();
});

describe('DocumentPage: a team member on the head', () => {
  it('shows the title, state, revision and checks, with Save off until something changes', async () => {
    renderAt();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sprint 2 report' })).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Revision 3')).toBeInTheDocument();
    expect(screen.getByText(/Saved .* by Alex Kim/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
    expect(screen.getByText('Every check passes: the document can be handed in.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeEnabled();
    // The Markdown is this revision: nothing to say about it.
    expect(screen.queryByText(/Download Markdown and Copy give/)).not.toBeInTheDocument();
  });

  it('says Download and Copy give the hand-in on a draft saved since it', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('sprint_report', {
      body: ready(),
      document: { status: 'final', head_revision: 5, finalized_revision: 3, finalized_at: '2026-11-15T18:00:00Z', edited_since: true },
      revision: { number: 5 },
    }));
    renderAt();
    const note = 'Download Markdown and Copy give the handed-in version (revision 3).';
    expect(await screen.findByText(note)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toHaveAccessibleDescription(note);
    expect(screen.getByRole('button', { name: 'Copy' })).toHaveAccessibleDescription(note);
  });

  it('saves an edit as a revision and says so; Finalize waits for the save', async () => {
    renderAt();
    const field = await screen.findByRole('textbox', { name: 'Action 1, Start doing' });
    await userEvent.type(field, ' daily');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalize' })).toHaveAccessibleDescription('Save first');

    vi.mocked(api.saveDocument).mockResolvedValueOnce({ revision: 4, overwrote: null });
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', {
      body: ready({ start: [{ id: 'b', action: 'Pair daily', reason: 'fewer bugs' }] }),
      document: { head_revision: 4 },
      revision: { number: 4 },
    }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Saved as revision 4')).toBeInTheDocument();
    expect(api.saveDocument).toHaveBeenCalledWith('d1', expect.objectContaining({
      start: [{ id: 'b', action: 'Pair daily', reason: 'fewer bugs' }],
    }), 3);
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it("offers to compare the revision a save replaced with the new one", async () => {
    vi.mocked(api.getDocumentRevisions).mockResolvedValue({ revisions: [] });
    renderAt();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Action 1, Start doing' }), '!');
    vi.mocked(api.saveDocument).mockResolvedValueOnce({ revision: 5, overwrote: { number: 4, by: 'u2', by_name: 'Alex Kim' } });
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Revision 5 replaced Alex Kim’s revision 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'View changes' }));
    expect(await screen.findByRole('dialog', { name: 'Revisions' })).toBeInTheDocument();
  });

  it('names the fields a save would be refused for', async () => {
    renderAt();
    const field = await screen.findByRole('textbox', { name: 'Action 1, Start doing' });
    await userEvent.clear(field);
    await userEvent.type(screen.getByRole('textbox', { name: 'Reason 1, Start doing (optional)' }), '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Can’t save yet');
    expect(alert).toHaveTextContent('Start doing 1 needs an action');
    expect(api.saveDocument).not.toHaveBeenCalled();
  });

  it('finalizes after asking, and says the TAs are told', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Finalize' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Finalize Sprint 2 report?' });
    expect(dialog).toHaveTextContent('Revision 3 is handed in.');
    vi.mocked(api.finalizeDocument).mockResolvedValueOnce(makeDocument('sprint_report', {
      body: ready(), document: { status: 'final', finalized_revision: 3, finalized_at: '2026-11-17T18:00:00Z', finalized_by_name: 'Tony Wu' }, derived_frozen: true,
    }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Finalize' }));
    expect(await screen.findByText('Handed in revision 3. The team’s TAs are told.')).toBeInTheDocument();
    expect(api.finalizeDocument).toHaveBeenCalledWith('d1', 3);
    expect(screen.getByText(/Handed in Nov 17, 2026 by Tony Wu, revision 3/)).toBeInTheDocument();
    expect(screen.getByText('From the board, as handed in')).toBeInTheDocument();
  });

  it('holds Finalize back while a check fails, and says which', async () => {
    vi.mocked(api.getDocument).mockResolvedValueOnce(makeDocument('sprint_report', { body: ready({ keep: [] }) }));
    renderAt();
    const finalize = await screen.findByRole('button', { name: 'Finalize' });
    expect(finalize).toBeDisabled();
    expect(finalize).toHaveAccessibleDescription('Add at least one action to keep doing');
  });

  it('asks before leaving with unsaved changes', async () => {
    renderAt();
    await userEvent.type(await screen.findByRole('textbox', { name: 'Action 1, Start doing' }), '!');
    await userEvent.click(screen.getByRole('link', { name: 'Back to the documents' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(where()).toBe('/app/projects/p1/documents/d1');
    await userEvent.click(screen.getByRole('link', { name: 'Back to the documents' }));
    await userEvent.click(within(screen.getByRole('alertdialog', { name: 'Leave without saving?' })).getByRole('button', { name: 'Leave' }));
    expect(where()).toBe('/app/projects/p1/board?view=documents');
  });

  it('deletes a draft from the overflow menu after asking, and goes back to the documents', async () => {
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete draft' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Sprint 2 report?' });
    vi.mocked(api.deleteDocument).mockResolvedValueOnce(undefined);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(where()).toBe('/app/projects/p1/board?view=documents'));
    expect(api.deleteDocument).toHaveBeenCalledWith('d1');
  });

  it('downloads the Markdown under the name the API gives it, and copies it', async () => {
    vi.mocked(api.getDocumentMarkdownFile).mockResolvedValue({ text: '# Sprint 2 Report', filename: 'trailhead-sprint-2-report.md' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderAt();
    await userEvent.click(await screen.findByRole('button', { name: 'Download Markdown' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledWith('# Sprint 2 Report', 'trailhead-sprint-2-report.md'));
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByText('Copied the Markdown')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('# Sprint 2 Report');
  });

  it('hands the clipboard the text to come where the browser takes it, so the click still counts', async () => {
    vi.mocked(api.getDocumentMarkdownFile).mockResolvedValue({ text: '# Release Summary', filename: 'x.md' });
    class FakeClipboardItem {
      items: Record<string, Promise<Blob>>;
      constructor(items: Record<string, Promise<Blob>>) {
        this.items = items;
      }
    }
    vi.stubGlobal('ClipboardItem', FakeClipboardItem);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { write, writeText: vi.fn() }, configurable: true });
    try {
      renderAt();
      await userEvent.click(await screen.findByRole('button', { name: 'Copy' }));
      expect(await screen.findByText('Copied the Markdown')).toBeInTheDocument();
      const [[[item]]] = write.mock.calls as unknown as [[[FakeClipboardItem]]];
      expect(await (await item.items['text/plain']).text()).toBe('# Release Summary');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('DocumentPage: the kinds that pick stories', () => {
  it("reads the board's stories for a member's release summary, for its picker and its links", async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('release_summary', {
      body: { key_story_ids: ['s1'], known_problems: [], follow_ups: [] },
      derived: releaseSummaryDerived({
        key_stories: [{ id: 's1', key: 'US-1', title: 'Trail search', acceptance_criteria: ['Finds a trail'], completed: true }],
      }),
    }));
    vi.mocked(api.getDocumentStories).mockResolvedValue({
      stories: [
        { id: 's1', key: 'US-1', title: 'Trail search', acceptance_criteria: ['Finds a trail'], sprint_id: 'sp1', sprint_name: 'Sprint 1', completed: true },
        { id: 's2', key: 'US-2', title: 'Offline maps', acceptance_criteria: [], sprint_id: null, sprint_name: null, completed: false },
      ],
    });
    renderAt();
    // The story's sprint is known once the stories are read: the link opens the story in it.
    await waitFor(() => expect(screen.getByRole('link', { name: 'Edit on the board' }))
      .toHaveAttribute('href', '/app/projects/p1/board?sprint=sp1&story=s1'));
    expect(api.getDocumentStories).toHaveBeenCalledTimes(1);
    expect(api.getDocumentStories).toHaveBeenCalledWith('p1');
    await userEvent.click(screen.getByRole('button', { name: 'Add a key story' }));
    expect(await screen.findByRole('button', { name: /US-2 Offline maps Backlog/ })).toBeInTheDocument();
    expect(api.getScrumBoard).not.toHaveBeenCalled();
  });

  it("reads the stories of the document's own project, whatever the address says", async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('release_summary', { document: { project_id: 'p2' } }));
    renderAt('/app/projects/p1/documents/d1');
    await waitFor(() => expect(where()).toBe('/app/projects/p2/documents/d1'));
    await waitFor(() => expect(api.getDocumentStories).toHaveBeenCalledWith('p2'));
    expect(api.getDocumentStories).not.toHaveBeenCalledWith('p1');
  });

  it("shows a test report's scenarios, and reads no stories for staff", async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('test_report', {
      access: 'staff',
      can_finalize: false,
      body: { scenarios: [{ id: 'sc1', title: 'Log in', story_ids: [], steps_md: '', result: 'pass', note: '' }], unit_tests: [], unit_tests_note: '' },
    }));
    renderAt();
    expect(await screen.findByRole('heading', { name: /Scenario 1 Log in/ })).toBeInTheDocument();
    expect(screen.getByText('Passed')).toBeInTheDocument();
    expect(api.getDocumentStories).not.toHaveBeenCalled();
    expect(api.getScrumBoard).not.toHaveBeenCalled();
  });
});

describe('DocumentPage: readers', () => {
  const finalEdited = (over: Parameters<typeof makeDocument<'sprint_report'>>[1] = {}) => makeDocument('sprint_report', {
    access: 'staff',
    can_finalize: false,
    document: {
      status: 'final', head_revision: 5, finalized_revision: 3, finalized_at: '2026-11-15T18:00:00Z',
      finalized_by_name: 'Sam Lee', edited_since: true,
    },
    revision: { number: 3, finalized_at: '2026-11-15T18:00:00Z' },
    derived_frozen: true,
    body: ready(),
    ...over,
  });

  it('shows staff the hand-in, read only, with the latest draft one click away', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(finalEdited());
    renderAt();
    expect(await screen.findByText('Handed in Nov 15, 2026 by Sam Lee, revision 3')).toBeInTheDocument();
    expect(screen.getByText('Final · edited since')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finalize/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    // The hand-in is what the Markdown gives: nothing to say about it here.
    expect(screen.queryByText(/Download Markdown and Copy give/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'Latest draft (revision 5)' }));
    expect(where()).toBe('/app/projects/p1/documents/d1?revision=5');
    await waitFor(() => expect(api.getDocument).toHaveBeenLastCalledWith('d1', 5));
  });

  it("says Download and Copy give a draft's latest revision on an older one", async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('sprint_report', { body: ready(), revision: { number: 2 } }));
    renderAt('/app/projects/p1/documents/d1?revision=2');
    const note = 'Download Markdown and Copy give the latest draft (revision 3).';
    expect(await screen.findByText(note)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download Markdown' })).toHaveAccessibleDescription(note);
  });

  it('gives the read-only preview its calm notice and no write controls', async () => {
    preview.on = true;
    renderAt();
    expect(await screen.findByText('Read-only preview — changes are disabled.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument();
  });

  it('says a revision is no longer kept, and a document is not there', async () => {
    vi.mocked(api.getDocument).mockRejectedValueOnce(new ApiError(404, 'Revision not found', 'x'));
    const { unmount } = renderAt('/app/projects/p1/documents/d1?revision=2');
    expect(await screen.findByRole('heading', { name: 'Revision 2 is no longer kept' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the latest' })).toHaveAttribute('href', '/app/projects/p1/documents/d1');
    unmount();

    vi.mocked(api.getDocument).mockRejectedValueOnce(new ApiError(404, 'Document not found', 'x'));
    renderAt();
    expect(await screen.findByRole('heading', { name: 'This document is not here' })).toBeInTheDocument();
  });

  it('opens a document of another project under its own', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('sprint_report', { document: { project_id: 'p2' } }));
    renderAt('/app/projects/p1/documents/d1');
    await waitFor(() => expect(where()).toBe('/app/projects/p2/documents/d1'));
  });
});

describe('DocumentRedirect', () => {
  it('opens the document under its project in place of the address', async () => {
    vi.mocked(api.getDocument).mockResolvedValue(makeDocument('release_summary', { document: { project_id: 'p7' } }));
    renderAt('/app/documents/d1');
    await waitFor(() => expect(where()).toBe('/app/projects/p7/documents/d1'));
  });

  it('says when the document is not there', async () => {
    vi.mocked(api.getDocument).mockRejectedValue(new ApiError(404, 'Document not found', 'x'));
    renderAt('/app/documents/d1');
    expect(await screen.findByRole('heading', { name: 'This document is not here' })).toBeInTheDocument();
  });
});
