import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiAssignment, ApiInstitution } from '@/lib/api';
import { formatDeadline, formatInstant } from '@/lib/dateUtils';

const api = vi.hoisted(() => ({
  getAssignments: vi.fn(),
  getProjects: vi.fn(),
  getMySubmissions: vi.fn(),
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
vi.mock('@/lib/previewContext', () => ({ usePreview: () => ({ isPreviewing: false }) }));

import { clearInstitutionsCache } from '@/lib/institutions';
import Assignments from '../Assignments';

const ISTINYE: ApiInstitution = {
  id: 'istinye',
  name: 'İstinye University',
  slug: 'istinye',
  email_domains: ['istinye.edu.tr'],
  timezone: 'Europe/Istanbul',
};

// Opens at midnight on Oct 5 in Istanbul (Oct 4 21:00Z), ten hours before midnight in Pacific.
const OPENING: ApiAssignment = {
  id: 'a-opening',
  Title: 'TSR Week 2',
  open_date: '2026-10-05',
  close_date: '2026-10-11',
  due_at: '2026-10-11T21:00:00+00:00',
  status: 'publish',
  class_id: 'c1',
  assignment_type: 'tsr',
};

// Past its deadline (Oct 3 21:00Z) but inside a late window that ends Oct 6 21:00Z.
const LATE: ApiAssignment = {
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

function renderAssignments() {
  return render(
    <MemoryRouter initialEntries={['/app/assignments']}>
      <Routes>
        <Route path="/app/assignments" element={<Assignments />} />
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
  api.getAssignments.mockResolvedValue({ assignments: [OPENING, LATE] });
  api.getProjects.mockResolvedValue({ projects: [{ id: 'p1', name: 'Team Kestrel' }] });
  api.getMySubmissions.mockResolvedValue({ tsrs: [], feedback_assignment_ids: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Assignments', () => {
  it("opens an assignment at midnight in the school's zone", async () => {
    renderAssignments();
    await waitFor(() =>
      expect(within(rowOf('TSR Week 2')).getByRole('button', { name: 'Start' })).toBeInTheDocument(),
    );
    expect(within(rowOf('TSR Week 2')).getByText(formatDeadline(OPENING))).toBeInTheDocument();
    // The zone arrives after the load starts; the rows are rebuilt, not loaded again.
    expect(api.getAssignments).toHaveBeenCalledTimes(1);
  });

  it('keeps an assignment open in its late window and says until when', async () => {
    renderAssignments();
    await waitFor(() =>
      expect(within(rowOf('TSR Week 1')).getByRole('button', { name: 'Start' })).toBeInTheDocument(),
    );
    const row = rowOf('TSR Week 1');
    expect(within(row).getByText(formatDeadline(LATE))).toBeInTheDocument();
    expect(
      within(row).getByText(`Late submissions until ${formatInstant('2026-10-06T21:00:00+00:00')}`),
    ).toBeInTheDocument();
    expect(within(rowOf('TSR Week 2')).queryByText(/Late submissions until/)).not.toBeInTheDocument();
  });

  it('passes the deadline instant to the assignment page', async () => {
    renderAssignments();
    await waitFor(() =>
      expect(within(rowOf('TSR Week 1')).getByRole('button', { name: 'Start' })).toBeInTheDocument(),
    );
    fireEvent.click(within(rowOf('TSR Week 1')).getByRole('button', { name: 'Start' }));
    const state = JSON.parse((await screen.findByTestId('location-state')).textContent ?? 'null');
    expect(state).toMatchObject({ projectId: 'p1', dueAt: '2026-10-03T21:00:00+00:00' });
  });
});
