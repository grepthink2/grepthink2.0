/**
 * The Final Reviews schedule is read-only for everyone: a team's time comes
 * only from the review slot it books, so even the instructor gets no time
 * editor. A TA can sign up to review a team only once it holds a slot.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFinalReviewSchedule, ApiFinalReviewTeam } from '@/lib/api';
import FinalReviews from '../FinalReviews';
import { formatReviewDay, formatReviewTime } from '../finalReviewTemplate';

const viewer = vi.hoisted(() => ({ role: 'instructor' as 'instructor' | 'ta', id: 'instr-1' }));

vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'class-1', name: 'CSE115C' } }),
  useSelectedClassRole: () => viewer.role,
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: viewer.id } }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getFinalReviewSchedule: vi.fn(),
    getClassTAs: vi.fn(),
    setReviewTA: vi.fn(),
  },
}));

// Imported AFTER the mock so this binding is the mocked module.
import { api } from '@/lib/api';

/** Midday on the US west coast. The assertions format it with the page's own
 * helpers, so they hold in any time zone. */
const BOOKED_AT = '2026-12-01T20:00:00Z';
const NO_SLOT = "This team hasn't booked a review slot yet.";

function team(overrides: Partial<ApiFinalReviewTeam> = {}): ApiFinalReviewTeam {
  return {
    project_id: 'proj-1',
    name: 'Team Alpha',
    final_review_at: BOOKED_AT,
    home_ta: { user_id: 'ta-home', name: 'Hana' },
    review_ta: null,
    ...overrides,
  };
}

function schedule(teams: ApiFinalReviewTeam[]): ApiFinalReviewSchedule {
  return {
    class_id: 'class-1',
    review_zoom_url: null,
    review_period_open: true,
    my_review_count: 0,
    teams,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <FinalReviews />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  viewer.role = 'instructor';
  viewer.id = 'instr-1';
  vi.mocked(api.getClassTAs).mockResolvedValue({ tas: [] });
  vi.mocked(api.setReviewTA).mockResolvedValue({ message: 'ok', project_id: 'proj-1', user_id: 'ta-2' });
});

describe('FinalReviews: times come from booked slots', () => {
  it('shows each booked time read-only, even to the instructor', async () => {
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(schedule([team()]));
    renderPage();

    const when = new Date(BOOKED_AT);
    expect(await screen.findByText(formatReviewDay(when))).toBeInTheDocument();
    expect(document.querySelector('input[type="datetime-local"]')).toBeNull();
    expect(screen.getByText(formatReviewTime(when))).toBeInTheDocument();
  });

  it('tells the instructor the schedule fills in as teams book slots', async () => {
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(schedule([]));
    renderPage();

    expect(
      await screen.findByText('No teams in this class yet. The schedule fills in once teams book review slots.'),
    ).toBeInTheDocument();
  });

  it('still lets the instructor appoint a Review TA for a team without a time', async () => {
    vi.mocked(api.getClassTAs).mockResolvedValue({
      tas: [{ id: 'ta-2', name: 'Tomás', email: null, projects: [] }],
    });
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(schedule([team({ final_review_at: null })]));
    const user = userEvent.setup();
    renderPage();

    const select = await screen.findByLabelText('Review TA for Team Alpha');
    expect(select).toBeEnabled();
    await screen.findByRole('option', { name: 'Tomás' });
    await user.selectOptions(select, 'ta-2');
    await waitFor(() => expect(api.setReviewTA).toHaveBeenCalledWith('proj-1', 'ta-2'));
  });
});

describe('FinalReviews: a TA signs up to review a team only once it holds a slot', () => {
  beforeEach(() => {
    viewer.role = 'ta';
    viewer.id = 'ta-2';
  });

  it('disables Sign up to review, and says why, for a team without a time', async () => {
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(schedule([team({ final_review_at: null })]));
    renderPage();

    const signUp = await screen.findByRole('button', { name: 'Sign up to review' });
    expect(signUp).toBeDisabled();
    expect(signUp).toHaveAccessibleDescription(NO_SLOT);
    expect(screen.getByText(NO_SLOT)).toBeVisible();
  });

  it('keeps Sign up to review working for a team with a time', async () => {
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(schedule([team()]));
    const user = userEvent.setup();
    renderPage();

    const signUp = await screen.findByRole('button', { name: 'Sign up to review' });
    expect(signUp).toBeEnabled();
    expect(screen.queryByText(NO_SLOT)).toBeNull();
    await user.click(signUp);
    await waitFor(() => expect(api.setReviewTA).toHaveBeenCalledWith('proj-1'));
    // The schedule is fetched again once the sign-up lands.
    await waitFor(() => expect(api.getFinalReviewSchedule).toHaveBeenCalledTimes(2));
  });
});
