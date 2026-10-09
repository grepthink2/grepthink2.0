import { describe, expect, it } from 'vitest';
import { deltaPoints, signedPercent } from '../deltaFormat';

describe('deltaFormat', () => {
  it('signs a relative change with a true minus, and reads "—" without a baseline', () => {
    expect(signedPercent(0.18)).toBe('+18%');
    expect(signedPercent(-0.1)).toBe('−10%');
    expect(signedPercent(0)).toBe('0%');
    expect(signedPercent(null)).toBe('—');
  });
  it('rounds a delta to whole points once, for the figure and its tone; no baseline is null', () => {
    expect(deltaPoints(0.184)).toBe(18);
    expect(deltaPoints(-0.104)).toBe(-10);
    expect(deltaPoints(null)).toBeNull();
    expect(deltaPoints(NaN)).toBeNull();
    expect(signedPercent(NaN)).toBe('—');
  });
});
