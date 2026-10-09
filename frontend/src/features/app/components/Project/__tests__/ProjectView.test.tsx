import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiProjectMember } from '@/lib/api';

const deleteProject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { deleteProject } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'creator' } }) }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1' } }),
  useClassRole: () => 'student',
}));
vi.mock('@features/messages/components/MessageButton', () => ({ MessageButton: () => null }));

import ProjectView from '../ProjectView';

const project = { id: 'p1', class_id: 'c1', name: 'Alpha', created_by: 'creator' } as ApiProject;
const teammate = { user_id: 'someone', project_role: 'product owner', joined_at: '2026-10-01' } as ApiProjectMember;

function renderView(overrides: Partial<React.ComponentProps<typeof ProjectView>> = {}) {
  const onDelete = vi.fn();
  render(
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
  return { onDelete };
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
