import { describe, expect, it } from 'vitest';
import { linePath, linearScale, niceMax, roundedTopRect, tickLabel, ticks } from '../chartGeometry';

describe('chartGeometry', () => {
  it('scales linearly and survives a flat domain', () => {
    expect(linearScale(0, 10, 0, 100)(5)).toBe(50);
    expect(linearScale(0, 0, 0, 100)(0)).toBe(0);
  });
  it('rounds the axis top to 1, 2 or 5 × 10^k and spreads ticks', () => {
    expect([niceMax(0), niceMax(7), niceMax(23), niceMax(281), niceMax(1284)]).toEqual([1, 10, 25, 500, 2000]);
    expect(ticks(300)).toEqual([0, 75, 150, 225, 300]);
    expect(ticks(2.5).map(tickLabel)).toEqual(['0', '0.63', '1.25', '1.88', '2.5']);
    expect(tickLabel(1300000)).toBe('1.3M');
  });
  it('breaks the path where a point is missing', () => {
    expect(linePath([[0, 10], [10, 20], null, [30, 5], [40, 8]])).toBe('M0 10L10 20M30 5L40 8');
    expect(linePath([null, [1, 1]])).toBe('M1 1');
  });
  it('draws a bar with a rounded top and a square baseline, clamping the radius to the height', () => {
    expect(roundedTopRect(8, 10, 24, 30, 4)).toBe('M8 14a4 4 0 0 1 4 -4h16a4 4 0 0 1 4 4v26h-24z');
    expect(roundedTopRect(0, 0, 24, 2, 4)).toBe('M0 2a2 2 0 0 1 2 -2h20a2 2 0 0 1 2 2v0h-24z');
  });
});
