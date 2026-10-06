import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignmentTsrEntry } from '@/lib/api';

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
