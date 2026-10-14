import { ChevronLeft, ChevronRight } from 'lucide-react';

interface SearchPaginationProps {
  page: number;
  pages: number;
  from: number;
  to: number;
  total: number;
  onChange: (page: number) => void;
}

/** Compact pager for the palette footer: "1–8 of 37 · ‹ 1 / 5 ›". */
export function SearchPagination({ page, pages, from, to, total, onChange }: SearchPaginationProps) {
  if (!total) return null;
  return (
    <nav className="gt-pagination-compact" aria-label="Result pages">
      <span className="gt-pagination-compact__range">{from}–{to} of {total}</span>
      <button
        type="button"
        className="gt-pagination-compact__btn"
        aria-label="Previous page"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={13} />
      </button>
      <span className="gt-pagination-compact__page" aria-live="polite">{page} / {pages}</span>
      <button
        type="button"
        className="gt-pagination-compact__btn"
        aria-label="Next page"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={13} />
      </button>
    </nav>
  );
}
