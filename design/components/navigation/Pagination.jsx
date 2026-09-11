import React from 'react';

/**
 * Pagination — prev/next + numbered pages with ellipsis.
 */
export function Pagination({ page = 1, pageCount = 1, onChange, className = '' }) {
  const go = (p) => {
    if (p < 1 || p > pageCount || p === page) return;
    onChange && onChange(p);
  };

  const pages = [];
  const push = (p) => pages.push(p);
  if (pageCount <= 7) {
    for (let p = 1; p <= pageCount; p++) push(p);
  } else {
    push(1);
    if (page > 3) push('…');
    for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) push(p);
    if (page < pageCount - 2) push('…');
    push(pageCount);
  }

  return (
    <nav className={['gt-pagination', className].filter(Boolean).join(' ')} aria-label="Pagination">
      <button type="button" className="gt-pagination__nav" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className="gt-pagination__ellipsis">…</span>
        ) : (
          <button
            key={p}
            type="button"
            className={['gt-pagination__page', p === page ? 'gt-pagination__page--active' : ''].filter(Boolean).join(' ')}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => go(p)}
          >
            {p}
          </button>
        )
      )}
      <button type="button" className="gt-pagination__nav" onClick={() => go(page + 1)} disabled={page >= pageCount} aria-label="Next page">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </nav>
  );
}
