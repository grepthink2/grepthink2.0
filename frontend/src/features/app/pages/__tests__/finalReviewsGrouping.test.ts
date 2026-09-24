import { describe, expect, it } from 'vitest';
import { groupByDay } from '../finalReviewsGrouping';
import type { ApiFinalReviewTeam } from '@/lib/api';

function makeTeam(overrides: Partial<ApiFinalReviewTeam> = {}): ApiFinalReviewTeam {
  return {
    project_id: 'p',
    name: 'Team',
    final_review_at: null,
    home_ta: null,
    review_ta: null,
    ...overrides,
  };
}

// Built from local-time components and round-tripped through toISOString(),
// so the resulting calendar day is stable no matter which timezone the test
// runner executes in.
const at = (year: number, month: number, day: number, hour: number): string =>
  new Date(year, month - 1, day, hour).toISOString();

describe('groupByDay', () => {
  it('sorts scheduled days ascending and places Unscheduled last, regardless of input order', () => {
    const teams: ApiFinalReviewTeam[] = [
      makeTeam({ project_id: 'unsched-1', final_review_at: null }),
      makeTeam({ project_id: 'day2-a', final_review_at: at(2026, 8, 2, 10) }),
      makeTeam({ project_id: 'day1-a', final_review_at: at(2026, 8, 1, 9) }),
      makeTeam({ project_id: 'day1-b', final_review_at: at(2026, 8, 1, 14) }),
      makeTeam({ project_id: 'day2-b', final_review_at: at(2026, 8, 2, 8) }),
    ];

    const groups = groupByDay(teams);

    expect(groups).toHaveLength(3);
    expect(groups[0].label).not.toBeNull();
    expect(groups[0].teams.map((t) => t.project_id)).toEqual(['day1-a', 'day1-b']);
    expect(groups[1].label).not.toBeNull();
    expect(groups[1].teams.map((t) => t.project_id)).toEqual(['day2-a', 'day2-b']);
    // Unscheduled is last even though it was first in the input array.
    expect(groups[2].label).toBeNull();
    expect(groups[2].teams.map((t) => t.project_id)).toEqual(['unsched-1']);
  });

  it('keeps teams in their original relative order within a day (no re-sort by time)', () => {
    const teams: ApiFinalReviewTeam[] = [
      makeTeam({ project_id: 'z', final_review_at: at(2026, 8, 1, 23) }),
      makeTeam({ project_id: 'a', final_review_at: at(2026, 8, 1, 12) }),
      makeTeam({ project_id: 'm', final_review_at: at(2026, 8, 1, 8) }),
    ];

    const groups = groupByDay(teams);

    expect(groups).toHaveLength(1);
    expect(groups[0].teams.map((t) => t.project_id)).toEqual(['z', 'a', 'm']);
  });

  it('treats an unparseable final_review_at as unscheduled', () => {
    const teams: ApiFinalReviewTeam[] = [
      makeTeam({ project_id: 'bad', final_review_at: 'not-a-date' }),
      makeTeam({ project_id: 'good', final_review_at: at(2026, 8, 1, 12) }),
    ];

    const groups = groupByDay(teams);

    expect(groups).toHaveLength(2);
    expect(groups[0].label).not.toBeNull();
    expect(groups[0].teams.map((t) => t.project_id)).toEqual(['good']);
    expect(groups[1].label).toBeNull();
    expect(groups[1].teams.map((t) => t.project_id)).toEqual(['bad']);
  });

  it('returns an empty array for no teams', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
