import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiProjectMember } from '@/lib/api';
import type { ProjectMember } from '../projectMembers';

const deleteProject = vi.hoisted(() => vi.fn());
// The sprint summary never arrives, so the sprint card stays in its skeleton.
const getScrumSummary = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock('@/lib/api', () => ({ api: { deleteProject, getScrumSummary } }));
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
    deleteProject.mockResolvedValue({ message: 'Project deleted successfully' });
    const { onDelete } = renderView();

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));
    expect(deleteProject).not.toHaveBeenCalled(); // nothing happens before the confirmation
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(deleteProject).toHaveBeenCalledWith('p1');
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('keeps the page and says why when the deletion is refused', async () => {
    const user = userEvent.setup();
    deleteProject.mockRejectedValue(new Error('You are not enrolled in this class'));
    const { onDelete } = renderView();

    await user.click(screen.getByRole('button', { name: 'Delete Project' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('You are not enrolled in this class');
    expect(onDelete).not.toHaveBeenCalled();
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
