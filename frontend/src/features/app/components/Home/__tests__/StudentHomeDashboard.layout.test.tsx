import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  getMySubmissions: vi.fn(),
  getProjects: vi.fn(),
  getProjectMembers: vi.fn(),
  getIncomingJoinRequests: vi.fn(),
  getPendingTeamInvites: vi.fn(),
  getMyJoinRequests: vi.fn(),
  getInstitutions: vi.fn(),
  getSchedule: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));

const SE101 = { id: 'c1', name: 'SE 101' };
const classContext = vi.hoisted(() => ({
  selectedClass: null as { id: string; name: string } | null,
  classes: [] as { id: string; name: string }[],
}));
vi.mock('@/lib/classContext', () => ({ useClass: () => classContext }));
vi.mock('@/lib/auth', () => ({ useUser: () => ({ user: { id: 'me' } }) }));
const preview = vi.hoisted(() => ({ isPreviewing: false }));
vi.mock('@/lib/previewContext', () => ({ usePreview: () => preview }));
// The invitation has tests of its own (features/connector); here, only what the Home hands it.
type InviteProps = { projectId: string | null; teamName?: string };
const moveInInvite = vi.hoisted(() => vi.fn<(props: InviteProps) => null>(() => null));
vi.mock('@features/connector/components/MoveInInvite', () => ({ default: moveInInvite }));

import { clearInstitutionsCache } from '@/lib/institutions';
import StudentHomeDashboard from '../StudentHomeDashboard';

const openJoinClassModal = vi.fn();

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<Outlet context={{ openJoinClassModal }} />}>
          <Route path="/" element={<StudentHomeDashboard />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const BANNER = /not in any class yet/;

beforeEach(() => {
  clearInstitutionsCache();
  vi.resetAllMocks();
  classContext.selectedClass = SE101;
  classContext.classes = [SE101];
  preview.isPreviewing = false;
  api.getInstitutions.mockResolvedValue([]);
  api.getSchedule.mockResolvedValue({ lens: 'student', items: [] });
  api.getProjects.mockResolvedValue({ projects: [] });
  api.getProjectMembers.mockResolvedValue({ members: [] });
  api.getIncomingJoinRequests.mockResolvedValue({ requests: [] });
  api.getPendingTeamInvites.mockResolvedValue({ requests: [] });
  api.getMyJoinRequests.mockResolvedValue({ requests: [] });
});

describe('StudentHomeDashboard layout', () => {
  it('hands the move-in invitation the selected team', async () => {
    api.getProjects.mockResolvedValue({ projects: [{ id: 'p1', name: 'Team One' }] });
    renderDashboard();
    await waitFor(() =>
      expect(moveInInvite.mock.lastCall?.[0]).toEqual({ projectId: 'p1', teamName: 'Team One' }),
    );
  });

  it('hands the move-in invitation no team when the student has none', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('No pending requests.')).toBeInTheDocument());
    expect(moveInInvite.mock.lastCall?.[0]).toMatchObject({ projectId: null });
  });

  it('offers to join a class when the student is in none', () => {
    classContext.selectedClass = null;
    classContext.classes = [];
    renderDashboard();
    expect(screen.getByText(BANNER)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join Class' }));
    expect(openJoinClassModal).toHaveBeenCalledTimes(1);
  });

  it('has no join banner or Join Class button for an enrolled student', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('No pending requests.')).toBeInTheDocument());
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /join/i })).not.toBeInTheDocument();
  });

  it('shows no banner to a student whose classes are all hidden: they are still enrolled', () => {
    classContext.selectedClass = null;
    renderDashboard();
    expect(screen.queryByText(BANNER)).not.toBeInTheDocument();
  });

  it('has no quick-action toolbar', () => {
    renderDashboard();
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /messages/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /browse/i })).not.toBeInTheDocument();
  });

  it('has no deadlines card and reads no assignments', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('No pending requests.')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /deadlines/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(api.getAssignments).not.toHaveBeenCalled();
    expect(api.getMySubmissions).not.toHaveBeenCalled();
  });

  it("puts Today's Schedule in the main column and Requests directly below the team card", () => {
    const { container } = renderDashboard();
    const headings = (column: string) =>
      [...container.querySelectorAll(`.student-home__column--${column} h2`)].map((h) => h.textContent);
    expect(headings('main')).toEqual(["Today's Schedule"]);
    expect(headings('aside')).toEqual(['Your team', 'Requests']);
  });
});

describe("StudentHomeDashboard Today's Schedule", () => {
  it('lists the selected class’s schedule from the endpoint', async () => {
    api.getSchedule.mockResolvedValue({
      lens: 'student',
      items: [
        {
          id: 'deadline:a1',
          kind: 'deadline',
          title: 'TSR 4 due',
          starts_at: '2099-01-01T07:59:00Z',
          ends_at: null,
          all_day: false,
          assignment_id: 'a1',
          assignment_type: 'tsr',
        },
      ],
    });
    renderDashboard();
    expect(await screen.findByRole('link', { name: 'TSR 4 due' })).toHaveAttribute('href', '/app/assignments/a1');
    expect(api.getSchedule).toHaveBeenCalledWith('c1', expect.any(Date), expect.any(Date), expect.any(AbortSignal));
  });

  it('asks nothing with no class selected', async () => {
    classContext.selectedClass = null;
    renderDashboard();
    expect(screen.getByText('Class events and deadlines will appear here.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No pending requests.')).toBeInTheDocument());
    expect(api.getSchedule).not.toHaveBeenCalled();
  });

  it('asks nothing in the student preview, and says why it is empty', async () => {
    preview.isPreviewing = true;
    renderDashboard();
    expect(screen.getByText("The schedule isn't part of the student preview.")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No pending requests.')).toBeInTheDocument());
    expect(api.getSchedule).not.toHaveBeenCalled();
  });
});
