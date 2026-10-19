import { describe, expect, it } from 'vitest';
import { isPastLatestLastDay } from '@/lib/lastDayOfClasses';

describe('isPastLatestLastDay', () => {
  it.each([
    // The latest last day is 370 days after the first week of term (the API's week 53): a day later is past it.
    ['2026-09-24', '2027-09-29', false],
    ['2026-09-24', '2027-09-30', true],
    // Counted in calendar days: a span across Feb 29, 2028 is still 370 days from Sep 24 to Sep 28.
    ['2027-09-24', '2028-09-28', false],
    ['2027-09-24', '2028-09-29', true],
    // Counted in days, not hours: Mar 9, 2026 (US daylight time) to Mar 14, 2027 (standard time, as
    // that year's change comes later that day) is 370 days, though an hour more on a Pacific clock.
    ['2026-03-09', '2027-03-14', false],
    ['2026-03-09', '2027-03-15', true],
    // A day before the first week, or the same day, is not "too late"; another check refuses the former.
    ['2026-09-24', '2026-09-24', false],
    ['2026-09-24', '2026-09-01', false],
  ])('first week %s, last day %s: %s', (firstDay, lastDay, expected) => {
    expect(isPastLatestLastDay(firstDay, lastDay)).toBe(expected);
  });

  it('leaves a day it cannot read to the API', () => {
    expect(isPastLatestLastDay('', '2030-01-01')).toBe(false);
    expect(isPastLatestLastDay('2026-09-24', 'soon')).toBe(false);
  });
});
