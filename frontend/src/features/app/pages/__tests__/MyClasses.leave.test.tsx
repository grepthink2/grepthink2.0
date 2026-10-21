import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ctx = vi.hoisted(() => ({
  visibleClasses: [
    { id: 'a', name: 'CSE 115A', created_by: 'prof', created_at: '', status: 'active', my_role: 'student', institution: null },
  ],
  loading: false,
  successMessage: null,
  setSuccessMessage: vi.fn(),
  setSelectedClass: vi.fn(),
  getClassStatus: () => 'active',
  refreshClasses: vi.fn(() => Promise.resolve()),
  previewClassId: null,
}));
const leaveClass = vi.hoisted(() => vi.fn());

vi.mock('@/lib/classContext', () => ({ useClass: () => ctx }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ canCreateClasses: false }) }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));
vi.mock('@/lib/api', () => ({ api: { leaveClass } }));
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useOutletContext: () => ({ openJoinClassModal: vi.fn() }),
}));

import MyClasses from '../MyClasses';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const renderPage = () => render(<MemoryRouter><MyClasses /></MemoryRouter>);

describe('My Classes — leaving a class', () => {
  it('asks first, waits busy while the class answers, then leaves and says so', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    leaveClass.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    renderPage();
    const leave = screen.getByRole('button', { name: 'Leave CSE 115A' });
    await user.click(leave);

    const question = screen.getByRole('alertdialog', { name: 'Leave CSE 115A?' });
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    const confirm = within(question).getByRole('button', { name: 'Leave class' });
    expect(confirm).toHaveClass('gt-button--danger');
    await user.click(confirm);
    expect(leaveClass).toHaveBeenCalledWith('a');
    expect(within(question).getByRole('button', { name: 'Leaving…' })).toHaveAttribute('aria-busy', 'true');
    // Still busy: Esc waits.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog', { name: 'Leave CSE 115A?' })).toBeInTheDocument();

    await act(async () => finish());
    expect(ctx.refreshClasses).toHaveBeenCalledWith(false);
    expect(ctx.setSuccessMessage).toHaveBeenCalledWith('You have left CSE 115A.');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  });

  it('keeps the question open with the reason when leaving fails, and Cancel leaves the class alone', async () => {
    const user = userEvent.setup();
    leaveClass.mockRejectedValue(new Error('500'));
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Leave CSE 115A' }));
    await user.click(screen.getByRole('button', { name: 'Leave class' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not leave CSE 115A. Please try again.');
    expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBe(alert);
    expect(ctx.setSuccessMessage).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Leave CSE 115A' })).toHaveFocus();
    // Its title holds while it fades out.
    expect(screen.getByRole('alertdialog', { name: 'Leave CSE 115A?' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(ctx.refreshClasses).not.toHaveBeenCalled();
  });
});
