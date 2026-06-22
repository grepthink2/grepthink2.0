import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export type SortAccessors<T, K extends string> = Record<K, (row: T) => string | number>;

/**
 * Compares two sort values. Numbers are compared numerically; strings are
 * compared case-insensitively via localeCompare.
 */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/** Returns a new array sorted by the accessor in the given direction. Stable; never mutates. */
export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => string | number,
  direction: SortDirection,
): T[] {
  const factor = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const result = compareValues(accessor(a.row), accessor(b.row));
      return result !== 0 ? result * factor : a.index - b.index;
    })
    .map(({ row }) => row);
}

/**
 * Two-state toggle: clicking the active column flips its direction; clicking a
 * different column activates it ascending.
 */
export function nextSortState<K extends string>(
  current: SortState<K>,
  key: K,
): SortState<K> {
  if (current.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: 'asc' };
}

export function useTableSort<T, K extends string>(
  rows: T[],
  accessors: SortAccessors<T, K>,
  initial: SortState<K>,
): {
  sortedRows: T[];
  sort: SortState<K>;
  toggleSort: (key: K) => void;
} {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const sortedRows = useMemo(
    () => sortRows(rows, accessors[sort.key], sort.direction),
    [rows, accessors, sort],
  );

  const toggleSort = (key: K) => setSort((current) => nextSortState(current, key));

  return { sortedRows, sort, toggleSort };
}
