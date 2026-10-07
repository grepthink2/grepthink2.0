import { describe, expect, it } from 'vitest';
import { linePath, linearScale, niceMax, roundedTopRect, textWidth, tickLabel, ticks } from '../chartGeometry';

describe('chartGeometry', () => {
  it('scales linearly and survives a flat domain', () => {
    expect(linearScale(0, 10, 0, 100)(5)).toBe(50);
    expect(linearScale(0, 0, 0, 100)(0)).toBe(0);
  });
  it('rounds the axis top up to 1, 2, 2.5, 5 or 10 × 10^k', () => {
    expect([niceMax(0), niceMax(7), niceMax(23), niceMax(281), niceMax(1284)]).toEqual([1, 10, 25, 500, 2000]);
  });
  it('steps ticks by the 1, 2 or 5 × 10^k nearest a quarter of the top (the smaller on a tie), by 1 up to an integer 4', () => {
    expect(ticks(300)).toEqual([0, 50, 100, 150, 200, 250, 300]);
    expect(ticks(25)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(ticks(250)).toEqual([0, 50, 100, 150, 200, 250]);
    expect(ticks(10)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks(2.5).map(tickLabel)).toEqual(['0', '0.5', '1', '1.5', '2', '2.5']);
    expect(ticks(1)).toEqual([0, 1]);
  });
  it('bounds the tick loop relatively, so a tiny top cannot run away', () => {
    const tiny = ticks(1e-12);
    expect(tiny.length).toBeLessThanOrEqual(6);
    expect(tiny.every((t) => t <= 1e-12 + 1e-18)).toBe(true);
  });
  it('labels ticks compactly, a fraction with up to two decimals', () => {
    expect(tickLabel(1300000)).toBe('1.3M');
    expect(tickLabel(0.625)).toBe('0.63');
  });
  it('breaks the path where a point is missing', () => {
    expect(linePath([[0, 10], [10, 20], null, [30, 5], [40, 8]])).toBe('M0 10L10 20M30 5L40 8');
    expect(linePath([null, [1, 1]])).toBe('M1 1');
  });
  it('draws a bar with a rounded top and a square baseline, clamping the radius to the height', () => {
    expect(roundedTopRect(8, 10, 24, 30, 4)).toBe('M8 14a4 4 0 0 1 4 -4h16a4 4 0 0 1 4 4v26h-24z');
    expect(roundedTopRect(0, 0, 24, 2, 4)).toBe('M0 2a2 2 0 0 1 2 -2h20a2 2 0 0 1 2 2v0h-24z');
  });
  it('estimates 11px Poppins label widths from one calibration', () => {
    expect(textWidth('Backlog', 'regular')).toBeCloseTo(44.1); // measured 43.7px
    expect(textWidth('S8', 'regular')).toBeCloseTo(12.6); // measured 13.4px: the air between labels absorbs it
    expect(textWidth('110', 'semibold')).toBeCloseTo(21.6); // measured 15.1px; "000" would be 21.3px
    expect(textWidth('', 'semibold')).toBe(0);
  });
});
