import { afterEach, describe, expect, it, vi } from 'vitest';

// The test pool cannot move the process's time zone (a TZ set at run time does not reach Intl here), so the
// viewer's zone is simulated: every formatter made without a zone of its own gets the one under test. A
// formatter that fell back on the viewer's zone would show the day before west of UTC, and after east of it.
function inZone(timeZone: string) {
  const Real = Intl.DateTimeFormat;
  // A class: the code under test calls it with `new`.
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(
    class extends Real {
      constructor(locales?: Intl.LocalesArgument, options?: Intl.DateTimeFormatOptions) {
        super(locales, { timeZone, ...options });
      }
    },
  );
  return Real;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('formatReleaseDate', () => {
  it.each([
    // [zone, how a formatter in that zone writes the date's UTC midnight]
    ['Etc/GMT+12', 'October 22, 2026'],
    ['Etc/GMT-14', 'October 23, 2026'],
  ])('writes the calendar date as it is, in %s', async (tz, naive) => {
    const Real = inZone(tz);
    const midnight = new Date(Date.UTC(2026, 9, 23));
    // The simulation holds: a formatter with no zone of its own reads the date in the zone under test.
    expect(new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(midnight)).toBe(naive);
    expect(Intl.DateTimeFormat).not.toBe(Real);

    vi.resetModules();
    const { formatReleaseDate } = await import('../releaseDate');
    expect(formatReleaseDate('2026-10-23')).toBe('October 23, 2026');
    expect(formatReleaseDate('2026-01-01')).toBe('January 1, 2026');
  });
});
