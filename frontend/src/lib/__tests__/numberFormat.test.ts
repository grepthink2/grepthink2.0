import { describe, expect, it } from 'vitest';
import { compactNumber } from '../numberFormat';

describe('numberFormat', () => {
  it('compacts large numbers and keeps small ones exact', () => {
    expect(compactNumber(0)).toBe('0');
    expect(compactNumber(1284)).toBe('1,284');
    expect(compactNumber(12900)).toBe('12.9K');
    expect(compactNumber(1_250_000)).toBe('1.3M');
    expect(compactNumber(null)).toBe('—');
    expect(compactNumber(undefined)).toBe('—');
    expect(compactNumber(NaN)).toBe('—');
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
});
