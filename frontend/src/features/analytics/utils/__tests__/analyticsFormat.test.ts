import { describe, expect, it } from 'vitest';
import * as deltaFormat from '@/lib/deltaFormat';
import { dateLabel, deltaPoints, percent, rangeLabel, signedPercent, weekLabel } from '../analyticsFormat';

describe('analyticsFormat', () => {
  it('formats rates', () => {
    expect(percent(0.82)).toBe('82%');
    expect(percent(0.8249, 1)).toBe('82.5%');
    expect(percent(null)).toBe('—');
  });
  it('re-exports the delta helpers StatCard shares (lib/deltaFormat, tested there)', () => {
    expect(signedPercent).toBe(deltaFormat.signedPercent);
    expect(deltaPoints).toBe(deltaFormat.deltaPoints);
  });
  it('labels weeks and ranges without a time zone shift', () => {
    expect(weekLabel('2026-09-07')).toBe('Sep 7');
    expect(dateLabel('2026-10-05')).toBe('Oct 5, 2026');
    expect(rangeLabel('2026-09-08', '2026-10-07')).toBe('Sep 8 – Oct 7');
    expect(rangeLabel('2025-12-25', '2026-01-05')).toBe('Dec 25, 2025 – Jan 5, 2026');
  });
});
