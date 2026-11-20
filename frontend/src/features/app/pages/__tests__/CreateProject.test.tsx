import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

const renderPage = () => render(<MemoryRouter><CreateProject /></MemoryRouter>);
const problem = () => screen.getByPlaceholderText('What problem are you solving?');
const markdown = () => screen.getByPlaceholderText(/Enter your project description in Markdown/);

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

describe('CreateProject — its two confirmations', () => {
  it('asks before clearing the description, and Clear empties it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(problem(), 'Bikes are hard to find');
    await user.click(screen.getByRole('button', { name: 'Clear project description' }));

    const question = screen.getByRole('alertdialog', { name: 'Clear project description?' });
    expect(within(question).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(problem()).toHaveValue('Bikes are hard to find');

    await user.click(screen.getByRole('button', { name: 'Clear project description' }));
    const clear = screen.getByRole('button', { name: 'Clear' });
    expect(clear).toHaveClass('gt-button--danger');
    await user.click(clear);
    expect(problem()).toHaveValue('');
  });

  it('asks before switching custom markdown back to the template: Stay is focused and keeps it, Switch to template drops it', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Markdown' }));
    fireEvent.change(markdown(), { target: { value: '# Overview\n\nOur own words.' } });
    await user.click(screen.getByRole('button', { name: 'Template' }));

    const question = screen.getByRole('alertdialog', { name: 'Switch to Template?' });
    const stay = within(question).getByRole('button', { name: 'Stay' });
    expect(stay).toHaveFocus();
    await user.click(stay);
    expect(markdown()).toHaveValue('# Overview\n\nOur own words.');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Template' }));
    const switchButton = screen.getByRole('button', { name: 'Switch to template' });
    expect(switchButton).toHaveClass('gt-button--danger');
    await user.click(switchButton);
    expect(problem()).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Enter your project description in Markdown/)).not.toBeInTheDocument();
  });
});
