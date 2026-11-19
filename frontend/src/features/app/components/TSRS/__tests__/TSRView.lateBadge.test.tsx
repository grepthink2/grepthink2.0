/** Reviewers see which TSRs came in late: a mark on the cell that stands for each submission. */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignment, ApiAssignmentTsrEntry } from '@/lib/api';

const api = vi.hoisted(() => ({ getAssignmentTsrOverview: vi.fn(), getProjectMembers: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

import TSRView from '../TSRView';

const DUE_AT = '2026-11-15T08:00:00Z';

const ASSIGNMENT: ApiAssignment = {
  id: 'a1',
  Title: 'TSR 3',
  open_date: '2026-11-09',
  close_date: '2026-11-14',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
  due_at: DUE_AT,
  accept_until: '2026-11-18T08:00:00Z',
};

type Person = readonly [id: string, first: string, last: string];
const ADA: Person = ['u1', 'Ada', 'Lovelace'];
const BEN: Person = ['u2', 'Ben', 'Okafor'];
const CAM: Person = ['u3', 'Cam', 'Ruiz'];
const fullName = (p: Person) => `${p[1]} ${p[2]}`;

function entry(from: Person, about: Person, submittedAt: string, updatedAt = submittedAt): ApiAssignmentTsrEntry {
  return {
    tsr_id: `tsr-${from[0]}-${about[0]}`,
    evaluator_id: from[0],
    evaluator_name: fullName(from),
    evaluatee_id: about[0],
    evaluatee_name: fullName(about),
    project_id: 'p1',
    percent_contribution: 33,
    positive_feedback: 'Kept the board current',
    submitted_at: submittedAt,
    updated_at: updatedAt,
  };
}

const ENTRIES = [
  entry(ADA, BEN, '2026-11-16T01:00:00Z'), // submitted after the deadline
  entry(BEN, ADA, '2026-11-14T20:00:00Z', '2026-11-15T09:00:00Z'), // on time, saved again after it
  entry(CAM, ADA, '2026-11-14T21:00:00Z'), // on time
];

function renderView(assignment: ApiAssignment = ASSIGNMENT) {
  api.getAssignmentTsrOverview.mockResolvedValue({
    assignment,
    projects: [{ id: 'p1', name: 'Trailhead' }],
    entries: ENTRIES,
    non_submitters_by_project: {},
  });
  render(<TSRView assignmentId="a1" />);
}

/** The table's rows below its header, in order. */
async function bodyRows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole('table');
  return within(table).getAllByRole('row').slice(1);
}

const nameCell = (row: HTMLElement, index = 0) => within(row).getAllByRole('cell')[index];

// jsdom has no layout: the member list scrolls its highlighted row into view.
const originalScrollIntoView = Element.prototype.scrollIntoView;
beforeAll(() => {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
});
afterAll(() => {
  Element.prototype.scrollIntoView = originalScrollIntoView;
});

beforeEach(() => {
  vi.resetAllMocks();
  api.getProjectMembers.mockResolvedValue({
    members: [ADA, BEN, CAM].map(([user_id, first_name, last_name]) => ({
      user_id,
      first_name,
      last_name,
      project_role: 'member',
      joined_at: '2026-10-01T00:00:00Z',
    })),
  });
});

describe('TSRView — late marks', () => {
  it('marks each response from its evaluator: late, edited late, or nothing', async () => {
    renderView();
    const [ada, ben, cam] = await bodyRows();

    expect(nameCell(ada)).toHaveTextContent('Ada Lovelace');
    expect(within(nameCell(ada)).getByText('Late')).toHaveClass('gt-badge--warning');
    expect(nameCell(ben)).toHaveTextContent('Ben Okafor');
    expect(within(nameCell(ben)).getByText('Edited late')).toHaveClass('gt-badge--info');
    expect(nameCell(cam)).toHaveTextContent('Cam Ruiz');
    expect(within(cam).queryByText(/late/i)).not.toBeInTheDocument();
    // The About cell names the teammate the response is about, not a submission.
    expect(within(nameCell(ada, 1)).queryByText('Late')).not.toBeInTheDocument();
  });

  it('marks nothing when the assignment has no deadline', async () => {
    renderView({ ...ASSIGNMENT, due_at: null });
    const rows = await bodyRows();
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(within(row).queryByText(/late/i)).not.toBeInTheDocument();
  });

  it('marks the one name cell of a member view, in either direction', async () => {
    const user = userEvent.setup();
    renderView();
    await bodyRows();
    const member = screen.getByRole('button', { name: 'All members' });
    await waitFor(() => expect(member).toBeEnabled());
    await user.click(member);
    await user.click(screen.getByRole('option', { name: 'Ada Lovelace' }));

    // About Ada: Ben's and Cam's responses, each under its evaluator.
    screen.getByRole('heading', { name: 'What teammates said about Ada Lovelace' });
    const [ben, cam] = await bodyRows();
    expect(nameCell(ben)).toHaveTextContent('Ben Okafor');
    expect(within(nameCell(ben)).getByText('Edited late')).toBeInTheDocument();
    expect(within(cam).queryByText(/late/i)).not.toBeInTheDocument();

    // From Ada: her one response, under the teammate it is about; it is still her late submission.
    await user.click(screen.getByRole('button', { name: 'From Ada Lovelace' }));
    screen.getByRole('heading', { name: 'What Ada Lovelace said about teammates' });
    const [about] = await bodyRows();
    expect(nameCell(about)).toHaveTextContent('Ben Okafor');
    expect(within(nameCell(about)).getByText('Late')).toBeInTheDocument();
  });
});
