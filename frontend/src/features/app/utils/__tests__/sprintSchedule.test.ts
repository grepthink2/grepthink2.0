import { describe, expect, it } from 'vitest';
import type { ApiSprintFrequency } from '@/lib/api/types';
import {
  DEFAULT_SPRINT_COUNT,
  DEFAULT_SPRINT_FREQUENCY,
  SPRINT_COUNT_ERROR,
  SPRINT_COUNT_HINT,
  SPRINT_FREQUENCY_OPTIONS,
  lastSprintLine,
  latestSprintEnd,
  parseSprintCount,
  scheduleEnd,
  sprintWindows,
} from '../sprintSchedule';

const FREQUENCIES: ApiSprintFrequency[] = ['weekly', 'biweekly', 'monthly'];

/** The day after a YYYY-MM-DD day, counted in UTC: an oracle that shares no code with the module. */
function dayAfter(day: string): string {
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, dayOfMonth + 1)).toISOString().slice(0, 10);
}

// The values backend/tests/test_scrum_schedule.py pins for app/scrum/schedule.py, and a few more.
// Every day is a calendar day, so these hold in any time zone: run this file with TZ=Etc/GMT+8 (or
// any zone west of UTC) to check that no day is read as UTC midnight.
describe('sprintWindows', () => {
  it('starts weekly sprints a week apart, each ending the day before the next starts', () => {
    expect(sprintWindows('2026-09-28', 3, 'weekly')).toEqual([
      { startsAt: '2026-09-28', endsAt: '2026-10-04' },
      { startsAt: '2026-10-05', endsAt: '2026-10-11' },
      { startsAt: '2026-10-12', endsAt: '2026-10-18' },
    ]);
  });

  it('starts biweekly sprints two weeks apart, by the calendar across a clock change', () => {
    expect(sprintWindows('2026-09-28', 2, 'biweekly')).toEqual([
      { startsAt: '2026-09-28', endsAt: '2026-10-11' },
      { startsAt: '2026-10-12', endsAt: '2026-10-25' },
    ]);
    // Daylight time ends on Nov 1 in the US, inside sprint 3.
    expect(sprintWindows('2026-09-21', 5, 'biweekly')).toEqual([
      { startsAt: '2026-09-21', endsAt: '2026-10-04' },
      { startsAt: '2026-10-05', endsAt: '2026-10-18' },
      { startsAt: '2026-10-19', endsAt: '2026-11-01' },
      { startsAt: '2026-11-02', endsAt: '2026-11-15' },
      { startsAt: '2026-11-16', endsAt: '2026-11-29' },
    ]);
  });

  it('starts monthly sprints on the same day each month, clamped to a shorter month and never compounding', () => {
    expect(sprintWindows('2026-01-31', 3, 'monthly').map((w) => w.endsAt)).toEqual(['2026-02-27', '2026-03-30', '2026-04-29']);
    // Feb 28 is clamped, but sprint 3 starts on Mar 31, not Mar 28: always counted from Jan 31.
    expect(sprintWindows('2026-01-31', 3, 'monthly').map((w) => w.startsAt)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('counts a leap day, and runs into the next year', () => {
    expect(sprintWindows('2028-01-31', 2, 'monthly')).toEqual([
      { startsAt: '2028-01-31', endsAt: '2028-02-28' },
      { startsAt: '2028-02-29', endsAt: '2028-03-30' },
    ]);
    expect(sprintWindows('2026-12-15', 2, 'monthly')).toEqual([
      { startsAt: '2026-12-15', endsAt: '2027-01-14' },
      { startsAt: '2027-01-15', endsAt: '2027-02-14' },
    ]);
    expect(sprintWindows('2026-12-28', 1, 'weekly')).toEqual([{ startsAt: '2026-12-28', endsAt: '2027-01-03' }]);
  });

  it('leaves no gap and no overlap between sprints, at every frequency', () => {
    for (const frequency of FREQUENCIES) {
      const windows = sprintWindows('2026-08-31', 12, frequency);
      expect(windows).toHaveLength(12);
      expect(windows[0].startsAt).toBe('2026-08-31');
      for (let i = 1; i < windows.length; i++) {
        expect(windows[i].startsAt).toBe(dayAfter(windows[i - 1].endsAt));
      }
    }
  });

  it('refuses a frequency it does not know, as the API does', () => {
    expect(() => sprintWindows('2026-09-28', 1, 'daily' as ApiSprintFrequency)).toThrow('Unknown sprint frequency: daily');
  });
});

describe('scheduleEnd', () => {
  it("is the last sprint's last day: the day before the sprint after it would start", () => {
    expect(scheduleEnd('2026-09-28', 5, 'biweekly')).toBe('2026-12-06');
    expect(scheduleEnd('2026-09-21', 5, 'biweekly')).toBe('2026-11-29');
    expect(scheduleEnd('2026-01-31', 3, 'monthly')).toBe('2026-04-29');
    expect(scheduleEnd('2026-09-21', 10, 'weekly')).toBe('2026-11-29');
    expect(scheduleEnd('2026-12-28', 1, 'weekly')).toBe('2027-01-03');
  });

  it('agrees with the last window', () => {
    for (const frequency of FREQUENCIES) {
      expect(scheduleEnd('2026-08-31', 12, frequency)).toBe(sprintWindows('2026-08-31', 12, frequency)[11].endsAt);
    }
  });
});

describe('latestSprintEnd', () => {
  it('is the Sunday of the week, Monday to Sunday, that holds the last day of classes', () => {
    // Mon Mar 8 to Sun Mar 14, 2027 is one week.
    for (const day of ['2027-03-08', '2027-03-09', '2027-03-10', '2027-03-11', '2027-03-12', '2027-03-13', '2027-03-14']) {
      expect(latestSprintEnd(day)).toBe('2027-03-14');
    }
    expect(latestSprintEnd('2027-03-15')).toBe('2027-03-21'); // a Monday starts the next week
    expect(latestSprintEnd('2027-12-30')).toBe('2028-01-02'); // a Thursday, across a month and a year
    // Daylight time ends on Sun Nov 1, 2026 in the US: still the same day.
    expect(latestSprintEnd('2026-10-30')).toBe('2026-11-01');
  });

  it('lets a term from Monday to Friday keep the sprints that end on its last Sunday, and no later', () => {
    // Mon Jan 4 to Fri Mar 12, 2027: five two-week sprints, or ten one-week ones, end on Sun Mar 14.
    for (const [count, frequency] of [[5, 'biweekly'], [10, 'weekly']] as const) {
      expect(scheduleEnd('2027-01-04', count, frequency)).toBe('2027-03-14');
      expect(scheduleEnd('2027-01-04', count, frequency) <= latestSprintEnd('2027-03-12')).toBe(true);
      // From Tue Jan 5 they end on Mon Mar 15, a day past that Sunday.
      expect(scheduleEnd('2027-01-05', count, frequency)).toBe('2027-03-15');
      expect(scheduleEnd('2027-01-05', count, frequency) <= latestSprintEnd('2027-03-12')).toBe(false);
    }
  });
});

describe('parseSprintCount', () => {
  it('takes a whole number from 1 to 20', () => {
    expect(parseSprintCount('1')).toBe(1);
    expect(parseSprintCount('5')).toBe(5);
    expect(parseSprintCount('20')).toBe(20);
  });

  it('refuses anything else, an empty box included', () => {
    for (const text of ['', '0', '21', '-1', '2.5', '1e1', '05x', ' 5']) {
      expect(parseSprintCount(text)).toBeNull();
    }
  });

  it('is described by the hint and the error the class forms show beside the count', () => {
    expect(SPRINT_COUNT_HINT).toBe('1–20');
    expect(SPRINT_COUNT_ERROR).toBe('Enter a whole number from 1 to 20');
  });
});

describe('lastSprintLine', () => {
  it('names the last sprint and the day it ends, by the calendar', () => {
    expect(lastSprintLine(5, '2026-12-01')).toBe('Sprint 5 ends Dec 1');
    expect(lastSprintLine(1, '2027-01-03')).toBe('Sprint 1 ends Jan 3');
  });

  it('warns instead while the last sprint would end after the last day of classes', () => {
    expect(lastSprintLine(5, '2026-12-20', true)).toBe('Sprint 5 would end after the last day of classes');
  });
});

describe('the schedule a class starts from', () => {
  it('is five sprints of two weeks', () => {
    expect([DEFAULT_SPRINT_COUNT, DEFAULT_SPRINT_FREQUENCY]).toEqual([5, 'biweekly']);
  });
});

describe('SPRINT_FREQUENCY_OPTIONS', () => {
  it('names the frequencies as the form says them: every week, two weeks or month', () => {
    expect(SPRINT_FREQUENCY_OPTIONS).toEqual([
      { value: 'weekly', label: 'week' },
      { value: 'biweekly', label: 'two weeks' },
      { value: 'monthly', label: 'month' },
    ]);
  });
});
