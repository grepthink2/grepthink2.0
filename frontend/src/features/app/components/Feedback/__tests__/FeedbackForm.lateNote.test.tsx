import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFeedbackSubmission } from '@/lib/api';
import { formatInstant } from '@/lib/dateUtils';

const api = vi.hoisted(() => ({ getMyFeedback: vi.fn() }));
vi.mock('@/lib/api', () => ({ api }));

import FeedbackForm, { type FeedbackFormAssignment } from '../FeedbackForm';

const DUE_AT = '2026-10-03T21:00:00+00:00';

const ASSIGNMENT: FeedbackFormAssignment = {
  id: 'f1',
  name: 'End-of-term feedback',
  dueDate: 'Oct 3, 2026 at 11:59 PM',
  classId: 'c1',
  dueAt: DUE_AT,
};

function submission(createdAt: string): ApiFeedbackSubmission {
  return {
    id: 's1',
    assignment_id: 'f1',
    student_id: 'me',
    q1_liked: 'The scrum board',
    q2_frustrating: 'Finding old TSRs',
    q3_missing_feature: 'Calendar export',
    q4_bugs: 'None',
    q5_suggestions: 'Dark mode',
    created_at: createdAt,
    updated_at: createdAt,
  };
}

async function renderWithSubmission(createdAt: string) {
  api.getMyFeedback.mockResolvedValue({ submission: submission(createdAt) });
  render(
    <MemoryRouter>
      <FeedbackForm assignment={ASSIGNMENT} />
    </MemoryRouter>,
  );
  await screen.findByText(/You are editing your previous submission/);
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('FeedbackForm late note', () => {
  it('notes a submission made after the deadline', async () => {
    await renderWithSubmission('2026-10-04T09:15:00+00:00');
    expect(screen.getByText('Submitted after the deadline')).toBeInTheDocument();
  });

  it('counts a submission at the deadline instant as late, as the server does', async () => {
    await renderWithSubmission(DUE_AT);
    expect(screen.getByText('Submitted after the deadline')).toBeInTheDocument();
  });

  it('says nothing for a submission made before the deadline', async () => {
    await renderWithSubmission('2026-10-03T20:59:00+00:00');
    expect(screen.queryByText('Submitted after the deadline')).not.toBeInTheDocument();
  });
});

describe('FeedbackForm submission window', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Renders the form for `assignment`, with the student's earlier answers when there are any. */
  function renderForm(
    assignment: FeedbackFormAssignment,
    earlier: ApiFeedbackSubmission | null,
    zone?: string,
  ) {
    api.getMyFeedback.mockResolvedValue({ submission: earlier });
    render(
      <MemoryRouter>
        <FeedbackForm assignment={assignment} zone={zone} />
      </MemoryRouter>,
    );
  }

  it('says the assignment is closed and disables Submit', async () => {
    vi.setSystemTime(new Date('2026-10-04T09:15:00Z')); // past due_at, no late window
    renderForm(ASSIGNMENT, submission('2026-10-03T20:00:00+00:00'));
    expect(await screen.findByText('This assignment is closed')).toBeInTheDocument();
    // Every answer is filled in: only the window keeps it disabled.
    expect(screen.getByRole('button', { name: 'Update Feedback' })).toBeDisabled();
  });

  it('says when the assignment opens and disables Submit', async () => {
    vi.setSystemTime(new Date('2026-09-27T12:00:00Z'));
    renderForm({ ...ASSIGNMENT, openDate: '2026-09-28' }, null, 'Europe/Istanbul');
    // Midnight on Sep 28 in Istanbul is Sep 27 21:00Z.
    const notice = `This assignment opens ${formatInstant('2026-09-27T21:00:00Z')}`;
    expect(await screen.findByText(notice)).toBeInTheDocument();
    for (const answer of screen.getAllByRole('textbox')) {
      fireEvent.change(answer, { target: { value: 'An answer' } });
    }
    expect(screen.getByRole('button', { name: 'Submit Feedback' })).toBeDisabled();
  });

  it('keeps Submit enabled inside the late window, with the late note', async () => {
    vi.setSystemTime(new Date('2026-10-05T12:00:00Z')); // past due_at, inside the late window
    renderForm(
      { ...ASSIGNMENT, acceptUntil: '2026-10-06T21:00:00+00:00' },
      submission('2026-10-04T09:15:00+00:00'),
    );
    expect(await screen.findByText('Submitted after the deadline')).toBeInTheDocument();
    expect(screen.queryByText(/^This assignment (is closed|opens)/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Feedback' })).toBeEnabled();
  });
});
