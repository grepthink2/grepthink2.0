/**
 * Regression coverage for the instructor time-edit keyboard path (Phase-D
 * review, items 8-9):
 *   - Tabbing from the datetime-local input to its ✓ confirm button must NOT
 *     revert the just-typed draft first — the old onMouseDown-preventDefault
 *     hack only protected the mouse-click path; a real Tab keypress fires a
 *     genuine blur with no mouse event to intercept, discarding the edit
 *     before Enter/Space on the button could ever commit it.
 *   - Emptying the input and confirming must NOT silently clear an existing
 *     schedule — that's the dedicated ✕ Clear button's job; ✓ should flag an
 *     emptied-against-a-real-value draft as invalid instead.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiFinalReviewSchedule } from '@/lib/api';
import FinalReviews from '../FinalReviews';

vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'class-1', name: 'CSE115C' } }),
}));

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'instr-1' } }),
}));

vi.mock('@/lib/api', () => ({
  api: {
    getFinalReviewSchedule: vi.fn(),
    getMyEnrollmentRole: vi.fn(),
    getClassTAs: vi.fn(),
    setFinalReviewTime: vi.fn(),
  },
}));

// Imported AFTER the mock so this binding is the mocked module.
import { api } from '@/lib/api';

const SCHEDULE: ApiFinalReviewSchedule = {
  class_id: 'class-1',
  review_zoom_url: null,
  review_period_open: true,
  my_review_count: 0,
  teams: [
    {
      project_id: 'proj-1',
      name: 'Team Alpha',
      final_review_at: '2026-08-01T20:00:00.000Z',
      home_ta: { user_id: 'ta-1', name: 'Tara' },
      review_ta: null,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <FinalReviews />
    </MemoryRouter>,
  );
}

describe('FinalReviews — instructor time-edit keyboard path', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getFinalReviewSchedule).mockResolvedValue(SCHEDULE);
    vi.mocked(api.getMyEnrollmentRole).mockResolvedValue({ enrollment_role: 'instructor' });
    vi.mocked(api.getClassTAs).mockResolvedValue({ tas: [] });
    vi.mocked(api.setFinalReviewTime).mockResolvedValue({
      message: 'ok', project_id: 'proj-1', final_review_at: null,
    });
  });

  it('Tab-to-✓ preserves the typed draft and commits it (does not revert on blur)', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText<HTMLInputElement>('Review time for Team Alpha');
    const confirmBtn = screen.getByLabelText('Confirm review time for Team Alpha');

    await user.click(input);
    // A wildly different value (vs. the 2026-08-01 seed) so it can never
    // coincidentally match regardless of the test runner's timezone.
    await user.clear(input);
    await user.type(input, '2030-01-15T09:30');
    expect(input.value).toBe('2030-01-15T09:30');

    await user.tab();
    expect(document.activeElement).toBe(confirmBtn);
    // The core regression assertion: focus moving to ✓ must not have
    // reverted the draft via the input's onBlur.
    expect(input.value).toBe('2030-01-15T09:30');

    await user.keyboard('{Enter}');
    await waitFor(() => expect(api.setFinalReviewTime).toHaveBeenCalledTimes(1));
    const [calledProjectId, calledIso] = vi.mocked(api.setFinalReviewTime).mock.calls[0];
    expect(calledProjectId).toBe('proj-1');
    expect(new Date(calledIso as string).getFullYear()).toBe(2030);
  });

  it('blurring to somewhere else (not ✓) still reverts an uncommitted edit', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText<HTMLInputElement>('Review time for Team Alpha');
    await user.click(input);
    await user.clear(input);
    await user.type(input, '2030-01-15T09:30');
    expect(input.value).toBe('2030-01-15T09:30');

    // Click elsewhere on the page (not the confirm button) — an abandoned edit.
    await user.click(document.body);
    await waitFor(() => expect(input.value).not.toBe('2030-01-15T09:30'));
    expect(api.setFinalReviewTime).not.toHaveBeenCalled();
  });

  it('emptying the input and confirming does not clear the schedule — flags invalid instead', async () => {
    const user = userEvent.setup();
    renderPage();

    const input = await screen.findByLabelText<HTMLInputElement>('Review time for Team Alpha');
    const confirmBtn = screen.getByLabelText('Confirm review time for Team Alpha');

    await user.click(input);
    await user.clear(input);
    expect(input.value).toBe('');

    await user.click(confirmBtn);

    expect(api.setFinalReviewTime).not.toHaveBeenCalled();
    await waitFor(() => expect(input).toHaveAttribute('aria-invalid', 'true'));
  });

  it('a real pointer click on ✓ never blurs the input at all (onMouseDown preventDefault)', async () => {
    // Composes with the relatedTarget-aware onBlur above: user-event's click()
    // faithfully simulates the browser's mousedown -> [conditional focus
    // shift] -> click sequence, so this is the one assertion that actually
    // depends on the button's onMouseDown={e => e.preventDefault()} — remove
    // it and jsdom's default (Chromium-like: a plain <button> DOES take
    // focus on click) kicks in, moving focus off the input and firing a real
    // blur. That blur happens to carry relatedTarget === the button, which
    // the relatedTarget guard on its own already recognizes and skips
    // reverting for (confirmed empirically) — so checking only "the value
    // committed correctly" would NOT catch onMouseDown being removed in
    // jsdom. Asserting activeElement stays on the input is what does: on
    // real Safari/Firefox, a plain <button> never takes focus on click
    // regardless, so without onMouseDown the input would still blur there —
    // only now with relatedTarget === null, which the guard can't recognize,
    // reverting the draft and disabling ✓ mid-click (see the next test).
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText<HTMLInputElement>('Review time for Team Alpha');
    const confirmBtn = screen.getByLabelText('Confirm review time for Team Alpha');

    await user.click(input);
    await user.clear(input);
    await user.type(input, '2030-01-15T09:30');

    await user.click(confirmBtn);

    expect(document.activeElement).toBe(input);
    await waitFor(() => expect(api.setFinalReviewTime).toHaveBeenCalledTimes(1));
    const [, calledIso] = vi.mocked(api.setFinalReviewTime).mock.calls[0];
    expect(new Date(calledIso as string).getFullYear()).toBe(2030);
  });

  it('a forced null-relatedTarget blur (the pre-fix Safari/Firefox failure mode) degrades safely instead of committing garbage', async () => {
    // Verified empirically (see the review that produced this test): a
    // directly-fired blur with relatedTarget: null cannot be distinguished
    // from an abandoned edit by anything short of the browser never having
    // blurred the input in the first place — which is exactly what
    // onMouseDown's preventDefault achieves for every REAL pointer-driven
    // click (previous test). This test pins the fallback for the residual
    // case (a blur reaches the input with no recognizable relatedTarget
    // regardless of cause): the draft reverts to the saved value, ✓
    // correctly disables itself (nothing left to confirm), and a subsequent
    // click is inert — a disabled button never dispatches click, so the
    // system fails SAFE (no call at all) rather than silently sending a
    // stale or wrong value. This holds no matter which onBlur/onMouseDown
    // guards exist; what the OTHER two tests in this file pin is that a
    // well-behaved focus transfer (Tab, or a real click with onMouseDown
    // present) never reaches this fallback path to begin with.
    const { fireEvent } = await import('@testing-library/react');
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText<HTMLInputElement>('Review time for Team Alpha');
    const confirmBtn = screen.getByLabelText<HTMLButtonElement>('Confirm review time for Team Alpha');

    await user.click(input);
    await user.clear(input);
    await user.type(input, '2030-01-15T09:30');

    fireEvent.blur(input, { relatedTarget: null });
    await waitFor(() => expect(input.value).not.toBe('2030-01-15T09:30'));
    expect(confirmBtn).toBeDisabled();

    await user.click(confirmBtn);
    expect(api.setFinalReviewTime).not.toHaveBeenCalled();
  });
});
