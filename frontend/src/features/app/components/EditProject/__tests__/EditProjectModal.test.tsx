import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject } from '@/lib/api';
import { cssRules } from '@/test/cssRules';

const updateProject = vi.hoisted(() => vi.fn());
const deleteProject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { updateProject, deleteProject } }));

import EditProjectModal, { type EditProjectModalProps } from '../EditProjectModal';

const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'u-po', team_size: 4 } as ApiProject;
const NOW = new Date('2026-10-20T22:12:00Z');
// A fixed-offset zone: no daylight-saving rules to change under the test (AGENTS.md).
const ZONE = 'Etc/GMT+8';

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
    expect(within(dialog()).getByRole('tab', { name: 'Details' }).closest('.gt-modal__tabs')).not.toBeNull();
    // Opened on Details, focus moves to the first field.
    await settle();
    expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveFocus();
  });

  it('switches sections from a tablist in its header, linked to the panels, by click or arrow key', async () => {
    const user = userEvent.setup();
    renderModal({ viewerIsProductOwner: true, meetingsList: { meetings: [], now: NOW, zone: ZONE, schoolZone: ZONE } });
    await settle();
    const list = within(dialog()).getByRole('tablist', { name: 'Edit project sections' });
    expect(list.closest('.gt-modal__tabs')).not.toBeNull();
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Team', 'Meetings']);
    // On phones the tabs show their icons alone, and keep their names.
    expect(list).toHaveClass('gt-tabs--collapse');
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Details' })).toContainElement(screen.getByRole('textbox', { name: 'Project name' }));

    screen.getByRole('tab', { name: 'Details' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: 'Team' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Project name' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Meetings' }));
    expect(screen.getByRole('tabpanel', { name: 'Meetings' })).toContainElement(screen.getByRole('region', { name: 'Team meetings' }));
  });

  it('gives the Product Owner no Meetings tab without the team’s meetings (and their school’s zone) to show', () => {
    renderModal({ viewerIsProductOwner: true, initialTab: 'meetings' });
    const list = within(dialog()).getByRole('tablist', { name: 'Edit project sections' });
    expect(within(list).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Team']);
    // Asked to open on Meetings, it opens on Details instead.
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });

  it('is named Manage Project Admins for someone who only manages admins', () => {
    renderModal({ canEditProjectDetails: false, canManageAdmins: true });
    const admins = screen.getByRole('dialog', { name: 'Manage Project Admins' });
    expect(admins).toHaveAccessibleDescription('Assign or revoke admin access for project members');
    expect(within(admins).queryByRole('tab', { name: 'Details' })).not.toBeInTheDocument();
    // With no tab strip, the Team content sits in the body with no panel around it.
    expect(within(admins).queryByRole('tablist')).not.toBeInTheDocument();
    expect(within(admins).queryByRole('tabpanel')).not.toBeInTheDocument();
    expect(within(admins).getByText('Admin Access')).toBeInTheDocument();
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
      meetingsList: { meetings: [], now: NOW, zone: ZONE, schoolZone: ZONE, onCreate: vi.fn() },
    });
    await user.click(screen.getByRole('tab', { name: 'Meetings' }));
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

  it('gives focus back to the page button after a delete closes the confirm and the modal together', async () => {
    const user = userEvent.setup();
    deleteProject.mockResolvedValue(undefined);
    render(<Page onDelete={() => {}} />);
    const opener = screen.getByRole('button', { name: 'Edit Project/Roles' });
    await user.click(opener);
    await user.click(within(dialog()).getByRole('button', { name: 'Delete Project' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete Project' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
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

  it('gives Delete Project its own row on phones, with Cancel and Save Changes sharing the next', () => {
    renderModal();
    // The Modal stretches every footer button on phones; three in one row overflowed it.
    const [footer] = cssRules('.edit-project__footer', 'max-width: 767px');
    expect(footer.getPropertyValue('flex-wrap')).toBe('wrap');
    const [actions] = cssRules('.edit-project__footer-right', 'max-width: 767px');
    expect(actions.getPropertyValue('flex')).toBe('1 1 100%');
    expect(within(dialog()).getByRole('button', { name: 'Save Changes' }).parentElement).toHaveClass('edit-project__footer-right');
    expect(within(dialog()).getByRole('button', { name: 'Delete Project' }).parentElement).toHaveClass('edit-project__footer');
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
