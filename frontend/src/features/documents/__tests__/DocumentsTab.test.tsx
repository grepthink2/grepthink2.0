import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ApiError } from '@/lib/api/client';
import { ReadOnlyPreviewError } from '@/lib/previewGuard';
import DocumentsTab from '../components/DocumentsTab';
import { makeDocument, makeSlot, makeSprint, makeSummary } from './fixtures';

vi.mock('@/lib/api', () => ({ api: { getProjectDocuments: vi.fn(), createDocument: vi.fn() } }));
const { api } = await import('@/lib/api');

const SLOTS = [
  makeSlot({ title: 'Sprint 1 report', sprint: makeSprint({ id: 'sp1', name: 'Sprint 1', starts_at: '2026-09-21', ends_at: '2026-10-04' }), document: makeSummary({ id: 'd1', status: 'final', finalized_revision: 3, edited_since: true, head_revision: 5 }) }),
  makeSlot({ title: 'Sprint 2 report', sprint: makeSprint({ status: 'active' }), document: null }),
  makeSlot({ kind: 'release_summary', title: 'Release summary', sprint: null, document: makeSummary({ id: 'd2' }) }),
  makeSlot({ kind: 'test_report', title: 'Test plan and report', sprint: null, document: null }),
];

function Where() {
  const location = useLocation();
  return <output data-testid="where">{location.pathname}|{JSON.stringify(location.state)}</output>;
}

const renderTab = (canStart = true) => render(
  <MemoryRouter initialEntries={['/app/projects/p1/board?view=documents']}>
    <Routes>
      <Route path="/app/projects/:projectId/board" element={<DocumentsTab projectId="p1" canStart={canStart} projectName="Trailhead" />} />
      <Route path="*" element={null} />
    </Routes>
    <Where />
  </MemoryRouter>,
);
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  vi.mocked(api.getProjectDocuments).mockReset().mockResolvedValue({ documents: SLOTS });
  vi.mocked(api.createDocument).mockReset();
});

describe('DocumentsTab', () => {
  it('lists every document the team can have, under Sprints and End of term, each with its state', async () => {
    renderTab();
    const sprints = await screen.findByRole('table', { name: 'Sprint documents' });
    const end = screen.getByRole('table', { name: 'End-of-term documents' });
    expect(within(sprints).getAllByRole('rowheader').map((c) => c.textContent)).toEqual([
      'Sprint 1 reportSep 21 – Oct 4 · Completed',
      'Sprint 2 reportOct 5 – Oct 18 · Active',
    ]);
    expect(within(end).getAllByRole('rowheader').map((c) => c.textContent)).toEqual(['Release summary', 'Test plan and report']);
    const first = within(sprints).getAllByRole('row')[1];
    expect(within(first).getByText('Final · edited since')).toBeInTheDocument();
    expect(within(first).getByText('Revision 5')).toBeInTheDocument();
    expect(within(first).getByText(/by Alex Kim/)).toBeInTheDocument();
    expect(within(end).getAllByRole('row')[2]).toHaveTextContent('Not started');
  });

  it('opens a made document from its first cell, naming the project for the breadcrumbs', async () => {
    renderTab();
    await userEvent.click(await screen.findByRole('link', { name: 'Release summary' }));
    expect(where()).toBe('/app/projects/p1/documents/d2|{"projectName":"Trailhead","documentTitle":"Release summary"}');
  });

  it('starts a document not made yet and opens it', async () => {
    vi.mocked(api.createDocument).mockResolvedValueOnce(makeDocument('sprint_report', { document: { id: 'd9' } }));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Start Sprint 2 report' }));
    expect(api.createDocument).toHaveBeenCalledWith('p1', 'sprint_report', 'sp2');
    await waitFor(() => expect(where()).toMatch(/^\/app\/projects\/p1\/documents\/d9\|/));
  });

  it('opens the one a teammate made first', async () => {
    vi.mocked(api.createDocument).mockRejectedValueOnce(new ApiError(409, 'This document already exists', 'x'));
    renderTab();
    const start = await screen.findByRole('button', { name: 'Start Test plan and report' });
    vi.mocked(api.getProjectDocuments).mockResolvedValueOnce({
      documents: SLOTS.map((s) => (s.kind === 'test_report' ? { ...s, document: makeSummary({ id: 'd7' }) } : s)),
    });
    await userEvent.click(start);
    await waitFor(() => expect(where()).toMatch(/^\/app\/projects\/p1\/documents\/d7\|/));
    expect(api.createDocument).toHaveBeenCalledWith('p1', 'test_report', undefined);
  });

  it('says why a start was refused, calmly in the read-only preview', async () => {
    vi.mocked(api.createDocument).mockRejectedValueOnce(new ReadOnlyPreviewError());
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Start Sprint 2 report' }));
    // A calm status, not an error's alert.
    expect((await screen.findByText('Read-only preview — changes are disabled.')).closest('[role]')).toHaveAttribute('role', 'status');
  });

  it('offers no Start to staff', async () => {
    renderTab(false);
    await screen.findByRole('table', { name: 'Sprint documents' });
    expect(screen.queryByRole('button', { name: /Start/ })).not.toBeInTheDocument();
  });

  it('says when the list could not be read, and reads it again', async () => {
    vi.mocked(api.getProjectDocuments).mockRejectedValueOnce(new Error('offline'));
    renderTab();
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Sprint documents' })).toBeInTheDocument();
  });
});
