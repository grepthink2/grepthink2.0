import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

const createProject = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ api: { getProjects: vi.fn(), getClassProjects: vi.fn(), createProject } }));
// The class's instructor: no team membership to check first.
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1', name: 'CSE 115A' } }),
  useSelectedClassRole: () => 'instructor',
}));

import CreateProject from '../CreateProject';

function OpenedProject() {
  const { projectId } = useParams();
  return <p>Opened project {projectId}</p>;
}

describe('CreateProject — creating the project', () => {
  it('opens the project the API answers with', async () => {
    createProject.mockResolvedValue({
      id: 'p1',
      class_id: 'c1',
      name: 'Trailhead',
      created_by: 'u1',
      created_at: '2026-10-23T12:00:00Z',
      team_size: 4,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/app/create-project']}>
        <Routes>
          <Route path="/app/create-project" element={<CreateProject />} />
          <Route path="/app/projects/:projectId" element={<OpenedProject />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByPlaceholderText('Your Project Title Here'), 'Trailhead');
    await user.type(screen.getByPlaceholderText('How Many People?'), '4');
    await user.click(screen.getByRole('button', { name: 'Create Project' }));

    expect(await screen.findByText('Opened project p1')).toBeInTheDocument();
    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ class_id: 'c1', name: 'Trailhead', team_size: 4 }),
    );
  });
});
