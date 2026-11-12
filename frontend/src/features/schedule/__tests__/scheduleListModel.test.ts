import { describe, expect, it } from 'vitest';
import { findOverlaps, groupByDay, nowIndex, statusOf, type ScheduleItemData } from '../scheduleModel';

/** UTC-8 all year. */
const ZONE = 'Etc/GMT+8';
/** Tue Nov 10, 2026, 3:12 PM at UTC-8. */
const NOW = new Date('2026-11-10T23:12:00Z');

const at = (iso: string, over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
  id: iso,
  kind: 'meeting',
  title: 'Meeting',
  startsAt: iso,
  endsAt: new Date(new Date(iso).getTime() + 30 * 60_000).toISOString(),
  ...over,
});

describe('findOverlaps', () => {
  it('pairs timed items that share an instant and leaves out deadlines, sprints, all-day, cancelled and TBD items', () => {
    const a = at('2026-11-10T23:00:00.000Z', { id: 'a' });
    const b = at('2026-11-10T23:15:00.000Z', { id: 'b' });
    const c = at('2026-11-10T23:30:00.000Z', { id: 'c' }); // starts as `a` ends
    const deadline = at('2026-11-10T23:10:00.000Z', { id: 'd', kind: 'deadline', endsAt: null });
    const sprint = at('2026-11-10T08:00:00.000Z', { id: 's', kind: 'sprint', allDay: true, endsAt: null });
    const cancelled = at('2026-11-10T23:05:00.000Z', { id: 'x', status: 'cancelled' });
    const map = findOverlaps([a, b, c, deadline, sprint, cancelled]);
    expect([...map.keys()].sort()).toEqual(['a', 'b', 'c']);
    expect(map.get('a')?.map((o) => o.id)).toEqual(['b']);
    expect(map.get('b')?.map((o) => o.id)).toEqual(['a', 'c']);
  });
});

describe('nowIndex', () => {
  it('sits before the first timed item that has not ended', () => {
    const day = [
      at('2026-11-10T08:00:00.000Z', { allDay: true, endsAt: null }),
      at('2026-11-10T17:00:00.000Z'),
      at('2026-11-10T23:00:00.000Z'), // live
      at('2026-11-11T01:00:00.000Z'),
    ];
    expect(nowIndex(day, NOW)).toBe(2);
  });

  it('trails a day that is over and is absent from a day with no timed items', () => {
    expect(nowIndex([at('2026-11-10T17:00:00.000Z')], NOW)).toBe(1);
    expect(nowIndex([at('2026-11-10T08:00:00.000Z', { allDay: true, endsAt: null })], NOW)).toBe(-1);
  });

  it('places a deadline, a point in time, by its instant', () => {
    expect(nowIndex([at('2026-11-11T07:59:00.000Z', { kind: 'deadline', endsAt: null })], NOW)).toBe(0);
  });
});

describe('an all-day item’s day', () => {
  // Midnight Nov 10 at a school on UTC-5: 9 PM on Nov 9 for a viewer on UTC-8.
  const edge = at('2026-11-10T05:00:00.000Z', { id: 'e', kind: 'sprint', allDay: true, endsAt: null, date: '2026-11-10' });

  it('is its calendar date, not its instant read in the viewer’s zone', () => {
    expect(groupByDay([edge], { zone: ZONE, now: NOW }).map((g) => g.key)).toEqual(['2026-11-10']);
  });

  it('is past only once the viewer’s day is after it', () => {
    const allDay = { ...edge, kind: 'meeting' as const };
    expect(statusOf(allDay, new Date('2026-11-11T06:00:00Z'), ZONE)).toBe('upcoming'); // Nov 10, 10 PM
    expect(statusOf(allDay, new Date('2026-11-11T09:00:00Z'), ZONE)).toBe('past'); // Nov 11, 1 AM
  });
});
