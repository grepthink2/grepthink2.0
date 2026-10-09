import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignmentTsrEntry } from '@/lib/api';
import { formatInstant } from '@/lib/dateUtils';

const api = vi.hoisted(() => ({ getProjectMembers: vi.fn(), getMyAssignmentTsrs: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: { id: 'me' } }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));

import TSRS, { type TsrsAssignment } from '../TSRS';

const DUE_AT = '2026-10-03T21:00:00+00:00';

const ASSIGNMENT: TsrsAssignment = {
  id: 'a1',
  name: 'TSR Week 1',
  dueDate: 'Oct 3, 2026 at 11:59 PM',
  projectName: 'Team Kestrel',
  projectId: 'p1',
  dueAt: DUE_AT,
};

function entry(evaluateeId: string, submittedAt: string): ApiAssignmentTsrEntry {
  return {
    tsr_id: `tsr-${evaluateeId}`,
    evaluator_id: 'me',
    evaluatee_id: evaluateeId,
    project_id: 'p1',
    percent_contribution: 50,
    positive_feedback: 'Kept the board current',
    constructive_feedback: 'Open PRs earlier',
    submitted_at: submittedAt,
    updated_at: submittedAt,
  };
}

async function renderWithSubmission(submittedAt: string, dueAt: string | null = DUE_AT) {
  api.getMyAssignmentTsrs.mockResolvedValue({
    tsrs: [entry('me', submittedAt), entry('teammate', submittedAt)],
  });
  render(
    <MemoryRouter>
      <TSRS assignment={{ ...ASSIGNMENT, dueAt }} />
    </MemoryRouter>,
  );
  await screen.findByText(/You are editing your previous submission/);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getProjectMembers.mockResolvedValue({
    members: [
      { user_id: 'me', email: 'me@ucsc.edu', project_role: 'member' },
      { user_id: 'teammate', email: 'teammate@ucsc.edu', project_role: 'member' },
    ],
  });
});

describe('TSRS late note', () => {
  it('notes a submission made after the deadline', async () => {
    await renderWithSubmission('2026-10-04T09:15:00+00:00');
    expect(screen.getByText('Submitted after the deadline')).toBeInTheDocument();
  });

  it('counts a submission at the deadline instant as late, as the server does', async () => {
    await renderWithSubmission(DUE_AT);
    expect(screen.getByText('Submitted after the deadline')).toBeInTheDocument();
  });

  it('says nothing for a submission before the deadline', async () => {
    await renderWithSubmission('2026-10-03T20:59:00+00:00');
    expect(screen.queryByText('Submitted after the deadline')).not.toBeInTheDocument();
  });

  it('says nothing when the deadline is not known', async () => {
    await renderWithSubmission('2026-10-04T09:15:00+00:00', null);
    expect(screen.queryByText('Submitted after the deadline')).not.toBeInTheDocument();
  });
});

describe('TSRS submission window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Renders the form for `assignment` with these prior entries (none: a first submission). */
  function renderForm(
    assignment: TsrsAssignment,
    tsrs: ApiAssignmentTsrEntry[],
    zone?: string,
  ) {
    api.getMyAssignmentTsrs.mockResolvedValue({ tsrs });
    render(
      <MemoryRouter>
        <TSRS assignment={assignment} zone={zone} />
      </MemoryRouter>,
    );
  }

  /** Goes from Contributions to the last step and returns its Submit button. */
  async function submitButton() {
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    return screen.getByRole('button', { name: 'Submit' });
  }

  const onTime = [entry('me', '2026-10-03T20:00:00+00:00'), entry('teammate', '2026-10-03T20:00:00+00:00')];

  it('says the assignment is closed and disables Submit', async () => {
    vi.setSystemTime(new Date('2026-10-04T09:15:00Z')); // past due_at, no late window
    renderForm(ASSIGNMENT, onTime);
    expect(await screen.findByText('This assignment is closed')).toBeInTheDocument();
    expect(await submitButton()).toBeDisabled();
  });

  it("disables the scrum master's Submit too", async () => {
    vi.setSystemTime(new Date('2026-10-04T09:15:00Z'));
    api.getProjectMembers.mockResolvedValue({
      members: [
        { user_id: 'me', email: 'me@ucsc.edu', project_role: 'scrum master' },
        { user_id: 'teammate', email: 'teammate@ucsc.edu', project_role: 'member' },
      ],
    });
    renderForm(ASSIGNMENT, onTime);
    expect(await screen.findByText('This assignment is closed')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' })); // team feedback, prefilled
    expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled();
  });

  it('says when the assignment opens and disables Submit', async () => {
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    renderForm({ ...ASSIGNMENT, openDate: '2026-09-28' }, [], 'Europe/Istanbul');
    // Midnight on Sep 28 in Istanbul is Sep 27 21:00Z.
    const notice = `This assignment opens ${formatInstant('2026-09-27T21:00:00Z')}`;
    expect(await screen.findByText(notice)).toBeInTheDocument();
    expect(await submitButton()).toBeDisabled();
  });

  it('keeps Submit enabled inside the late window, with the late note', async () => {
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z')); // past due_at, inside the late window
    const late = [entry('me', '2026-10-04T09:15:00+00:00'), entry('teammate', '2026-10-04T09:15:00+00:00')];
    renderForm({ ...ASSIGNMENT, acceptUntil: '2026-10-06T21:00:00+00:00' }, late);
    expect(await screen.findByText('Submitted after the deadline')).toBeInTheDocument();
    expect(screen.queryByText(/^This assignment (is closed|opens)/)).not.toBeInTheDocument();
    expect(await submitButton()).toBeEnabled();
  });
});
