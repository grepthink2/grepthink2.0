import { describe, expect, it } from 'vitest';
import type { ScheduleItemData } from '../scheduleModel';
import { fmtWeekLabel, nextUp, parseDayParam, weekKeys } from '../scheduleWeek';

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

describe('fmtWeekLabel', () => {
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
