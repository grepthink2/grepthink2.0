import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiTAMeetingSchedule } from '@/lib/api';

const api = vi.hoisted(() => ({ getTAMeetingSchedule: vi.fn(), getClassTaRoster: vi.fn() }));
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
