import { afterEach, describe, expect, it } from 'vitest';
import { formatReleaseDate } from '../releaseDate';

const zone = process.env.TZ;

afterEach(() => {
  process.env.TZ = zone;
});

describe('formatReleaseDate', () => {
  it.each(['Etc/GMT+12', 'Etc/GMT-14'])('writes the calendar date as it is, in %s', (tz) => {
    process.env.TZ = tz;
    expect(formatReleaseDate('2026-10-23')).toBe('October 23, 2026');
    expect(formatReleaseDate('2026-01-01')).toBe('January 1, 2026');
  });
});
