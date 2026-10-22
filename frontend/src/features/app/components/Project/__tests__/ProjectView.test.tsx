import { act, fireEvent, render, screen, waitForElementToBeRemoved, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiProjectMeeting, ApiProjectMember } from '@/lib/api';
import { ApiError } from '@/lib/api/client';
import type { ProjectMember } from '../projectMembers';

const deleteProject = vi.hoisted(() => vi.fn());
// The sprint summary never arrives, so the sprint card stays in its skeleton.
const getScrumSummary = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
// Nor do the team's meetings unless a test says otherwise: the meetings card stays in its skeleton.
const getProjectMeetings = vi.hoisted(() => vi.fn((): Promise<unknown> => new Promise(() => {})));
const createProjectMeeting = vi.hoisted(() => vi.fn());
// The schools list never arrives either, so times stay on the default campus zone.
const getInstitutions = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock('@/lib/api', () => ({
  api: { deleteProject, getScrumSummary, getProjectMeetings, createProjectMeeting, getInstitutions },
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'creator' } }) }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1' }, classes: [] }),
  useClassRole: () => 'student',
}));
vi.mock('@features/messages/components/MessageButton', () => ({ MessageButton: () => null }));

import ProjectView from '../ProjectView';

const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'creator' } as ApiProject;
const teammate = { user_id: 'someone', project_role: 'product owner', joined_at: '2026-10-01' } as ApiProjectMember;
const ana: ProjectMember = { id: 'u-ana', displayName: 'Ana Lopez', roleLabel: 'Product Owner' };

function renderView(overrides: Partial<React.ComponentProps<typeof ProjectView>> = {}) {
  const onDelete = vi.fn();
  const utils = render(
    <MemoryRouter>
      <ProjectView
        projectId="p1"
        projectTitle="Alpha"
        descriptionMarkdown=""
        skills={[]}
        selectedRoles={[]}
        classId="c1"
        project={project}
        projectMembers={[]}
        userRoleOnProject={null}
        onDelete={onDelete}
        {...overrides}
      />
    </MemoryRouter>,
  );
  return { onDelete, ...utils };
}

describe('ProjectView — a project nobody is left in', () => {
  beforeEach(() => {
    deleteProject.mockReset();
  });

  it('lets its creator delete it after confirming', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => {};
    deleteProject.mockReturnValue(new Promise((resolve) => (finish = () => resolve({ message: 'Project deleted successfully' }))));
    const { onDelete } = renderView();

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));
    expect(deleteProject).not.toHaveBeenCalled(); // nothing happens before the confirmation
    const question = screen.getByRole('alertdialog', { name: 'Delete project?' });
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(question).getByRole('button', { name: 'Delete' }));

    expect(deleteProject).toHaveBeenCalledWith('p1');
    // The question waits, busy, until the deletion answers.
    expect(within(question).getByRole('button', { name: 'Deleting…' })).toHaveAttribute('aria-busy', 'true');
    await act(async () => finish());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the page and says why in the question when the deletion is refused', async () => {
    const user = userEvent.setup();
    deleteProject.mockRejectedValue(new Error('You are not enrolled in this class'));
    const { onDelete } = renderView();

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You are not enrolled in this class');
    expect(within(screen.getByRole('alertdialog', { name: 'Delete project?' })).getByRole('alert')).toBe(alert);
    expect(onDelete).not.toHaveBeenCalled();

    // Asked again, it starts without the old reason.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Delete Project' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('is not offered while members remain', () => {
    renderView({ projectMembers: [teammate] });
    expect(screen.queryByRole('button', { name: 'Delete Project' })).not.toBeInTheDocument();
  });

  it('is not offered to someone who did not create the project', () => {
    renderView({ project: { ...project, created_by: 'someone-else' } });
    expect(screen.queryByRole('button', { name: 'Delete Project' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /request to join/i })).toBeInTheDocument();
  });
});

describe('ProjectView', () => {
  beforeEach(() => {
    getScrumSummary.mockClear();
    getProjectMeetings.mockClear();
  });

  it('has no view tabs', () => {
    renderView();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByText('Scrum Board')).not.toBeInTheDocument();
  });

  it('shows the member count in the header', () => {
    renderView({ teamSize: '4', members: [ana] });
    expect(screen.getByRole('button', { name: /1\/4 members/ })).toBeInTheDocument();
  });

  it('hides the spots line without a team size', () => {
    const { unmount } = renderView({ members: [ana] });
    expect(screen.queryByText(/spot/i)).not.toBeInTheDocument();
    unmount();

    renderView({ teamSize: '4', members: [ana] });
    expect(screen.getByText('3 spots available')).toBeInTheDocument();
  });

  it('lists roles needed without a count badge', () => {
    renderView({ selectedRoles: ['frontend'] });
    const roles = screen.getByRole('region', { name: 'Roles needed' });
    expect(within(roles).getByText('Frontend Developer')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('renders the description as Markdown', () => {
    renderView({ descriptionMarkdown: '## Goals\n\n- ship' });
    const description = screen.getByRole('region', { name: 'Project description' });
    expect(within(description).getByRole('heading', { level: 2, name: 'Goals' })).toBeInTheDocument();
    expect(within(description).getByRole('listitem')).toHaveTextContent('ship');
  });

  it('offers Leave project from the Joined menu', async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    renderView({ userRoleOnProject: 'member', onLeave });

    await user.click(screen.getByRole('button', { name: /joined/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Leave project' }));

    expect(onLeave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes the Joined menu on Esc and hands focus back to its button', async () => {
    const user = userEvent.setup();
    renderView({ userRoleOnProject: 'member' });
    const joined = screen.getByRole('button', { name: /joined/i });

    await user.click(joined);
    expect(screen.getByRole('menuitem', { name: 'Leave project' })).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(joined).toHaveFocus();
  });

  it('turns Requested into Unsend while the pointer is on it', async () => {
    const user = userEvent.setup();
    renderView({ pendingRequestId: 'r1' });

    await user.hover(screen.getByRole('button', { name: 'Requested' }));
    expect(screen.getByRole('button', { name: 'Unsend' })).toBeInTheDocument();
    await user.unhover(screen.getByRole('button', { name: 'Unsend' }));
    expect(screen.getByRole('button', { name: 'Requested' })).toBeInTheDocument();
  });

  it('hides the Looking for row without skills', () => {
    const { unmount } = renderView();
    expect(screen.queryByText('Looking for:')).not.toBeInTheDocument();
    unmount();

    renderView({ skills: ['React'] });
    expect(screen.getByText('Looking for:')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  it('renders the empty Create Project preview without a project', () => {
    render(
      <MemoryRouter>
        <ProjectView projectTitle="" descriptionMarkdown="" skills={[]} selectedRoles={[]} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Project Title' })).toBeInTheDocument();
    expect(screen.queryByText('CSE 115B')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '0 members' })).toBeInTheDocument();
    expect(screen.getByText('No description yet.')).toBeInTheDocument();
    // No project yet, so no sprint to show.
    expect(screen.queryByRole('region', { name: 'Sprint progress' })).not.toBeInTheDocument();
    expect(getScrumSummary).not.toHaveBeenCalled();
    // Nor any team meetings.
    expect(screen.queryByRole('region', { name: 'Team meetings' })).not.toBeInTheDocument();
    expect(getProjectMeetings).not.toHaveBeenCalled();
  });

  it('renders the aside only when it has a card to hold', () => {
    const preview = (selectedRoles: string[]) => (
      <MemoryRouter>
        <ProjectView projectTitle="" descriptionMarkdown="" skills={[]} selectedRoles={selectedRoles} />
      </MemoryRouter>
    );
    // The Create Project preview before any role is picked: no project for a sprint card, no roles.
    const { container, rerender, unmount } = render(preview([]));
    const content = () => container.querySelector('.project-view__content');
    expect(container.querySelector('.project-view__aside')).toBeNull();
    expect(content()).toHaveClass('project-view__content--single');

    rerender(preview(['frontend']));
    expect(container.querySelector('.project-view__aside')).not.toBeNull();
    expect(content()).not.toHaveClass('project-view__content--single');
    unmount();

    // A project page holds the sprint card, roles or not.
    const page = renderView().container;
    expect(page.querySelector('.project-view__aside')).not.toBeNull();
    expect(page.querySelector('.project-view__content')).not.toHaveClass('project-view__content--single');
  });
});

describe('ProjectView — the team meetings card', () => {
  const DAY_MS = 86_400_000;
  /** A meeting row as the API sends it, starting `days` from now. */
  const row = (over: Partial<ApiProjectMeeting> = {}, days = 2): ApiProjectMeeting => ({
    id: 'm1',
    project_id: 'p1',
    title: 'Design review',
    starts_at: new Date(Date.now() + days * DAY_MS).toISOString(),
    duration_minutes: 60,
    location: null,
    zoom_url: null,
    note: null,
    created_by: 'someone',
    updated_at: '2026-10-01T00:00:00+00:00',
    ...over,
  });
  /** The card in the page's aside (the Edit Project modal's Meetings tab is a region of that name too). */
  const card = () => {
    const aside = document.querySelector<HTMLElement>('.project-view__aside');
    return aside ? within(aside).queryByRole('region', { name: 'Team meetings' }) : null;
  };

  beforeEach(() => {
    getProjectMeetings.mockClear();
    createProjectMeeting.mockReset();
  });

  it('hides the card from members when there are no meetings', async () => {
    getProjectMeetings.mockResolvedValueOnce({ meetings: [], can_manage: false });
    renderView({ userRoleOnProject: 'member' });

    // The card holds its place while the meetings load, then goes: there is nothing to show.
    expect(card()).toBeInTheDocument();
    await waitForElementToBeRemoved(card);
    expect(getProjectMeetings).toHaveBeenCalledWith('p1');
  });

  it('shows every member the team’s meetings, without Manage', async () => {
    getProjectMeetings.mockResolvedValueOnce({ meetings: [row()], can_manage: false });
    renderView({ userRoleOnProject: 'member' });

    expect(await within(card()!).findByText('Design review')).toBeInTheDocument();
    expect(within(card()!).getByText('Alpha')).toBeInTheDocument(); // the team, in the row's context line
    expect(within(card()!).queryByRole('button', { name: 'Manage' })).not.toBeInTheDocument();
  });

  it('sits between Sprint progress and Roles needed', async () => {
    getProjectMeetings.mockResolvedValueOnce({ meetings: [row()], can_manage: false });
    renderView({ userRoleOnProject: 'member', selectedRoles: ['frontend'] });

    await within(card()!).findByText('Design review');
    const aside = document.querySelector('.project-view__aside')!;
    const names = within(aside as HTMLElement)
      .getAllByRole('region')
      .map((region) => region.getAttribute('aria-labelledby'))
      .map((id) => document.getElementById(id!)!.textContent);
    expect(names).toEqual(['Sprint progress', 'Team meetings', 'Roles needed']);
  });

  it('lists every upcoming meeting, since there is no Schedule page to send the rest to', async () => {
    const meetings = [1, 2, 3, 4, 5, 6].map((n) => row({ id: `m${n}`, title: `Meeting ${n}` }, n));
    getProjectMeetings.mockResolvedValueOnce({ meetings, can_manage: false });
    renderView({ userRoleOnProject: 'member' });

    expect(await within(card()!).findByText('Meeting 6')).toBeInTheDocument();
    expect(within(card()!).queryByText(/more · See all in Schedule/)).not.toBeInTheDocument();
  });

  it('hides the card from someone outside the team', async () => {
    getProjectMeetings.mockRejectedValueOnce(new ApiError(403, 'Not a member of this project', 'Request failed'));
    renderView();

    await waitForElementToBeRemoved(card);
  });

  it('says so when the meetings cannot load, and tries again', async () => {
    const user = userEvent.setup();
    getProjectMeetings
      .mockRejectedValueOnce(new ApiError(500, 'Internal server error', 'Request failed'))
      .mockResolvedValueOnce({ meetings: [row()], can_manage: false });
    renderView({ userRoleOnProject: 'member' });

    expect(await within(card()!).findByText('Couldn’t load team meetings.')).toBeInTheDocument();
    await user.click(within(card()!).getByRole('button', { name: 'Try again' }));

    expect(await within(card()!).findByText('Design review')).toBeInTheDocument();
    expect(getProjectMeetings).toHaveBeenCalledTimes(2);
  });

  it('gives the Product Owner a quiet line that opens the Meetings tab', async () => {
    const user = userEvent.setup();
    getProjectMeetings.mockResolvedValueOnce({ meetings: [], can_manage: true });
    renderView({ userRoleOnProject: 'product owner' });

    await user.click(await within(card()!).findByRole('button', { name: 'Add one' }));

    // Edit Project opens on Meetings: its empty state, and Done instead of Save Changes.
    expect(screen.getByText('No team meetings yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument();
  });

  it('opens Edit Project on Details from the header, Meetings tab and all, for the Product Owner', async () => {
    const user = userEvent.setup();
    getProjectMeetings.mockResolvedValueOnce({ meetings: [row()], can_manage: true });
    renderView({ userRoleOnProject: 'product owner' });

    await user.click(screen.getByRole('button', { name: /Edit Project\/Roles/ }));
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Meetings' })).toBeInTheDocument();
  });

  it('shows no Meetings tab to a project admin who is not the Product Owner', async () => {
    const user = userEvent.setup();
    renderView({ userRoleOnProject: 'admin' });

    await user.click(screen.getByRole('button', { name: /Edit Project\/Roles/ }));
    expect(screen.getByRole('tab', { name: 'Team' })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Meetings' })).not.toBeInTheDocument();
  });

  it('adds a meeting from the Meetings tab and shows it on the card', async () => {
    const user = userEvent.setup();
    getProjectMeetings.mockResolvedValueOnce({ meetings: [row()], can_manage: true });
    createProjectMeeting.mockResolvedValueOnce(row({ id: 'm2', title: 'Retro' }, 3));
    renderView({ userRoleOnProject: 'product owner' });

    await user.click(await within(card()!).findByRole('button', { name: 'Manage' }));
    await user.click(screen.getByRole('button', { name: 'Add meeting' }));
    await user.type(screen.getByRole('textbox', { name: 'Title' }), 'Retro');
    fireEvent.change(screen.getByLabelText(/^Date/), { target: { value: '2099-01-15' } });
    fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: '10:00' } });
    await user.click(screen.getAllByRole('button', { name: 'Add meeting' }).at(-1)!);

    expect(createProjectMeeting).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ title: 'Retro', duration_minutes: 60, location: null, zoom_url: null, note: null }),
    );
    expect(createProjectMeeting.mock.calls[0][1].starts_at).toMatch(/^2099-01-1[45]T/);
    expect(await within(card()!).findByText('Retro')).toBeInTheDocument();
    expect(await screen.findByText('Meeting added.')).toBeInTheDocument();
    // The page answers the tab with the new meeting, so focus lands on its row.
    expect(screen.getByRole('button', { name: 'Edit Retro' })).toHaveFocus();
  });
});
