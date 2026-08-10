import type { ApiFinalReviewTeam } from '@/lib/api';
import { formatReviewDay } from './finalReviewTemplate';

export interface DayGroup {
  key: string;
  /** Heading — a formatted day, or null for the trailing "Unscheduled" bucket. */
  label: string | null;
  teams: ApiFinalReviewTeam[];
}

/**
 * Group a class's final-review teams by calendar day.
 *
 * Deterministic regardless of input order: scheduled days sort ascending by
 * date, the "Unscheduled" bucket (teams with no/invalid `final_review_at`)
 * always sorts last, and teams keep their relative input order within a day
 * (no secondary sort by time — the caller's array order wins).
 */
export const groupByDay = (teams: ApiFinalReviewTeam[]): DayGroup[] => {
  const groups = new Map<string, DayGroup>();
  for (const t of teams) {
    const d = t.final_review_at ? new Date(t.final_review_at) : null;
    const valid = d && !Number.isNaN(d.getTime());
    const key = valid ? d!.toDateString() : 'unscheduled';
    let group = groups.get(key);
    if (!group) {
      group = { key, label: valid ? formatReviewDay(d!) : null, teams: [] };
      groups.set(key, group);
    }
    group.teams.push(t);
  }
  // `key` is either `Date#toDateString()` (parses back to that day at local
  // midnight — enough to order distinct days) or the literal 'unscheduled'
  // sentinel, which always sorts to the end.
  return [...groups.values()].sort((a, b) => {
    if (a.key === 'unscheduled') return 1;
    if (b.key === 'unscheduled') return -1;
    return new Date(a.key).getTime() - new Date(b.key).getTime();
  });
};
