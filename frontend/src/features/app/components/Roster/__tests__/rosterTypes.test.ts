import { countableStudents, isBulkInviteCandidate } from '../rosterTypes';
import type { UiStudent } from '../rosterTypes';

function makeStudent(overrides: Partial<UiStudent> = {}): UiStudent {
  return {
    id: 'id',
    name: 'Ada Lovelace',
    email: 'ada@ucsc.edu',
    classStatus: 'enrolled',
    grepthinkStatus: 'registered',
    isTa: false,
    projects: [],
    ...overrides,
  };
}

describe('countableStudents', () => {
  it('excludes TAs from the student population', () => {
    const students = [
      makeStudent({ id: 'a' }),
      makeStudent({ id: 'b', isTa: true }),
      makeStudent({ id: 'c' }),
    ];
    expect(countableStudents(students).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('returns all students when none are TAs', () => {
    const students = [makeStudent({ id: 'a' }), makeStudent({ id: 'b' })];
    expect(countableStudents(students)).toHaveLength(2);
  });

  it('returns an empty array for an empty roster', () => {
    expect(countableStudents([])).toEqual([]);
  });
});

describe('isBulkInviteCandidate', () => {
  it('flags an unregistered, non-dropped student', () => {
    expect(
      isBulkInviteCandidate(
        makeStudent({ grepthinkStatus: 'not_registered', classStatus: 'enrolled' }),
      ),
    ).toBe(true);
  });

  it('never flags a TA, even when unregistered', () => {
    expect(
      isBulkInviteCandidate(
        makeStudent({ isTa: true, grepthinkStatus: 'not_registered', classStatus: 'enrolled' }),
      ),
    ).toBe(false);
  });

  it('does not flag a dropped student', () => {
    expect(
      isBulkInviteCandidate(
        makeStudent({ grepthinkStatus: 'not_registered', classStatus: 'dropped' }),
      ),
    ).toBe(false);
  });

  it('does not flag an already-registered student', () => {
    expect(
      isBulkInviteCandidate(
        makeStudent({ grepthinkStatus: 'registered', classStatus: 'enrolled' }),
      ),
    ).toBe(false);
  });
});
