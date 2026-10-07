import { describe, expect, it } from 'vitest';
import { compactNumber, dateLabel, percent, rangeLabel, signedPercent, weekLabel } from '../analyticsFormat';

describe('analyticsFormat', () => {
  it('compacts large numbers and keeps small ones exact', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(1284)).toBe('1,284');
    expect(compactNumber(12900)).toBe('12.9K');
    expect(compactNumber(1_250_000)).toBe('1.3M');
    expect(compactNumber(null)).toBe('—');
  });
  it('rounds before it picks a unit and signs with a true minus', () => {
    expect(compactNumber(999_950)).toBe('1M');
    expect(compactNumber(10_000)).toBe('10K');
    expect(compactNumber(9_999.6)).toBe('10K'); // the unit is picked after rounding
    expect(compactNumber(12_900)).toBe('12.9K');
    expect(compactNumber(1_300_000)).toBe('1.3M');
    expect(compactNumber(-1284)).toBe('−1,284');
    expect(compactNumber(-0)).toBe('0');
  });
  it('formats rates and deltas', () => {
    expect(percent(0.82)).toBe('82%');
    expect(percent(0.8249, 1)).toBe('82.5%');
    expect(percent(null)).toBe('—');
    expect(signedPercent(0.18)).toBe('+18%');
    expect(signedPercent(-0.1)).toBe('−10%');
    expect(signedPercent(0)).toBe('0%');
    expect(signedPercent(null)).toBe('—');
  });
  it('labels weeks and ranges without a time zone shift', () => {
    expect(weekLabel('2026-09-07')).toBe('Sep 7');
    expect(dateLabel('2026-10-05')).toBe('Oct 5, 2026');
    expect(rangeLabel('2026-09-08', '2026-10-07')).toBe('Sep 8 – Oct 7');
    expect(rangeLabel('2025-12-25', '2026-01-05')).toBe('Dec 25, 2025 – Jan 5, 2026');
  });
});
