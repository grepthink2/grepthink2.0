import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiProject, ApiProjectMember } from '@/lib/api';

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  getProjectMembers: vi.fn(),
  getProjectTAs: vi.fn(),
  getMyJoinRequests: vi.fn(),
  // The board never arrives, so the sprint card stays in its skeleton.
  getScrumBoard: vi.fn(() => new Promise(() => {})),
}));
// The project belongs to CSE 115B while the sidebar has CSE 115C selected.
const classContext = vi.hoisted(() => ({
  selectedClass: { id: 'c2', name: 'CSE 115C' },
  classes: [
    { id: 'c1', name: 'CSE 115B' },
    { id: 'c2', name: 'CSE 115C' },
  ],
}));
const preview = vi.hoisted(() => ({ isPreviewing: false, enterPreview: () => {} }));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => classContext,
  useClassRole: () => 'student',
}));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));
vi.mock('@features/messages/components/MessageButton', () => ({ MessageButton: () => null }));

import ProjectDetails from '../ProjectDetails';

const project = {
  id: 'p1',
  class_id: 'c1',
  name: 'Alpha',
  created_by: 'u-ana',
  team_size: 4,
  user_role: null,
} as ApiProject;
const members = [
  { user_id: 'u-ana', first_name: 'Ana', last_name: 'Lopez', project_role: 'owner', joined_at: '2026-10-01' },
  { user_id: 'u-ben', first_name: 'Ben', last_name: 'Okafor', project_role: 'scrum master', joined_at: '2026-10-02' },
] as ApiProjectMember[];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/projects/p1']}>
      <Routes>
        <Route path="/app/projects/:projectId" element={<ProjectDetails />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ProjectDetails', () => {
  beforeEach(() => {
    api.getProject.mockResolvedValue({ project });
    api.getProjectMembers.mockResolvedValue({ members });
    api.getProjectTAs.mockResolvedValue({ tas: [] });
    api.getMyJoinRequests.mockResolvedValue({ requests: [] });
  });

  it('names the class the project belongs to, not the selected one', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('CSE 115B')).toBeInTheDocument();
    expect(screen.queryByText('CSE 115C')).not.toBeInTheDocument();
  });

  it('labels the team with the shared project role labels', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /2\/4 members/ }));
    const panel = screen.getByRole('dialog', { name: 'Team members' });
    expect(within(panel).getByText('Owner')).toBeInTheDocument();
    expect(within(panel).getByText('Scrum Master')).toBeInTheDocument();
  });
});
