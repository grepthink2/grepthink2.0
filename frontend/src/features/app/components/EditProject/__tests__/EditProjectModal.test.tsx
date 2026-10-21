import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject } from '@/lib/api';

const updateProject = vi.hoisted(() => vi.fn());
const deleteProject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { updateProject, deleteProject } }));

import EditProjectModal, { type EditProjectModalProps } from '../EditProjectModal';

const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'u-po', team_size: 4 } as ApiProject;
const NOW = new Date('2026-10-20T22:12:00Z');
const LA = 'America/Los_Angeles';

/** A pending promise the test settles. */
function pending<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderModal(props: Partial<EditProjectModalProps> = {}) {
  const onClose = vi.fn();
  const onDelete = vi.fn();
  render(<EditProjectModal isOpen onClose={onClose} onDelete={onDelete} project={project} projectMembers={[]} {...props} />);
  return { onClose, onDelete };
}

/** The project page's way in: a button that opens the modal and gets focus back. */
function Page(props: Partial<EditProjectModalProps>) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Edit Project/Roles</button>
      <EditProjectModal isOpen={open} onClose={() => setOpen(false)} project={project} projectMembers={[]} {...props} />
    </>
  );
}

const dialog = () => screen.getByRole('dialog', { name: 'Edit Project' });

/** The dialog moves focus in a moment after it opens: let that moment pass. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  updateProject.mockReset();
  deleteProject.mockReset();
});

describe('EditProjectModal', () => {
  it('is a dialog named Edit Project, described by its subtitle, on the shared Modal', async () => {
    renderModal();
    expect(dialog()).toHaveAccessibleDescription('Manage your project configuration and team roles');
    expect(dialog()).toHaveClass('gt-modal', 'gt-modal--lg', 'edit-project');
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toHaveClass('gt-icon-button');
    // The tab strip sits in the header's slot, under the title.
    expect(within(dialog()).getByRole('button', { name: 'Details' }).closest('.gt-modal__tabs')).not.toBeNull();
    // Opened on Details, focus moves to the first field.
    await settle();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
  });

  it('is named Manage Project Admins for someone who only manages admins', () => {
    renderModal({ canEditProjectDetails: false });
    const admins = screen.getByRole('dialog', { name: 'Manage Project Admins' });
    expect(admins).toHaveAccessibleDescription('Assign or revoke admin access for project members');
    expect(within(admins).queryByRole('button', { name: 'Details' })).not.toBeInTheDocument();
    expect(within(admins).queryByRole('button', { name: /Delete Project/ })).not.toBeInTheDocument();
  });

  it('gives focus back to the button that opened it', async () => {
    const user = userEvent.setup();
    render(<Page />);
    const opener = screen.getByRole('button', { name: 'Edit Project/Roles' });
    await user.click(opener);
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Esc with the delete confirm open closes only the confirm', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal();
    const del = within(dialog()).getByRole('button', { name: 'Delete Project' });
    expect(del).toHaveClass('gt-button--danger-ghost');
    await user.click(del);
    const question = screen.getByRole('alertdialog', { name: 'Delete project?' });
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
    expect(del).toHaveFocus();
    expect(dialog()).toBeInTheDocument();

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc inside the meeting form cancels the form and keeps the modal open', async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal({
      viewerIsProductOwner: true,
      meetingsList: { meetings: [], now: NOW, zone: LA, schoolZone: LA, onCreate: vi.fn() },
    });
    await user.click(screen.getByRole('button', { name: 'Meetings' }));
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('form', { name: 'New meeting' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('while saving, Esc, the scrim and the × do not close, and Save keeps focus, busy', async () => {
    const user = userEvent.setup();
    const save = pending();
    updateProject.mockReturnValue(save.promise);
    const { onClose } = renderModal();
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' 2');
    const saveButton = screen.getByRole('button', { name: 'Save Changes' });
    await user.click(saveButton);

    expect(saveButton).toHaveFocus();
    expect(saveButton).toHaveAttribute('aria-busy', 'true');
    expect(saveButton).toHaveAccessibleName('Saving…');
    expect(within(dialog()).getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(within(dialog()).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await user.keyboard('{Escape}');
    fireEvent.mouseDown(dialog().parentElement as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => save.resolve({ project }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a refused save as an alert above the actions, keeping what was typed', async () => {
    const user = userEvent.setup();
    updateProject.mockRejectedValue(new Error('Project name is taken'));
    renderModal();
    await user.type(screen.getByRole('textbox', { name: 'Project name' }), ' 2');
    await user.click(screen.getByRole('button', { name: 'Save Changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Project name is taken');
    expect(alert).toHaveClass('gt-alert--error');
    expect(alert.parentElement).toHaveClass('gt-modal__body');
    expect(alert.parentElement?.lastElementChild).toBe(alert);
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Alpha 2');
  });

  it('deletes the project from the confirm, which waits busy, then closes', async () => {
    const user = userEvent.setup();
    const removal = pending();
    deleteProject.mockReturnValue(removal.promise);
    const { onClose, onDelete } = renderModal();
    await user.click(within(dialog()).getByRole('button', { name: 'Delete Project' }));
    const question = screen.getByRole('alertdialog', { name: 'Delete project?' });
    expect(question).toHaveAccessibleDescription(/permanently delete "Alpha"/);
    await user.click(within(question).getByRole('button', { name: 'Delete Project' }));

    expect(deleteProject).toHaveBeenCalledWith('p1');
    expect(within(question).getByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-busy', 'true');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await act(async () => removal.resolve(undefined));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps a refused delete in the confirm, with the reason, and starts clean when asked again', async () => {
    const user = userEvent.setup();
    deleteProject.mockRejectedValue(new Error('Only the owner can delete this project'));
    const { onClose, onDelete } = renderModal();
    await user.click(within(dialog()).getByRole('button', { name: 'Delete Project' }));
    const question = screen.getByRole('alertdialog', { name: 'Delete project?' });
    await user.click(within(question).getByRole('button', { name: 'Delete Project' }));

    expect(await within(question).findByRole('alert')).toHaveTextContent('Only the owner can delete this project');
    expect(onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(question).getByRole('button', { name: 'Cancel' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Delete Project' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes the confirm with the modal when the page closes it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { rerender } = render(<EditProjectModal isOpen onClose={onClose} project={project} projectMembers={[]} />);
    await user.click(within(dialog()).getByRole('button', { name: 'Delete Project' }));
    rerender(<EditProjectModal isOpen={false} onClose={onClose} project={project} projectMembers={[]} />);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
