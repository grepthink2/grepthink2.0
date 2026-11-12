import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stable across renders, as the real provider's are: the dashboard derives its list from them.
const classContext = vi.hoisted(() => ({
  selectedClass: { id: 'taught', name: 'SE 301', institution: null } as { id: string; name: string; institution: null } | null,
  visibleClasses: [
    { id: 'taught', name: 'SE 301', created_by: 'me', created_at: '', status: 'active', my_role: 'instructor', institution: null },
    { id: 'assisted', name: 'CSE 115C', created_by: 'prof', created_at: '', status: 'active', my_role: 'ta', institution: null },
    { id: 'taken', name: 'MATH 19A', created_by: 'prof2', created_at: '', status: 'active', my_role: 'student', institution: null },
  ],
  setSelectedClass: () => {},
  getClassStatus: () => 'active',
}));

const auth = vi.hoisted(() => ({ canCreateClasses: true }));

vi.mock('@/lib/classContext', () => ({ useClass: () => classContext }));
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }));
const api = vi.hoisted(() => ({
  getClassesAttentionSummary: vi.fn(() => Promise.resolve({ classes: [] })),
  getInstitutions: vi.fn(() => Promise.resolve([])),
  getSchedule: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));

import InstructorHomeDashboard from '../InstructorHomeDashboard';

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(() => {
  auth.canCreateClasses = true;
  classContext.selectedClass = { id: 'taught', name: 'SE 301', institution: null };
  api.getSchedule.mockReset();
  api.getSchedule.mockResolvedValue({ lens: 'instructor', items: [] });
});

describe('InstructorHomeDashboard', () => {
  it('lists only the classes you teach, not the ones you TA or take', async () => {
    render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open SE 301 dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open CSE 115C dashboard' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open MATH 19A dashboard' })).not.toBeInTheDocument();
  });

  it('offers Create Class only to an account that may create classes', async () => {
    const { unmount } = render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create class/i })).toBeInTheDocument();
    unmount();

    // Teaches the selected class, but POST /api/classes would answer 403.
    auth.canCreateClasses = false;
    render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create class/i })).not.toBeInTheDocument();
  });

  it("shows the selected class's week at the top of the main column, above Needs Attention", async () => {
    // Tue Nov 10, 2026, 3:12 PM at UTC-8: Wednesday's deadline is in the week shown in any zone.
    vi.useFakeTimers({ now: new Date('2026-11-10T23:12:00Z'), toFake: ['Date'] });
    api.getSchedule.mockResolvedValue({
      lens: 'instructor',
      items: [
        {
          id: 'deadline:a1',
          kind: 'deadline',
          title: 'TSR 4 due',
          starts_at: '2026-11-11T20:00:00Z',
          ends_at: null,
          all_day: false,
          assignment_id: 'a1',
          assignment_type: 'tsr',
        },
      ],
    });
    const { container } = render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    const card = screen.getByRole('heading', { name: 'Schedule' }).closest('section')!;
    expect(await within(card).findByRole('link', { name: 'TSR 4 due' })).toHaveAttribute('href', '/app/modules/tsr/a1');
    expect(screen.getAllByRole('region', { name: 'Schedule' })).toEqual([card]);
    expect(api.getSchedule).toHaveBeenCalledWith('taught', expect.any(Date), expect.any(Date), expect.any(AbortSignal));
    const [main, aside] = [...container.querySelectorAll('.instructor-home__column')];
    const headings = (column: Element) => [...column.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(headings(main)).toEqual(['Schedule', 'Needs Attention', 'Recent Activity']);
    expect(headings(aside)).toEqual(['Active Classes']);
  });

  it('asks nothing with no class selected', async () => {
    classContext.selectedClass = null;
    render(
      <MemoryRouter>
        <InstructorHomeDashboard />
      </MemoryRouter>,
    );
    expect(await screen.findByText('All caught up')).toBeInTheDocument();
    expect(await screen.findByText('Class events and deadlines will appear here.')).toBeInTheDocument();
    expect(api.getSchedule).not.toHaveBeenCalled();
  });
});
