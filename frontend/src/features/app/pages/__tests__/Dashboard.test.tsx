import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRosterStudent } from '@/lib/api';

const api = vi.hoisted(() => ({
  getProjects: vi.fn(),
  getAssignments: vi.fn(),
  getClassRoster: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1', enrolled_count: 12 } }),
}));
vi.mock('@features/app/hooks/useClassTurnInStats', () => ({
  useClassTurnInStats: () => ({
    turnInRate: { rate: 80, teamsSubmitted: { count: 4, total: 5 }, partialSubmissions: { count: 0, total: 5 }, currentAssignment: 'TSR 2', dueDate: 'Oct 20, 2026' },
    stats: null,
  }),
}));

import Dashboard from '../Dashboard';

const student = (id: string, class_status: ApiRosterStudent['class_status']): ApiRosterStudent => ({
  id, name: id, email: `${id}@ucsc.edu`, class_status, grepthink_status: 'registered', projects: [],
});

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/app/dashboard']}>
      <Routes>
        <Route path="/app/dashboard" element={<Dashboard />} />
        <Route path="/app/projects" element={<p>Projects page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.getProjects.mockResolvedValue({ projects: [{ id: 'p1' }, { id: 'p2' }] });
  api.getAssignments.mockResolvedValue({ assignments: [] });
  api.getClassRoster.mockResolvedValue({ students: [student('ana', 'enrolled'), student('ben', 'not_on_roster')], uploaded_at: null });
});

describe('Dashboard', () => {
  it('shows the class figures on four metric cards, each a button to its page', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const metrics = screen.getByRole('region', { name: 'Class metrics' });
    expect(await within(metrics).findByRole('button', { name: 'Active Projects: 2' })).toBeInTheDocument();
    expect(within(metrics).getByRole('button', { name: 'Registered Students: 12' })).toBeInTheDocument();
    expect(within(metrics).getByRole('button', { name: 'Turn-In Rate: 80%' })).toBeInTheDocument();
    const notOnRoster = within(metrics).getByRole('button', { name: 'Not On Roster: 1' });
    expect(notOnRoster).toHaveAccessibleDescription('Registered but unmatched');
    expect(notOnRoster.closest('.gt-stat-card')).toHaveClass('gt-stat-card--amber');

    await user.click(within(metrics).getByRole('button', { name: 'Active Projects: 2' }));
    expect(screen.getByText('Projects page')).toBeInTheDocument();
  });

  it('explains Registered Students in an ⓘ, the text its hover tooltip had', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('button', { name: 'Active Projects: 2' });
    await user.click(screen.getByRole('button', { name: 'About registered students' }));
    const panel = screen.getByRole('dialog', { name: 'Registered Students' });
    expect(within(panel).getByText('Students registered in GrepThink')).toBeInTheDocument();
    // Only that card has one.
    expect(screen.getAllByRole('button', { name: /^About / })).toHaveLength(1);
  });

  it('marks the cards busy while the class loads, and holds the roster hint until the roster arrives', async () => {
    let answer: (value: unknown) => void = () => {};
    api.getClassRoster.mockReturnValue(new Promise((resolve) => { answer = resolve; }));
    renderDashboard();
    const notOnRoster = screen.getByRole('button', { name: 'Not On Roster' });
    expect(notOnRoster.closest('.gt-stat-card')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('All matched')).not.toBeInTheDocument();
    expect(notOnRoster.closest('.gt-stat-card')!.querySelector('.gt-stat-card__hint .gt-skeleton')).not.toBeNull();

    answer({ students: [student('ana', 'enrolled')], uploaded_at: null });
    expect(await screen.findByText('All matched')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Not On Roster: 0' }).closest('.gt-stat-card')).not.toHaveAttribute('aria-busy');
  });
});
