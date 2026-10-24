/** The Roster page lists the class's TAs apart from its students. */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRosterStudent } from '@/lib/api';

const CLASS = vi.hoisted(() => ({
  id: 'c1',
  name: 'CSE 115C',
  course_code: 'ABC123',
  created_by: 'me',
  created_at: '2026-01-01',
}));
const viewer = vi.hoisted(() => ({ role: 'instructor' as 'instructor' | 'student' }));
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: CLASS }),
  useSelectedClassRole: () => viewer.role,
}));
vi.mock('@/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ApiError, api: { getClassRoster: vi.fn() } };
});
// Charts are not what is under test, and recharts needs a layout engine.
vi.mock('@features/app/components/Roster/PieCharts', () => ({ default: () => null }));

import { api } from '@/lib/api';
import Roster from '../Roster';

const ADA: ApiRosterStudent = {
  id: 's1',
  name: 'Ada Lovelace',
  email: 'ada@ucsc.edu',
  class_status: 'enrolled',
  grepthink_status: 'registered',
  enrollment_role: 'student',
  projects: ['Trailhead'],
};
const BEN: ApiRosterStudent = {
  id: 's2',
  name: 'Ben Okafor',
  email: 'bokafor@ucsc.edu',
  class_status: 'not_on_roster',
  grepthink_status: 'registered',
  enrollment_role: 'student',
  projects: [],
};
// A TA is enrolled, so always registered, and rarely on the registrar's list.
const TARA: ApiRosterStudent = {
  id: 't1',
  name: 'Tara Singh',
  email: 'tsingh@ucsc.edu',
  class_status: 'not_on_roster',
  grepthink_status: 'registered',
  enrollment_role: 'ta',
  projects: [],
};

const studentsTable = () => screen.getByRole('table', { name: 'Students' });
const tasTable = () => screen.queryByRole('table', { name: 'TAs' });

async function openRoster() {
  const user = userEvent.setup();
  render(<Roster />);
  await screen.findByRole('table', { name: 'Students' });
  return user;
}

describe('Roster — the TA list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    viewer.role = 'instructor';
    vi.mocked(api.getClassRoster).mockResolvedValue({ students: [ADA, BEN, TARA], uploaded_at: null });
  });

  it('lists TAs apart from the students, without a course status', async () => {
    await openRoster();

    expect(within(studentsTable()).queryByText('Tara Singh')).not.toBeInTheDocument();
    const tas = tasTable()!;
    expect(within(tas).getByText('Tara Singh')).toBeInTheDocument();
    expect(within(tas).queryByRole('columnheader', { name: /Course Status/ })).not.toBeInTheDocument();
    expect(within(tas).queryByText('Not on Roster')).not.toBeInTheDocument();
    expect(within(tas).getByRole('columnheader', { name: /GrepThink Status/ })).toBeInTheDocument();
    expect(within(tas).getByText('Registered')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'TAs' })).toBeInTheDocument();
  });

  it('keeps TAs out of a filtered student list, and shows the TA list under All Students only', async () => {
    const user = await openRoster();

    await user.click(screen.getByRole('button', { name: 'All Students' }));
    await user.click(screen.getByRole('button', { name: 'Not On Roster' }));

    expect(within(studentsTable()).getByText('Ben Okafor')).toBeInTheDocument();
    expect(within(studentsTable()).queryByText('Tara Singh')).not.toBeInTheDocument();
    expect(tasTable()).not.toBeInTheDocument();
  });

  it('searches the students only: the TA list always shows in full', async () => {
    const user = await openRoster();
    const search = screen.getByRole('textbox', { name: 'Search students by name or email' });
    expect(search).toHaveAttribute('placeholder', 'Search students…');

    await user.type(search, 'ada');
    expect(within(studentsTable()).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(studentsTable()).queryByText('Ben Okafor')).not.toBeInTheDocument();
    expect(within(tasTable()!).getByText('Tara Singh')).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'singh');
    expect(screen.queryByRole('table', { name: 'Students' })).not.toBeInTheDocument();
    expect(within(tasTable()!).getByText('Tara Singh')).toBeInTheDocument();
  });

  it('lists TAs apart in the read-only roster too', async () => {
    viewer.role = 'student';
    await openRoster();

    expect(within(studentsTable()).queryByText('Tara Singh')).not.toBeInTheDocument();
    expect(within(tasTable()!).getByText('Tara Singh')).toBeInTheDocument();
    expect(within(tasTable()!).queryByRole('columnheader', { name: /Course Status/ })).not.toBeInTheDocument();
  });
});
