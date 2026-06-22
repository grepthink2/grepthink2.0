import { renderHook, act } from '@testing-library/react';
import {
  compareValues,
  nextSortState,
  sortRows,
  useTableSort,
  type SortAccessors,
} from '../useTableSort';

describe('compareValues', () => {
  it('compares numbers numerically, not lexically', () => {
    expect(compareValues(2, 10)).toBeLessThan(0);
    expect(compareValues(10, 2)).toBeGreaterThan(0);
    expect(compareValues(5, 5)).toBe(0);
  });

  it('compares strings case-insensitively', () => {
    expect(compareValues('apple', 'Banana')).toBeLessThan(0);
    expect(compareValues('Banana', 'apple')).toBeGreaterThan(0);
  });
});

describe('sortRows', () => {
  const rows = [
    { name: 'Charlie', size: 3 },
    { name: 'alice', size: 10 },
    { name: 'Bob', size: 1 },
  ];

  it('sorts ascending by a string accessor (case-insensitive)', () => {
    const sorted = sortRows(rows, (r) => r.name, 'asc');
    expect(sorted.map((r) => r.name)).toEqual(['alice', 'Bob', 'Charlie']);
  });

  it('sorts descending by a string accessor', () => {
    const sorted = sortRows(rows, (r) => r.name, 'desc');
    expect(sorted.map((r) => r.name)).toEqual(['Charlie', 'Bob', 'alice']);
  });

  it('sorts numerically by a number accessor', () => {
    const sorted = sortRows(rows, (r) => r.size, 'asc');
    expect(sorted.map((r) => r.size)).toEqual([1, 3, 10]);
  });

  it('does not mutate the original array', () => {
    const original = [...rows];
    sortRows(rows, (r) => r.name, 'asc');
    expect(rows).toEqual(original);
  });

  it('is stable for equal keys', () => {
    const tied = [
      { name: 'same', id: 1 },
      { name: 'same', id: 2 },
      { name: 'same', id: 3 },
    ];
    const sorted = sortRows(tied, (r) => r.name, 'asc');
    expect(sorted.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('nextSortState (two-state toggle)', () => {
  it('flips direction when toggling the active column', () => {
    expect(nextSortState({ key: 'name', direction: 'asc' }, 'name')).toEqual({
      key: 'name',
      direction: 'desc',
    });
    expect(nextSortState({ key: 'name', direction: 'desc' }, 'name')).toEqual({
      key: 'name',
      direction: 'asc',
    });
  });

  it('activates a new column starting ascending', () => {
    expect(nextSortState({ key: 'name', direction: 'desc' }, 'size')).toEqual({
      key: 'size',
      direction: 'asc',
    });
  });
});

describe('useTableSort', () => {
  const rows = [
    { name: 'Charlie', size: 3 },
    { name: 'alice', size: 10 },
    { name: 'Bob', size: 1 },
  ];
  type TestRow = (typeof rows)[number];
  const accessors: SortAccessors<TestRow, 'name' | 'size'> = {
    name: (r) => r.name,
    size: (r) => r.size,
  };

  it('applies the initial sort state', () => {
    const { result } = renderHook(() =>
      useTableSort(rows, accessors, { key: 'name', direction: 'desc' }),
    );
    expect(result.current.sortedRows.map((r) => r.name)).toEqual([
      'Charlie',
      'Bob',
      'alice',
    ]);
    expect(result.current.sort).toEqual({ key: 'name', direction: 'desc' });
  });

  it('toggles direction and re-sorts when the active header is clicked', () => {
    const { result } = renderHook(() =>
      useTableSort(rows, accessors, { key: 'name', direction: 'desc' }),
    );
    act(() => result.current.toggleSort('name'));
    expect(result.current.sort).toEqual({ key: 'name', direction: 'asc' });
    expect(result.current.sortedRows.map((r) => r.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('switches columns starting ascending', () => {
    const { result } = renderHook(() =>
      useTableSort(rows, accessors, { key: 'name', direction: 'desc' }),
    );
    act(() => result.current.toggleSort('size'));
    expect(result.current.sort).toEqual({ key: 'size', direction: 'asc' });
    expect(result.current.sortedRows.map((r) => r.size)).toEqual([1, 3, 10]);
  });
});
