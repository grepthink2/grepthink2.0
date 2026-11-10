import { describe, expect, it } from 'vitest';
import { findOverlaps, nowIndex, todayOrPeek, type ScheduleItemData } from '../scheduleModel';

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

describe('todayOrPeek', () => {
  const sprintToday = at('2026-11-10T08:00:00.000Z', {
    id: 'sprint',
    kind: 'sprint',
    allDay: true,
    endsAt: null,
    sprint: { name: 'Sprint 4', edge: 'start' },
  });

  it("answers today's group when today has rows", () => {
    const pick = todayOrPeek([at('2026-11-10T23:00:00.000Z'), sprintToday], NOW, ZONE);
    expect(pick.mode).toBe('today');
    expect(pick.day?.key).toBe('2026-11-10');
    expect(pick.day?.dividers.map((d) => d.id)).toEqual(['sprint']);
  });

  it('peeks at the next day with rows, keeping today’s sprint rules', () => {
    const thursday = at('2026-11-12T18:00:00.000Z');
    const pick = todayOrPeek([sprintToday, thursday], NOW, ZONE);
    expect(pick).toMatchObject({ mode: 'peek', todayDividers: [sprintToday] });
    expect(pick.day?.key).toBe('2026-11-12');
  });

  it('answers none when nothing has rows', () => {
    expect(todayOrPeek([sprintToday], NOW, ZONE)).toEqual({ mode: 'none', day: null, todayDividers: [sprintToday] });
    expect(todayOrPeek([], NOW, ZONE)).toEqual({ mode: 'none', day: null, todayDividers: [] });
  });

  it('groups by the viewer’s day: 9 AM today at UTC-8 was yesterday at UTC+5', () => {
    const morning = at('2026-11-10T17:00:00.000Z');
    expect(todayOrPeek([morning], NOW, ZONE).mode).toBe('today');
    // NOW is 4:12 AM on the 11th at UTC+5, and the meeting was at 10 PM on the 10th.
    expect(todayOrPeek([morning], NOW, 'Etc/GMT-5').mode).toBe('none');
  });
});
