import React from 'react';

const Chevron = ({ dir }) => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {dir === 'prev' ? <path d="m15 18-6-6 6-6"/> : <path d="m9 18 6-6-6-6"/>}
  </svg>
);

/** Compact prev/next pager for the palette footer: "1–8 of 37 · ‹ 1 / 5 ›". */
export function SearchPagination({ page = 1, pages = 1, from = 0, to = 0, total = 0, onChange, className = '' }) {
  if (!total) return null;
  return (
    <nav className={['gt-pagination-compact', className].filter(Boolean).join(' ')} aria-label="Result pages">
      <span className="gt-pagination-compact__range">{from}–{to} of {total}</span>
      <button type="button" className="gt-pagination-compact__btn" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange && onChange(page - 1)}><Chevron dir="prev" /></button>
      <span className="gt-pagination-compact__page" aria-live="polite">{page} / {pages}</span>
      <button type="button" className="gt-pagination-compact__btn" aria-label="Next page" disabled={page >= pages} onClick={() => onChange && onChange(page + 1)}><Chevron dir="next" /></button>
    </nav>
  );
}
