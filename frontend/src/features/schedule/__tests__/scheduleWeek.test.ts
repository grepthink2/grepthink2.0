import { describe, expect, it } from 'vitest';
import type { ScheduleItemData } from '../scheduleModel';
import { fitRange, fmtWeekLabel, groupWeek, itemsInWeek, nextUp, parseDayParam, weekDaysFrom, weekKeys } from '../scheduleWeek';

const ZONE = 'Etc/GMT+8';
/** Tue Nov 10, 2026, 3:12 PM at UTC-8. */
const NOW = new Date('2026-11-10T23:12:00Z');

describe('weekKeys', () => {
  it('runs Monday to Sunday around any day', () => {
    expect(weekKeys('2026-11-10')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ]);
    expect(weekKeys('2026-11-15')[0]).toBe('2026-11-09');
    expect(weekKeys('2026-11-09')[6]).toBe('2026-11-15');
  });
});

describe('weekDaysFrom', () => {
  it('starts the week holding the day at that day, and runs any other week Monday to Sunday', () => {
    expect(weekDaysFrom('2026-11-12', '2026-11-10')).toEqual([
      '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15',
    ]);
    expect(weekDaysFrom('2026-11-15', '2026-11-15')).toEqual(['2026-11-15']);
    expect(weekDaysFrom('2026-11-17', '2026-11-10')).toEqual(weekKeys('2026-11-17'));
    expect(weekDaysFrom('2026-11-03', '2026-11-10')).toEqual(weekKeys('2026-11-03'));
    expect(weekDaysFrom('2026-11-10', null)).toEqual(weekKeys('2026-11-10'));
  });
});

describe('fmtWeekLabel', () => {
  it('reads a week that starts at today from today', () => {
    expect(fmtWeekLabel(weekDaysFrom('2026-11-10', '2026-11-10'), NOW, ZONE)).toEqual({ title: 'This week', range: 'Nov 10 – 15' });
    expect(fmtWeekLabel(['2026-11-15'], NOW, ZONE)).toEqual({ title: 'This week', range: 'Nov 15' });
  });

  it('names this, next and last week, and gives the range', () => {
    expect(fmtWeekLabel(weekKeys('2026-11-10'), NOW, ZONE)).toEqual({ title: 'This week', range: 'Nov 9 – 15' });
    expect(fmtWeekLabel(weekKeys('2026-11-17'), NOW, ZONE)).toEqual({ title: 'Next week', range: 'Nov 16 – 22' });
    expect(fmtWeekLabel(weekKeys('2026-11-03'), NOW, ZONE)).toEqual({ title: 'Last week', range: 'Nov 2 – 8' });
  });

  it('has no title further away, spans months, and adds the year only when it differs', () => {
    expect(fmtWeekLabel(weekKeys('2026-11-30'), NOW, ZONE)).toEqual({ title: null, range: 'Nov 30 – Dec 6' });
    expect(fmtWeekLabel(weekKeys('2026-12-30'), NOW, ZONE)).toEqual({ title: null, range: 'Dec 28 – Jan 3, 2027' });
  });
});

describe('nextUp', () => {
  const at = (id: string, startsAt: string, over: Partial<ScheduleItemData> = {}): ScheduleItemData => ({
    id, kind: 'meeting', title: id, startsAt, endsAt: null, ...over,
  });

  it('is the first item that starts after now, skipping sprint edges and cancelled items', () => {
    const items = [
      at('later', '2026-11-20T18:00:00Z'),
      at('past', '2026-11-09T18:00:00Z'),
      at('sprint', '2026-11-16T08:00:00Z', { kind: 'sprint', allDay: true }),
      at('cancelled', '2026-11-12T18:00:00Z', { status: 'cancelled' }),
      at('soon', '2026-11-13T18:00:00Z'),
    ];
    expect(nextUp(items, NOW, ZONE)?.id).toBe('soon');
    expect(nextUp([], NOW, ZONE)).toBeNull();
  });
});

describe('parseDayParam', () => {
  it('accepts a real calendar day and refuses anything else', () => {
    expect(parseDayParam('2026-11-12')).toBe('2026-11-12');
    for (const bad of [null, '', '2026-13-01', '2026-02-30', '12/11/2026', '2026-1-5', 'today']) {
      expect(parseDayParam(bad)).toBeNull();
    }
  });
});

describe('parseDayParam: years the calendar math can hold', () => {
  it('refuses a day before 1970 or after 9998', () => {
    for (const bad of ['0001-01-01', '1969-12-31', '9999-12-31', '9999-01-01']) expect(parseDayParam(bad)).toBeNull();
    expect(parseDayParam('1970-01-01')).toBe('1970-01-01');
    expect(parseDayParam('9998-12-31')).toBe('9998-12-31');
  });
});

describe('fitRange', () => {
  const H = 3_600_000;
  it('keeps a window of 42 days of hours or less as it is', () => {
    // Spring forward: 42 calendar days from a UTC-8 midnight to a UTC-7 midnight are 1007 hours.
    const from = new Date('2026-03-01T08:00:00Z');
    const to = new Date('2026-04-12T07:00:00Z');
    expect(fitRange(from, to)).toEqual({ from, to });
  });

  it('cuts a window that a fall-back change makes longer than 42 days of hours', () => {
    // Fall back: 42 calendar days from a UTC-7 midnight to a UTC-8 midnight are 1009 hours.
    const from = new Date('2026-11-01T07:00:00Z');
    const to = new Date('2026-12-13T08:00:00Z');
    expect(to.getTime() - from.getTime()).toBe(1009 * H);
    expect(fitRange(from, to)).toEqual({ from, to: new Date(from.getTime() + 1008 * H) });
  });
});

describe('itemsInWeek', () => {
  it('keeps the items whose day, in the viewer’s zone, is in the week', () => {
    const keys = weekKeys('2026-11-10');
    const spill = { id: 'spill', kind: 'meeting' as const, title: 's', startsAt: '2026-11-09T07:30:00Z', endsAt: '2026-11-09T08:30:00Z' };
    const inside = { id: 'in', kind: 'meeting' as const, title: 'i', startsAt: '2026-11-09T08:30:00Z', endsAt: null };
    expect(itemsInWeek([spill, inside], keys, ZONE).map((i) => i.id)).toEqual(['in']);
  });

  it('keeps a week that starts at today to today and the days after it', () => {
    const at = (id: string, startsAt: string) => ({ id, kind: 'meeting' as const, title: id, startsAt, endsAt: null });
    const items = [at('monday', '2026-11-09T18:00:00Z'), at('today', '2026-11-10T18:00:00Z'), at('sunday', '2026-11-16T07:00:00Z')];
    expect(itemsInWeek(items, weekDaysFrom('2026-11-10', '2026-11-10'), ZONE).map((i) => i.id)).toEqual(['today', 'sunday']);
  });

  describe('an item from before today that is still on', () => {
    /** Wed Nov 11, 12:10 AM at UTC-8. */
    const AFTER_MIDNIGHT = new Date('2026-11-11T08:10:00Z');
    const days = weekDaysFrom('2026-11-11', '2026-11-11');
    // Tue 11:30 PM to Wed 12:45 AM, and Tue 11:00 PM to Wed 12:05 AM (over by 12:10).
    const live = { id: 'live', kind: 'meeting' as const, title: 'Late sync', startsAt: '2026-11-11T07:30:00Z', endsAt: '2026-11-11T08:45:00Z' };
    const over = { id: 'over', kind: 'meeting' as const, title: 'Wrap', startsAt: '2026-11-11T07:00:00Z', endsAt: '2026-11-11T08:05:00Z' };
    const later = { id: 'later', kind: 'meeting' as const, title: 'Standup', startsAt: '2026-11-11T17:00:00Z', endsAt: '2026-11-11T17:30:00Z' };

    it('counts in a week whose first day is today, and one that ended does not', () => {
      expect(itemsInWeek([over, live, later], days, ZONE, AFTER_MIDNIGHT).map((i) => i.id)).toEqual(['live', 'later']);
      expect(itemsInWeek([over, live, later], days, ZONE).map((i) => i.id)).toEqual(['later']);
    });

    it('does not count in a week that starts after today', () => {
      expect(itemsInWeek([live], weekKeys('2026-11-17'), ZONE, AFTER_MIDNIGHT)).toEqual([]);
    });

    it('lists under today, first', () => {
      const groups = groupWeek([later, live], days, AFTER_MIDNIGHT, ZONE);
      expect(groups.map((g) => [g.key, g.isToday, g.items.map((i) => i.id)])).toEqual([['2026-11-11', true, ['live', 'later']]]);
      expect(groupWeek([live], days, AFTER_MIDNIGHT, ZONE).map((g) => [g.key, g.items.map((i) => i.id)])).toEqual([['2026-11-11', ['live']]]);
    });
  });
});
