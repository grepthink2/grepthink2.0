import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ApiSprintReportBody } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import ChangeList from '../components/ChangeList';
import ChecksPanel from '../components/ChecksPanel';
import RevisionsDrawer from '../components/RevisionsDrawer';
import { diffBodies } from '../utils/diff';
import { makeDocument, makeRevisionEntry } from './fixtures';

vi.mock('@/lib/api', () => ({ api: { getDocumentRevisions: vi.fn(), getDocument: vi.fn() } }));
const { api } = await import('@/lib/api');

const report = (over: Partial<ApiSprintReportBody> = {}): ApiSprintReportBody => ({
  stop: [], start: [], keep: [], satisfied_note: '', ...over,
});

describe('ChecksPanel', () => {
  it('names each failing check’s severity in words, blocking first', () => {
    render(<ChecksPanel checks={[
      { severity: 'blocking', message: 'Add at least one action to keep doing' },
      { severity: 'warning', message: '“Pair” (Start doing) has no reason' },
    ]} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      'Blocks finalize: Add at least one action to keep doing',
      'Warning: “Pair” (Start doing) has no reason',
    ]);
    expect(screen.getByRole('heading', { name: /Checks 1 blocking · 1 warning/ })).toBeInTheDocument();
  });

  it('says when every check passes', () => {
    render(<ChecksPanel checks={[]} />);
    expect(screen.getByText('Every check passes: the document can be handed in.')).toBeInTheDocument();
  });
});

describe('ChangeList', () => {
  const storyName = (id: string) => (id === 's1' ? 'US-1 Trail search' : 'A story');

  it('prints one line per change, with insertions and deletions named for a screen reader', () => {
    const older = report({ start: [{ id: 'a', action: 'Pair', reason: 'keeps us in sync' }], keep: [{ id: 'b', action: 'Standup', reason: '' }] });
    const newer = report({ start: [{ id: 'a', action: 'Pair', reason: 'keeps the team in sync' }, { id: 'c', action: 'Demo weekly', reason: '' }] });
    render(<ChangeList changes={diffBodies('sprint_report', older, newer)} storyName={storyName} />);
    const lines = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(lines).toEqual([
      'ChangedStart doing, “Pair”, Reason: keeps removed: us added: the team in sync',
      'AddedStart doing: added: “Demo weekly”',
      'RemovedKeep doing: removed: “Standup”',
    ]);
    expect(document.querySelector('del')?.textContent).toBe('removed: us');
  });

  it('names board stories and places for a move, and says when nothing changed', () => {
    const { rerender } = render(
      <ChangeList
        changes={diffBodies('release_summary',
          { key_story_ids: ['s1', 's2'], known_problems: [], follow_ups: [] },
          { key_story_ids: ['s2', 's1'], known_problems: [], follow_ups: [] })}
        storyName={storyName}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Key stories: US-1 Trail search moved from 1 to 2');
    rerender(<ChangeList changes={[]} storyName={storyName} />);
    expect(screen.getByText('Nothing changed between these revisions.')).toBeInTheDocument();
  });
});

describe('RevisionsDrawer', () => {
  const REVISIONS = [
    makeRevisionEntry({ number: 4, saved_by_name: 'Alex Kim' }),
    makeRevisionEntry({ number: 3, finalized: true, finalized_at: '2026-11-15T10:00:00Z' }),
    makeRevisionEntry({ number: 1, source: 'seed', saved_by: null, saved_by_name: null }),
  ];
  const bodies: Record<number, ApiSprintReportBody> = {
    1: report(),
    3: report({ start: [{ id: 'a', action: 'Pair', reason: '' }] }),
    4: report({ start: [{ id: 'a', action: 'Pair up', reason: '' }] }),
  };

  beforeEach(() => {
    vi.mocked(api.getDocumentRevisions).mockReset().mockResolvedValue({ revisions: REVISIONS });
    vi.mocked(api.getDocument).mockReset().mockImplementation(async (_id, n) => {
      if (n === 1) throw new ApiError(404, 'Revision not found', 'x');
      return makeDocument('sprint_report', { body: bodies[n as number], revision: { number: n as number } });
    });
  });

  const open = (compare: { older: number; newer: number } | null = null) => render(
    <RevisionsDrawer open onClose={vi.fn()} documentId="d1" kind="sprint_report" compare={compare} head={4} storyName={(id) => id} />,
    { wrapper: MemoryRouter },
  );

  it('lists every revision with who saved it, its source and every hand-in', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Revisions, newest first' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/Revision 4 Alex Kim · .* Edited/);
    const saver = within(rows[0]).getByRole('link', { name: 'Alex Kim' });
    expect(saver).toHaveAttribute('href', '/app/people/u2');
    expect(saver).toHaveClass('gt-person-link--inline');
    // A revision nobody is named for reads "Someone", and leads nowhere.
    expect(rows[2]).toHaveTextContent(/Revision 1 Someone · /);
    expect(within(rows[2]).queryByRole('link')).toBeNull();
    expect(within(rows[1]).getByText('Handed in')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Started')).toBeInTheDocument();
  });

  it('compares the newest with the one before by default', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Changes from revision 3 to revision 4' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('up', { selector: 'ins' })).toBeInTheDocument());
    expect(api.getDocument).toHaveBeenCalledWith('d1', 3);
    expect(api.getDocument).toHaveBeenCalledWith('d1', 4);
  });

  it('says a pruned revision is no longer kept', async () => {
    open({ older: 1, newer: 3 });
    expect(await screen.findByText(/Revision 1 is no longer kept/)).toBeInTheDocument();
  });

  it('compares any two revisions picked', async () => {
    open();
    await screen.findByRole('heading', { name: 'Changes from revision 3 to revision 4' });
    await userEvent.click(screen.getByRole('button', { name: 'Changes in revision 3' }));
    expect(await screen.findByRole('heading', { name: 'Changes from revision 1 to revision 3' })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Older' }), '4');
    expect(await screen.findByRole('heading', { name: 'Changes from revision 3 to revision 4' })).toBeInTheDocument();
  });
});
