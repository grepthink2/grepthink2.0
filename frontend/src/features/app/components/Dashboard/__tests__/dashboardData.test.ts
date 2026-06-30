import { summarizeRoster } from '../dashboardData';
import type { ApiRosterStudent } from '@/lib/api';

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
