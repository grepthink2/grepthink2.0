import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from '../Pagination';
import { pageItems, usePagination } from '../usePagination';

function Pager({ initial = 1, pageCount = 5, onChange }: { initial?: number; pageCount?: number; onChange?: (p: number) => void }) {
  const [page, setPage] = useState(initial);
  return (
    <Pagination
      ariaLabel="Student pages"
      page={page}
      pageCount={pageCount}
      onChange={(p) => {
        onChange?.(p);
        setPage(p);
      }}
    />
  );
}

describe('pageItems', () => {
  it('lists every page up to seven', () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps the ends and the neighbours of the current page past seven, with gaps between', () => {
    expect(pageItems(1, 12)).toEqual([1, 2, 'end-gap', 12]);
    expect(pageItems(6, 12)).toEqual([1, 'start-gap', 5, 6, 7, 'end-gap', 12]);
    expect(pageItems(12, 12)).toEqual([1, 'start-gap', 11, 12]);
    expect(pageItems(3, 12)).toEqual([1, 2, 3, 4, 'end-gap', 12]);
    expect(pageItems(10, 12)).toEqual([1, 'start-gap', 9, 10, 11, 12]);
  });
});

describe('Pagination', () => {
  it('is a named navigation landmark that marks the current page', () => {
    render(<Pager initial={2} />);
    const nav = screen.getByRole('navigation', { name: 'Student pages' });
    expect(nav).toHaveClass('gt-pagination');
    expect(screen.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Page 1' })).not.toHaveAttribute('aria-current');
  });

  it('moves with previous, next and the page buttons, and disables the ends', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pager pageCount={3} onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    await user.click(screen.getByRole('button', { name: 'Page 3' }));
    expect(onChange.mock.calls).toEqual([[2], [3]]);
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('changes nothing when the current page is pressed', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pager initial={2} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Page 2' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hides the ellipsis from screen readers', () => {
    const { container } = render(<Pagination page={6} pageCount={12} />);
    const gaps = container.querySelectorAll('.gt-pagination__ellipsis');
    expect(gaps).toHaveLength(2);
    gaps.forEach((gap) => expect(gap).toHaveAttribute('aria-hidden', 'true'));
  });

  it('passes native props and the ref to the nav', () => {
    const ref = createRef<HTMLElement>();
    render(<Pagination ref={ref} data-testid="pager" className="extra" />);
    expect(ref.current).toBe(screen.getByTestId('pager'));
    expect(ref.current).toHaveClass('gt-pagination', 'extra');
    expect(screen.getByRole('navigation', { name: 'Pagination' })).toBe(ref.current);
  });
});

describe('usePagination', () => {
  const rows = Array.from({ length: 132 }, (_, i) => i + 1);

  it('slices the rows to the current page and reports the range', () => {
    const { result } = renderHook(() => usePagination(rows));
    expect(result.current).toMatchObject({ page: 1, pageCount: 6, pageSize: 25, from: 1, to: 25, total: 132 });
    act(() => result.current.setPage(6));
    expect(result.current).toMatchObject({ page: 6, from: 126, to: 132 });
    expect(result.current.pageRows).toEqual([126, 127, 128, 129, 130, 131, 132]);
  });

  it('goes back to page 1 when the page size changes', () => {
    const { result } = renderHook(() => usePagination(rows));
    act(() => result.current.setPage(3));
    act(() => result.current.setPageSize(50));
    expect(result.current).toMatchObject({ page: 1, pageSize: 50, pageCount: 3, from: 1, to: 50 });
  });

  it('goes back to page 1 when the reset key changes', () => {
    const { result, rerender } = renderHook(({ key }) => usePagination(rows, { resetKey: key }), {
      initialProps: { key: 'a' },
    });
    act(() => result.current.setPage(4));
    rerender({ key: 'a' });
    expect(result.current.page).toBe(4);
    rerender({ key: 'b' });
    expect(result.current.page).toBe(1);
  });

  it('shows the last page when the list shrinks under the current one, and one empty page for none', () => {
    const { result, rerender } = renderHook(({ list }) => usePagination(list), { initialProps: { list: rows } });
    act(() => result.current.setPage(6));
    rerender({ list: rows.slice(0, 30) });
    expect(result.current).toMatchObject({ page: 2, pageCount: 2, from: 26, to: 30 });
    rerender({ list: [] });
    expect(result.current).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, total: 0, pageRows: [] });
  });
});
