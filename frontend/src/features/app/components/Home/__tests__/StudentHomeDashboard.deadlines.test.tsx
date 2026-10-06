import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignment, ApiInstitution } from '@/lib/api';
import { formatDeadline } from '@/lib/dateUtils';

const api = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  getMySubmissions: vi.fn(),
  getProjects: vi.fn(),
  getProjectMembers: vi.fn(),
  getIncomingJoinRequests: vi.fn(),
  getPendingTeamInvites: vi.fn(),
  getMyJoinRequests: vi.fn(),
  getInstitutions: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  api,
  emptyMySubmissions: () => ({ tsrs: [], feedback_assignment_ids: [] }),
}));

// A class at a school in Istanbul (UTC+3, no daylight saving).
const classContext = vi.hoisted(() => ({
  selectedClass: {
    id: 'c1',
    name: 'SE 101',
    institution: { id: 'istinye', name: 'İstinye University', slug: 'istinye' },
  },
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => classContext }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: { id: 'me' } }) }));

import { clearInstitutionsCache } from '@/lib/institutions';
import StudentHomeDashboard from '../StudentHomeDashboard';

const ISTINYE: ApiInstitution = {
  id: 'istinye',
  name: 'İstinye University',
  slug: 'istinye',
  email_domains: ['istinye.edu.tr'],
  timezone: 'Europe/Istanbul',
};

// Opened at midnight on Oct 5 in Istanbul (Oct 4 21:00Z); due more than a week later.
const OPENED: ApiAssignment = {
  id: 'a-opened',
  Title: 'TSR Week 3',
  open_date: '2026-10-05',
  close_date: '2026-10-20',
  due_at: '2026-10-20T21:00:00+00:00',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
};

// Submitted; past its deadline (Oct 3 21:00Z) but inside a late window that ends Oct 6 21:00Z.
const SUBMITTED_LATE_WINDOW: ApiAssignment = {
  id: 'a-late',
  Title: 'TSR Week 1',
  open_date: '2026-09-28',
  close_date: '2026-10-03',
  due_at: '2026-10-03T21:00:00+00:00',
  accept_until: '2026-10-06T21:00:00+00:00',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
};

function LocationState() {
  return <pre data-testid="location-state">{JSON.stringify(useLocation().state)}</pre>;
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ openJoinClassModal: () => {} }} />}>
          <Route path="/" element={<StudentHomeDashboard />} />
        </Route>
        <Route path="/app/assignments/:assignmentId" element={<LocationState />} />
      </Routes>
    </MemoryRouter>,
  );
}

const rowOf = (name: string) => screen.getByText(name).closest('tr') as HTMLElement;

beforeEach(() => {
  clearInstitutionsCache();
  vi.resetAllMocks();
  // 00:30 on Oct 5 in Istanbul; still 14:30 on Oct 4 in Pacific.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-04T21:30:00Z'));
  api.getInstitutions.mockResolvedValue([ISTINYE]);
  api.getAssignments.mockResolvedValue({ assignments: [OPENED, SUBMITTED_LATE_WINDOW] });
  api.getMySubmissions.mockResolvedValue({
    tsrs: [{ assignment_id: 'a-late', project_id: 'p1' }],
    feedback_assignment_ids: [],
  });
  api.getProjects.mockResolvedValue({ projects: [{ id: 'p1', name: 'Team Kestrel' }] });
  api.getProjectMembers.mockResolvedValue({ members: [] });
  api.getIncomingJoinRequests.mockResolvedValue({ requests: [] });
  api.getPendingTeamInvites.mockResolvedValue({ requests: [] });
  api.getMyJoinRequests.mockResolvedValue({ requests: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StudentHomeDashboard deadlines', () => {
  it("counts an assignment open from midnight in the school's zone", async () => {
    renderDashboard();
    await waitFor(() => expect(within(rowOf('TSR Week 3')).getByText('In Progress')).toBeInTheDocument());
    expect(within(rowOf('TSR Week 3')).getByText(formatDeadline(OPENED))).toBeInTheDocument();
  });

  it('passes the deadline instant to the assignment page', async () => {
    renderDashboard();
    await waitFor(() => expect(within(rowOf('TSR Week 3')).getByText('In Progress')).toBeInTheDocument());
    fireEvent.click(rowOf('TSR Week 3'));
    const state = JSON.parse((await screen.findByTestId('location-state')).textContent ?? 'null');
    expect(state).toMatchObject({ projectId: 'p1', dueAt: '2026-10-20T21:00:00+00:00' });
  });

  it('keeps a submitted assignment while its late window is open', async () => {
    renderDashboard();
    await waitFor(() => expect(within(rowOf('TSR Week 1')).getByText('Completed')).toBeInTheDocument());
    expect(within(rowOf('TSR Week 1')).getByText(formatDeadline(SUBMITTED_LATE_WINDOW))).toBeInTheDocument();
  });
});
