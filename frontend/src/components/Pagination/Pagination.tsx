import type { HTMLAttributes, Ref } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { pageItems } from './usePagination';
import './Pagination.scss';

export interface PaginationProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onChange' | 'children' | 'aria-label'> {
  /** Current 1-based page. @default 1 */
  page?: number;
  /** Total pages. @default 1 */
  pageCount?: number;
  onChange?: (page: number) => void;
  /** Names the navigation landmark ("Student pages"). @default 'Pagination' */
  ariaLabel?: string;
  /** Set from `ariaLabel`. JSX takes any hyphenated prop a type leaves out, so it is declared `never`. */
  'aria-label'?: never;
  ref?: Ref<HTMLElement>;
}

/**
 * The pager, ported from design/components/navigation/Pagination.jsx: previous and next around the
 * numbered pages, with an ellipsis where pages are skipped. The current page is solid green and
 * carries `aria-current="page"`; pressing it, or a button past either end, changes nothing.
 *
 * Codebase-side: lucide chevrons replace the inline SVGs, each page button is named "Page N", the
 * ellipsis is hidden from screen readers, and native props and `ref` reach the `<nav>`. Rows per
 * page and the "Showing 1–25 of 132" line belong to the screen around it; `usePagination` slices
 * the rows.
 */
export function Pagination({
  page = 1, pageCount = 1, onChange, ariaLabel = 'Pagination', className = '', ref, ...rest
}: PaginationProps) {
  const go = (p: number) => {
    if (p < 1 || p > pageCount || p === page) return;
    onChange?.(p);
  };
  return (
    <nav {...rest} ref={ref} className={['gt-pagination', className].filter(Boolean).join(' ')} aria-label={ariaLabel}>
      <button type="button" className="gt-pagination__nav" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      {pageItems(page, pageCount).map((p) =>
        typeof p === 'string' ? (
          <span key={p} className="gt-pagination__ellipsis" aria-hidden="true">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={['gt-pagination__page', p === page ? 'gt-pagination__page--active' : ''].filter(Boolean).join(' ')}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Page ${p}`}
            onClick={() => go(p)}
          >
            {p}
          </button>
        ),
      )}
      <button type="button" className="gt-pagination__nav" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Next page">
        <ChevronRight size={14} aria-hidden="true" />
      </button>
    </nav>
  );
}
