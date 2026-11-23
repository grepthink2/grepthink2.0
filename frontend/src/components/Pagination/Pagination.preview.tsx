import { useState } from 'react';
import type { PreviewMeta } from '@components/previewMeta';
import { Pagination } from './Pagination';
import { usePagination } from './usePagination';

export const meta: PreviewMeta = { group: 'Navigation', height: 280 };

const STUDENTS = Array.from({ length: 132 }, (_, i) => `Student ${i + 1}`);

export default function PaginationPreview() {
  const [page, setPage] = useState(5);
  const [short, setShort] = useState(2);
  const { pageRows, page: listPage, pageCount, setPage: setListPage, from, to, total } = usePagination(STUDENTS, { initialPageSize: 25 });
  return (
    <div className="ds-stack">
      <section className="ds-section">
        <p className="ds-caption">Twelve pages, on page 5: gaps where pages are skipped</p>
        <Pagination page={page} pageCount={12} onChange={setPage} />
      </section>
      <section className="ds-section">
        <p className="ds-caption">With usePagination: the screen shows the range and the rows</p>
        <p style={{ margin: 0 }}>Showing {from}–{to} of {total}: {pageRows[0]} to {pageRows[pageRows.length - 1]}</p>
        <Pagination page={listPage} pageCount={pageCount} onChange={setListPage} ariaLabel="Student pages" />
      </section>
      <section className="ds-section">
        <p className="ds-caption">Few pages: every number shows</p>
        <Pagination page={short} pageCount={4} onChange={setShort} />
      </section>
    </div>
  );
}
