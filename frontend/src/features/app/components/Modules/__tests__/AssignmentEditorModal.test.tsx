import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AssignmentEditorModal from '../AssignmentEditorModal';
import type { Assignment } from '../AssignmentList';

const TSR_1: Assignment = {
  id: 'assignment-1',
  title: 'Team Status Report 1',
  dueDate: 'Oct 12, 2026',
  openDate: '2026-10-05 00:00',
  dueDatetime: '2026-10-12 23:59',
  submitted: 0,
  total: 4,
  status: 'active',
};
const TSR_2: Assignment = { ...TSR_1, id: 'assignment-2', title: 'Team Status Report 2' };

describe('AssignmentEditorModal', () => {
  it('enables Save and Cancel for the next assignment opened after a delete', async () => {
    const user = userEvent.setup();
    let finishDelete: () => void = () => {};
    const onDelete = vi.fn(() => new Promise<void>((resolve) => (finishDelete = resolve)));
    const editor = (assignment: Assignment | null) => (
      <AssignmentEditorModal assignment={assignment} onClose={() => {}} onDelete={onDelete} />
    );

    // Modules loads the editor through lazyModal, which keeps it mounted
    // between opens, so each step rerenders the same instance.
    const { rerender } = render(editor(TSR_1));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }));
    expect(onDelete).toHaveBeenCalledWith('assignment-1');

    // The delete succeeds, and Modules closes the editor by clearing the assignment.
    await act(async () => finishDelete());
    rerender(editor(null));

    rerender(editor(TSR_2));
    const nameInput = screen.getByLabelText('Assignment Name');
    expect(nameInput).toHaveValue('Team Status Report 2');
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();

    // Save also waits for an edit.
    await user.clear(nameInput);
    await user.type(nameInput, 'Team Status Report 2 (revised)');
    expect(screen.getByRole('button', { name: 'Save Assignment' })).toBeEnabled();
  });
});

describe('AssignmentEditorModal — after the deadline', () => {
  const PAST: Assignment = {
    ...TSR_1,
    dueAt: '2026-10-13T07:00:00+00:00',
    acceptUntil: null,
  };

  it('offers a late-submission window instead of a movable due date, and saves it', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSave = vi.fn(() => Promise.resolve());
    render(<AssignmentEditorModal assignment={PAST} onClose={() => {}} onSave={onSave} />);

    expect(screen.getByText(/the deadline has passed/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Due Date & Time')).toBeDisabled();
    // The backend refuses an unpublish after the deadline, so Draft is not offered.
    expect(screen.getByRole('button', { name: /^Draft/ })).toBeDisabled();
    // No window is saved yet, so there is nothing to remove.
    expect(screen.queryByRole('button', { name: 'Remove late window' })).not.toBeInTheDocument();

    // The picker is a calendar popover, not a text box: open it, pick the day, then set the
    // time in its time box (which starts at 08:00).
    await user.click(screen.getByLabelText('Accept late submissions until'));
    await user.click(screen.getByRole('button', { name: /October 22nd, 2026/ }));
    fireEvent.change(screen.getByDisplayValue('08:00'), { target: { value: '23:59' } });
    await user.click(screen.getByRole('button', { name: 'Save Assignment' }));

    expect(onSave).toHaveBeenCalledWith('assignment-1', expect.objectContaining({ acceptUntil: '2026-10-22 23:59' }));
    vi.useRealTimers();
  });

  it('removes a saved late window', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSave = vi.fn(() => Promise.resolve());
    render(
      <AssignmentEditorModal
        assignment={{ ...PAST, acceptUntil: '2026-10-22T06:59:00+00:00' }}
        onClose={() => {}}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove late window' }));
    await user.click(screen.getByRole('button', { name: 'Save Assignment' }));

    expect(onSave).toHaveBeenCalledWith('assignment-1', expect.objectContaining({ acceptUntil: null }));
    vi.useRealTimers();
  });

  it('keeps the open date from passing a frozen due date', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z'), shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onSave = vi.fn(() => Promise.resolve());
    render(<AssignmentEditorModal assignment={PAST} onClose={() => {}} onSave={onSave} />);

    // The open date's calendar starts on its own month, October 2026: move it past the Oct 12 due date.
    await user.click(screen.getByLabelText('Open Date & Time'));
    await user.click(screen.getByRole('button', { name: /October 15th, 2026/ }));
    await user.click(screen.getByRole('button', { name: 'Save Assignment' }));

    expect(screen.getByText('Due date must be on or after open date')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('keeps the due date editable before the deadline', () => {
    vi.useFakeTimers({ now: new Date('2026-10-10T12:00:00Z') });
    render(<AssignmentEditorModal assignment={PAST} onClose={() => {}} />);
    expect(screen.queryByText(/the deadline has passed/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Due Date & Time')).toBeEnabled();
    vi.useRealTimers();
  });
});
