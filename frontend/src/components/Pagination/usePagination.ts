import { useState } from 'react';

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export type PageItem = number | 'start-gap' | 'end-gap';

/**
 * The page numbers to show: all of them up to seven, else the first, the last, the current page and
 * its neighbours, with a gap marker where pages are skipped.
 */
export function pageItems(page: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const items: PageItem[] = [1];
  if (page > 3) items.push('start-gap');
  for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) items.push(p);
  if (page < pageCount - 2) items.push('end-gap');
  items.push(pageCount);
  return items;
}

export interface PaginationState<T> {
  /** The rows on the current page. */
  pageRows: T[];
  /** The current 1-based page, kept inside 1..pageCount. */
  page: number;
  /** At least 1, so an empty list still has a page. */
  pageCount: number;
  setPage: (page: number) => void;
  pageSize: number;
  /** Changes the page size and goes back to page 1. */
  setPageSize: (size: number) => void;
  /** The 1-based positions of the first and last row shown, 0 and 0 for an empty list. */
  from: number;
  to: number;
  total: number;
}

/**
 * Client-side paging for a list that is already filtered and sorted: slices `rows` to the current
 * page. Changing the page size, or `resetKey` (the search, a filter, the sort), goes back to page 1.
 * When the list shrinks under the current page, the last page shows instead.
 */
export function usePagination<T>(
  rows: T[],
  { initialPageSize = 25, resetKey }: { initialPageSize?: number; resetKey?: unknown } = {},
): PaginationState<T> {
  const [rawPage, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (!Object.is(prevResetKey, resetKey)) {
    setPrevResetKey(resetKey);
    setPage(1);
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, rawPage), pageCount);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return {
    pageRows,
    page,
    pageCount,
    setPage,
    pageSize,
    setPageSize: (size: number) => {
      setPageSizeState(size);
      setPage(1);
    },
    from: total === 0 ? 0 : start + 1,
    to: start + pageRows.length,
    total,
  };
}
