/**
 * What the TA Review page test cannot reach: there the form unmounts when it closes, while in the
 * app it stays mounted between opens (lazyModal), and a failure without a message of its own.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format } from 'date-fns';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignment } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: { setAssignmentLateWindow: vi.fn() } }));

import { api } from '@/lib/api';
import LateWindowModal from '../LateWindowModal';

const NOW = new Date(2026, 10, 18, 12, 0);
const WINDOW = new Date(2026, 10, 18, 17, 0).toISOString();
const TSR3: ApiAssignment = {
  id: 'a3',
  Title: 'TSR 3',
  open_date: '2026-11-09',
  close_date: '2026-11-15',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
  due_at: new Date(2026, 10, 16, 0, 0).toISOString(),
  accept_until: null,
};
const TSR3_WINDOW: ApiAssignment = { ...TSR3, accept_until: WINDOW };

const field = () => screen.getByRole('button', { name: /^Accept late submissions until/ });

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('LateWindowModal', () => {
  it('starts each open from the window as it then stands, with no error left over', async () => {
    const user = userEvent.setup();
    const props = { onClose: vi.fn(), onSaved: vi.fn() };
    const { rerender } = render(<LateWindowModal open assignment={TSR3} {...props} />);
    expect(field()).toHaveAccessibleName('Accept late submissions until Select date & time');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a time after the deadline');

    rerender(<LateWindowModal open={false} assignment={TSR3} {...props} />);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Meanwhile the window opened (through the page, or by someone else).
    rerender(<LateWindowModal open assignment={TSR3_WINDOW} {...props} />);

    const dialog = await screen.findByRole('dialog', { name: 'Accept late submissions' });
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(field()).toHaveAccessibleName(`Accept late submissions until ${format(new Date(WINDOW), 'MMM d, yyyy')} · 5:00 PM`);
    expect(within(dialog).getByRole('button', { name: 'Remove late window' })).toBeInTheDocument();
  });

  it('gives focus back to "Remove late window" when its confirm is cancelled, and holds Save meanwhile', async () => {
    const user = userEvent.setup();
    render(<LateWindowModal open assignment={TSR3_WINDOW} onClose={vi.fn()} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove late window' }));
    const confirm = screen.getByRole('group');
    expect(within(confirm).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    await user.click(within(confirm).getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove late window' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(api.setAssignmentLateWindow).not.toHaveBeenCalled();
  });

  it('says what failed when a removal fails without a message', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setAssignmentLateWindow).mockRejectedValue('offline');
    const onSaved = vi.fn();
    render(<LateWindowModal open assignment={TSR3_WINDOW} onClose={vi.fn()} onSaved={onSaved} />);
    await user.click(screen.getByRole('button', { name: 'Remove late window' }));
    await user.click(within(screen.getByRole('group')).getByRole('button', { name: 'Remove late window' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to remove the late window');
    expect(onSaved).not.toHaveBeenCalled();
    // The confirm stays, ready for another try.
    expect(within(screen.getByRole('group')).getByRole('button', { name: 'Remove late window' })).toBeEnabled();
  });

  it('says what failed when a save fails without a message', async () => {
    const user = userEvent.setup();
    vi.mocked(api.setAssignmentLateWindow).mockRejectedValue('offline');
    const onClose = vi.fn();
    render(<LateWindowModal open assignment={TSR3_WINDOW} onClose={onClose} onSaved={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to save the late window');
    expect(api.setAssignmentLateWindow).toHaveBeenCalledWith('a3', WINDOW);
    expect(onClose).not.toHaveBeenCalled();
  });
});
