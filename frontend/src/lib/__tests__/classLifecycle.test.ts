import type { Class } from '../classContext';
import {
  getClassDisplayStatus,
  getEstimatedCourseEnd,
  isClassCompletedByDate,
  isClassHidden,
} from '../classLifecycle';

function makeClass(overrides: Partial<Class> = {}): Class {
  return {
    id: 'class-1',
    name: 'CSE 115B',
    created_by: 'teacher-1',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getEstimatedCourseEnd', () => {
  it('returns null when there is no start date', () => {
    expect(getEstimatedCourseEnd(makeClass())).toBeNull();
  });

  it('schedules a longer cycle for full-term classes (8 TSRs) than short terms (3)', () => {
    const full = getEstimatedCourseEnd(makeClass({ start_date: '2026-01-01', term: 'Fall' }));
    const short = getEstimatedCourseEnd(makeClass({ start_date: '2026-01-01', term: 'Summer' }));
    expect(full).not.toBeNull();
    expect(short).not.toBeNull();
    expect(full!.getTime()).toBeGreaterThan(short!.getTime());
  });
});

describe('isClassCompletedByDate', () => {
  it('is true for a class whose computed end is in the past', () => {
    expect(isClassCompletedByDate(makeClass({ start_date: '2000-01-01', term: 'Fall' }))).toBe(true);
  });

  it('is false for a class starting far in the future', () => {
    expect(isClassCompletedByDate(makeClass({ start_date: '2999-01-01', term: 'Fall' }))).toBe(false);
  });

  it('is false when there is no start date', () => {
    expect(isClassCompletedByDate(makeClass())).toBe(false);
  });
});

describe('getClassDisplayStatus', () => {
  it('honors an explicit stored status', () => {
    expect(getClassDisplayStatus(makeClass({ status: 'complete', start_date: '2999-01-01' }))).toBe('complete');
    expect(getClassDisplayStatus(makeClass({ status: 'active', start_date: '2000-01-01' }))).toBe('active');
  });

  it('falls back to the date-derived status when none is stored', () => {
    expect(getClassDisplayStatus(makeClass({ start_date: '2000-01-01', term: 'Fall' }))).toBe('complete');
    expect(getClassDisplayStatus(makeClass({ start_date: '2999-01-01', term: 'Fall' }))).toBe('active');
  });
});

describe('isClassHidden', () => {
  it('reflects the hidden flag in the preference map', () => {
    expect(isClassHidden('class-1', { 'class-1': { hidden: true } })).toBe(true);
    expect(isClassHidden('class-1', {})).toBe(false);
    expect(isClassHidden('class-1', { 'class-1': {} })).toBe(false);
  });
});
