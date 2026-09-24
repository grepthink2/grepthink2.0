import { formatPacificTimestamp } from '../reviewDates';

describe('formatPacificTimestamp', () => {
  it('pins a fixed UTC instant to America/Los_Angeles during standard time (PST, UTC-8)', () => {
    // 2026-01-15T20:30:00Z → 12:30 PM Pacific in January.
    expect(formatPacificTimestamp('2026-01-15T20:30:00.000Z')).toBe('Jan 15, 2026, 12:30 PM PT');
  });

  it('pins a fixed UTC instant to America/Los_Angeles during daylight time (PDT, UTC-7)', () => {
    // 2026-07-15T20:30:00Z → 1:30 PM Pacific in July.
    expect(formatPacificTimestamp('2026-07-15T20:30:00.000Z')).toBe('Jul 15, 2026, 1:30 PM PT');
  });

  it('always appends the explicit "PT" label', () => {
    expect(formatPacificTimestamp('2026-01-15T20:30:00.000Z')).toMatch(/ PT$/);
  });

  it('returns an em dash for a null timestamp', () => {
    expect(formatPacificTimestamp(null)).toBe('—');
  });

  it('falls back to the raw string for an unparseable timestamp', () => {
    expect(formatPacificTimestamp('not-a-date')).toBe('not-a-date');
  });
});
