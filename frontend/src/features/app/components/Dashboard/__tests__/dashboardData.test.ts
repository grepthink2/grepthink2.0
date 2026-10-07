import { mapDashboardAssignment, summarizeRoster } from '../dashboardData';
import type { ApiAssignment, ApiRosterStudent } from '@/lib/api';

function makeRosterStudent(overrides: Partial<ApiRosterStudent> = {}): ApiRosterStudent {
  return {
    id: 'id',
    name: 'Ada Lovelace',
    email: 'ada@ucsc.edu',
    class_status: 'enrolled',
    grepthink_status: 'registered',
    projects: [],
    ...overrides,
  };
}

describe('summarizeRoster', () => {
  it('excludes TAs from every bucket and the total', () => {
    const students: ApiRosterStudent[] = [
      makeRosterStudent({ id: 'a', class_status: 'enrolled', grepthink_status: 'registered' }),
      makeRosterStudent({ id: 'b', class_status: 'waitlisted', grepthink_status: 'registered' }),
      // TA who is enrolled + registered + would otherwise be "not on roster" — ignored entirely.
      makeRosterStudent({
        id: 'ta',
        enrollment_role: 'ta',
        class_status: 'not_on_roster',
        grepthink_status: 'registered',
      }),
    ];

    const result = summarizeRoster(students);

    expect(result).toEqual({
      registered: 2,
      enrolled: 1,
      waitlisted: 1,
      notOnRoster: 0,
      total: 2,
    });
  });

  it('treats a missing enrollment_role as a student', () => {
    const students = [makeRosterStudent({ id: 'a' })];
    expect(summarizeRoster(students).total).toBe(1);
  });

  it('counts registered students who are not on the roster', () => {
    const students = [
      makeRosterStudent({ id: 'a', class_status: 'not_on_roster', grepthink_status: 'registered' }),
    ];
    expect(summarizeRoster(students).notOnRoster).toBe(1);
  });

  it('returns all-zero buckets for an empty roster', () => {
    expect(summarizeRoster([])).toEqual({
      registered: 0,
      enrolled: 0,
      waitlisted: 0,
      notOnRoster: 0,
      total: 0,
    });
  });
});

describe('mapDashboardAssignment', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps an assignment active through its late-submission window', () => {
    vi.useFakeTimers({ now: new Date('2026-10-20T12:00:00Z') });
    const lateWindow: ApiAssignment = {
      id: 'assignment-1',
      Title: 'Team Status Report 1',
      open_date: '2026-10-05',
      close_date: '2026-10-12',
      status: 'publish',
      class_id: 'class-1',
      due_at: '2026-10-13T07:00:00+00:00',
      accept_until: '2026-10-22T06:59:00+00:00',
    };

    expect(mapDashboardAssignment(lateWindow).status).toBe('active');
    // ...and closed once the window has ended.
    expect(mapDashboardAssignment({ ...lateWindow, accept_until: '2026-10-19T06:59:00+00:00' }).status).toBe('closed');
  });
});
