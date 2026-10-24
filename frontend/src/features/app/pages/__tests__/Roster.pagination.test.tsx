/** The Roster page pages its student list; the TA list always shows in full. */
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
vi.mock('@/lib/classContext', () => ({
  useClass: () => ({ selectedClass: CLASS }),
  useSelectedClassRole: () => 'instructor',
}));
vi.mock('@/lib/api', async () => {
  const { ApiError } = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ApiError, api: { getClassRoster: vi.fn() } };
});
// Charts are not what is under test, and recharts needs a layout engine.
vi.mock('@features/app/components/Roster/PieCharts', () => ({ default: () => null }));

import { api } from '@/lib/api';
import Roster from '../Roster';

/** Students 001 to 060, so the default sort by name keeps that order. */
const STUDENTS: ApiRosterStudent[] = Array.from({ length: 60 }, (_, i) => {
  const n = String(i + 1).padStart(3, '0');
  return {
    id: `s${n}`,
    name: `Student ${n}`,
    email: `student${n}@ucsc.edu`,
    class_status: 'enrolled',
    grepthink_status: 'registered',
    enrollment_role: 'student',
    projects: [],
  };
});
const TAS: ApiRosterStudent[] = ['Tara Singh', 'Theo Park'].map((name, i) => ({
  id: `t${i}`,
  name,
  email: `ta${i}@ucsc.edu`,
  class_status: 'not_on_roster',
  grepthink_status: 'registered',
  enrollment_role: 'ta',
  projects: [],
}));

const studentRows = () =>
  within(screen.getByRole('table', { name: 'Students' })).getAllByRole('row').slice(1);
const pages = () => screen.getByRole('navigation', { name: 'Student pages' });
const range = () => screen.getByText(/^Showing /);

async function openRoster() {
  const user = userEvent.setup();
  render(<Roster />);
  await screen.findByRole('table', { name: 'Students' });
  return user;
}

describe('Roster — paging the student list', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getClassRoster).mockResolvedValue({ students: [...STUDENTS, ...TAS], uploaded_at: null });
  });

  it('shows 25 students a page by default, with the range and the page count', async () => {
    await openRoster();

    expect(studentRows()).toHaveLength(25);
    expect(range()).toHaveTextContent('Showing 1–25 of 60');
    expect(screen.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('25');
    expect(within(pages()).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
    expect(within(pages()).getByRole('button', { name: 'Page 3' })).toBeInTheDocument();
    expect(within(pages()).queryByRole('button', { name: 'Page 4' })).not.toBeInTheDocument();
  });

  it('moves between pages', async () => {
    const user = await openRoster();

    await user.click(within(pages()).getByRole('button', { name: 'Next page' }));
    expect(range()).toHaveTextContent('Showing 26–50 of 60');
    expect(within(studentRows()[0]).getByText('Student 026')).toBeInTheDocument();

    await user.click(within(pages()).getByRole('button', { name: 'Page 3' }));
    expect(range()).toHaveTextContent('Showing 51–60 of 60');
    expect(studentRows()).toHaveLength(10);
    expect(within(pages()).getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  it('goes back to page 1 when the page size changes', async () => {
    const user = await openRoster();
    await user.click(within(pages()).getByRole('button', { name: 'Page 2' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '10');
    expect(range()).toHaveTextContent('Showing 1–10 of 60');
    expect(studentRows()).toHaveLength(10);
    expect(within(pages()).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('goes back to page 1 on a new search, and searches the whole list before paging', async () => {
    const user = await openRoster();
    await user.click(within(pages()).getByRole('button', { name: 'Page 3' }));

    // "05" matches Student 005 and Students 050 to 059, two of them on page 1 and the rest on page 2.
    await user.type(screen.getByRole('textbox', { name: 'Search students by name or email' }), '05');
    expect(range()).toHaveTextContent('Showing 1–11 of 11');
    expect(within(studentRows()[0]).getByText('Student 005')).toBeInTheDocument();
  });

  it('sorts the whole list before paging, and goes back to page 1', async () => {
    const user = await openRoster();
    await user.click(within(pages()).getByRole('button', { name: 'Page 2' }));

    await user.click(within(screen.getByRole('table', { name: 'Students' })).getByRole('button', { name: /^Name/ }));
    expect(range()).toHaveTextContent('Showing 1–25 of 60');
    expect(within(studentRows()[0]).getByText('Student 060')).toBeInTheDocument();
  });

  it('never pages or searches the TA list', async () => {
    const user = await openRoster();
    const tas = () => screen.getByRole('table', { name: 'TAs' });
    expect(within(tas()).getAllByRole('row')).toHaveLength(3);

    await user.click(within(pages()).getByRole('button', { name: 'Page 3' }));
    await user.type(screen.getByRole('textbox', { name: 'Search students by name or email' }), 'Student 001');
    expect(within(tas()).getByText('Tara Singh')).toBeInTheDocument();
    expect(within(tas()).getByText('Theo Park')).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Student pages' })).toHaveLength(1);
  });
});
