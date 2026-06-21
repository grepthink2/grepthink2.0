import { formatRelativeTime } from '../relativeTime';

describe('formatRelativeTime', () => {
  // Fixed reference point so the buckets are deterministic.
  const now = new Date('2026-06-20T12:00:00Z');

  it('returns empty string for null/undefined/invalid input', () => {
    expect(formatRelativeTime(null, now)).toBe('');
    expect(formatRelativeTime(undefined, now)).toBe('');
    expect(formatRelativeTime('not-a-date', now)).toBe('');
  });

  it('returns "Just now" under a minute', () => {
    const iso = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe('Just now');
  });

  it('returns minutes under an hour', () => {
    const iso = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe('5 Min');
  });

  it('returns hours under a day', () => {
    const iso = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe('3 Hours');
  });

  it('returns days under a week', () => {
    const iso = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(iso, now)).toBe('2 Days');
  });

  it('returns a month/day date once a week old', () => {
    const iso = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    // Same calendar year as `now`, so no year is shown.
    expect(formatRelativeTime(iso, now)).toMatch(/\w+ \d+/);
    expect(formatRelativeTime(iso, now)).not.toMatch(/\d{4}/);
  });

  it('includes the year when the date is in a different year', () => {
    const iso = new Date('2024-01-15T12:00:00Z').toISOString();
    expect(formatRelativeTime(iso, now)).toMatch(/\d{4}/);
  });
});
