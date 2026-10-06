import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFeedbackSubmission } from '@/lib/api';

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
