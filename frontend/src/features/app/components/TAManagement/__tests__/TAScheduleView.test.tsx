import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ApiClassDocument, ApiTAMeetingSchedule } from '@/lib/api';
import { ApiError } from '@/lib/api/client';

const api = vi.hoisted(() => ({
  getTAMeetingSchedule: vi.fn(),
  getMyTeamSchedule: vi.fn(),
  getClassTaRoster: vi.fn(),
  getClassDocuments: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: { id: 'c1', name: '2026F CSE115A' } }),
}));

import TAScheduleView from '../TAScheduleView';

function scheduleOf(meetingsPerWeek: number): ApiTAMeetingSchedule {
  return {
    class_id: 'c1',
    week_number: 1,
    total_weeks: 11,
    meeting_in_week: 1,
    meetings_per_week: meetingsPerWeek,
    total_meetings: 11 * meetingsPerWeek,
    teams: [],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  api.getClassTaRoster.mockResolvedValue({ tas: [] });
  api.getClassDocuments.mockResolvedValue({ documents: [] });
});

describe("TAScheduleView — the instructor's meetings-per-week picker", () => {
  it.each([
    [1, ['1', '2']],
    [2, ['1', '2']],
    [4, ['1', '2', '4']], // saved above 2 before the picker was trimmed: its own value stays
  ])('shows %i selected among %j', async (saved, offered) => {
    api.getTAMeetingSchedule.mockResolvedValue(scheduleOf(saved));
    render(
      <TAScheduleView title="TA Meetings" scope="all" editable assignable emptyMessage="No teams yet" />,
    );

    const picker = await screen.findByRole('combobox');
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual(offered);
    expect(picker).toHaveValue(String(saved));
  });
});

describe("TAScheduleView — each team's documents, for staff", () => {
  const withTeams: ApiTAMeetingSchedule = {
    ...scheduleOf(1),
    teams: [
      { project_id: 'p1', project_name: 'Trailhead', attendance_present: 0, attendance_total: 4 },
      { project_id: 'p2', project_name: 'Lumen', attendance_present: 0, attendance_total: 3 },
    ],
  };
  const doc = (projectId: string, status: 'draft' | 'final'): ApiClassDocument => ({
    id: `${projectId}-${status}`, kind: 'sprint_report', title: 'Sprint 1 report', project_id: projectId,
    project_name: 'x', sprint_name: 'Sprint 1', status, head_revision: 2, finalized_revision: status === 'final' ? 2 : null,
    edited_since: false, updated_at: '2026-11-16T10:00:00Z',
  });
  const renderView = (scope: 'all' | 'my-team' = 'all') => render(
    <MemoryRouter>
      <TAScheduleView title="TA Meetings" scope={scope} editable={scope === 'all'} assignable={scope === 'all'} emptyMessage="No teams yet" />
    </MemoryRouter>,
  );

  it('shows how many each team handed in, from one request, linking to its Documents tab', async () => {
    api.getTAMeetingSchedule.mockResolvedValue(withTeams);
    api.getClassDocuments.mockResolvedValue({ documents: [doc('p1', 'final'), doc('p1', 'draft')] });
    renderView();

    const link = await screen.findByRole('link', { name: '1 of 2 handed in: the documents of Trailhead' });
    expect(link).toHaveAttribute('href', '/app/projects/p1/board?view=documents');
    // Lumen has made none: no count for it.
    expect(screen.getAllByRole('link', { name: /handed in/ })).toHaveLength(1);
    expect(api.getClassDocuments).toHaveBeenCalledTimes(1);
    expect(api.getClassDocuments).toHaveBeenCalledWith('c1');
  });

  it('shows nothing when the list is refused', async () => {
    api.getTAMeetingSchedule.mockResolvedValue(withTeams);
    api.getClassDocuments.mockRejectedValue(new ApiError(403, 'Only the instructor or a class TA can read the class’s documents', 'x'));
    renderView();

    await screen.findByText('Trailhead');
    await waitFor(() => expect(api.getClassDocuments).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /handed in/ })).not.toBeInTheDocument();
  });

  it("never asks for a student's own team", async () => {
    api.getMyTeamSchedule.mockResolvedValue(withTeams);
    renderView('my-team');

    await screen.findByText('Trailhead');
    expect(api.getClassDocuments).not.toHaveBeenCalled();
  });
});
