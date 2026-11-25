/** A registered person's name on the roster leads to their page, and shows their role and team on hover. */
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRosterStudent } from '@/lib/api';
import { HOVER_OPEN_MS } from '@components/PersonLink/PersonLink';

// `course_code` is the code that joins the class; `name` is what the class is called.
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
  projects: ['Trailhead', 'Second'],
};
// On the registrar's list, with no account: the id is the roster entry's, not a person's.
const NIA: ApiRosterStudent = {
  id: 'entry-9',
  name: 'Nia Unjoined',
  email: 'nia@ucsc.edu',
  class_status: 'enrolled',
  grepthink_status: 'not_registered',
  enrollment_role: 'student',
  projects: [],
};
const TARA: ApiRosterStudent = {
  id: 't1',
  name: 'Tara Singh',
  email: 'tsingh@ucsc.edu',
  class_status: 'not_on_roster',
  grepthink_status: 'registered',
  enrollment_role: 'ta',
  projects: [],
};

const students = () => within(screen.getByRole('table', { name: 'Students' }));
const tas = () => within(screen.getByRole('table', { name: 'TAs' }));
const rest = (link: HTMLElement) => {
  fireEvent.pointerEnter(link, { pointerType: 'mouse' });
  act(() => vi.advanceTimersByTime(HOVER_OPEN_MS));
};

describe('Roster — names lead to people', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    vi.mocked(api.getClassRoster).mockResolvedValue({ students: [ADA, NIA, TARA], uploaded_at: null });
    render(<Roster />, { wrapper: MemoryRouter });
    await screen.findByRole('table', { name: 'Students' });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('links a registered person, in the table and on the phone card', () => {
    expect(students().getByRole('link', { name: 'Ada Lovelace' })).toHaveAttribute('href', '/app/people/s1');
    expect(tas().getByRole('link', { name: 'Tara Singh' })).toHaveAttribute('href', '/app/people/t1');
    // The phone cards are hidden at this width, so they are asked for by name.
    const everywhere = screen.getAllByRole('link', { name: 'Ada Lovelace', hidden: true });
    expect(everywhere).toHaveLength(2);
    expect(everywhere.every((a) => a.getAttribute('href') === '/app/people/s1')).toBe(true);
  });

  it('leaves someone with no account as text', () => {
    expect(students().getByText('Nia Unjoined')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nia Unjoined' })).toBeNull();
  });

  it('shows the role in this class and the first team on hover', () => {
    rest(students().getByRole('link', { name: 'Ada Lovelace' }));
    expect(screen.getByText('Student · CSE 115C')).toBeInTheDocument();
    const card = document.querySelector('.gt-person-card') as HTMLElement;
    expect(within(card).getByText('Trailhead')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'View profile' })).toHaveAttribute('href', '/app/people/s1');
    // The code that joins the class is not a label for it.
    expect(card).not.toHaveTextContent('ABC123');
  });

  it('says TA for a TA, and nothing about a team they do not have', () => {
    rest(tas().getByRole('link', { name: 'Tara Singh' }));
    expect(screen.getByText('TA · CSE 115C')).toBeInTheDocument();
    expect(document.querySelectorAll('.gt-person-card__line')).toHaveLength(1);
  });
});
