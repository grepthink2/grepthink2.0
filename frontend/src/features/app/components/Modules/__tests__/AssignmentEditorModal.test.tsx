import { act, render, screen } from '@testing-library/react';
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
