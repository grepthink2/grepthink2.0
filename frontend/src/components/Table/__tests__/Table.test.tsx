import { createRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cssRules } from '@/test/cssRules';
import { Table, type TableColumn, type TableSort } from '../Table';

interface Student {
  id: number;
  name: string;
  team: string;
  tsr: string;
}

const ROWS: Student[] = [
  { id: 1, name: 'Ana Ruiz', team: 'Team 4', tsr: '4 / 4' },
  { id: 2, name: 'Ben Okafor', team: 'Team 2', tsr: '3 / 4' },
  { id: 3, name: 'Cho Park', team: 'Team 7', tsr: '1 / 4' },
];
const COLUMNS: TableColumn<Student>[] = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'team', label: 'Team', sortable: true },
  { key: 'tsr', label: 'TSRs' },
];

/** A roster sorted by its own state, as a page holds it. */
function Roster({ onSort }: { onSort?: (next: TableSort) => void }) {
  const [sort, setSort] = useState<TableSort>({ key: 'name', dir: 'asc' });
  const rows = [...ROWS].sort((a, b) => a[sort.key as 'name' | 'team'].localeCompare(b[sort.key as 'name' | 'team']) * (sort.dir === 'asc' ? 1 : -1));
  return (
    <Table
      caption="Class roster"
      columns={COLUMNS}
      rows={rows}
      sort={sort}
      onSort={(next) => {
        onSort?.(next);
        setSort(next);
      }}
    />
  );
}

const header = (name: string) => screen.getByRole('columnheader', { name });
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

/** Installs a ResizeObserver (jsdom has none) and returns a way to report a size change to every observer. */
function stubResizeObserver() {
  const callbacks = new Set<ResizeObserverCallback>();
  const observed: Element[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      callbacks.add(callback);
    }
    observe(el: Element) {
      observed.push(el);
    }
    unobserve() {}
    disconnect() {
      disconnect();
      callbacks.delete(this.callback);
    }
  });
  const report = () => act(() => callbacks.forEach((cb) => cb([], {} as ResizeObserver)));
  return { report, observed, disconnect };
}

/** Gives the wrapper the scroll and client sizes a laid-out page would. */
function size(el: HTMLElement, { scrollWidth = 100, clientWidth = 100, scrollHeight = 100, clientHeight = 100 }) {
  Object.defineProperties(el, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
    scrollHeight: { configurable: true, value: scrollHeight },
    clientHeight: { configurable: true, value: clientHeight },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Table', () => {
  it('headers have scope col and the caption names the table', () => {
    const { container } = render(<Table caption="Assignments" columns={COLUMNS} rows={ROWS} />);
    const table = screen.getByRole('table', { name: 'Assignments' });
    expect(table).toHaveClass('gt-table');
    expect(table.parentElement).toHaveClass('gt-table-wrapper');
    expect(container.querySelector('caption')).toHaveClass('gt-visually-hidden');
    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['Name', 'Team', 'TSRs']);
    for (const h of headers) expect(h).toHaveAttribute('scope', 'col');
    // Without onSort there is nothing to sort with: no buttons, no aria-sort.
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const h of headers) expect(h).not.toHaveAttribute('aria-sort');
    expect(names()).toEqual(['Ana Ruiz', 'Ben Okafor', 'Cho Park']);
    expect(within(screen.getAllByRole('row')[1]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Ana Ruiz', 'Team 4', '4 / 4']);
  });

  it('a sortable header toggles direction and sets aria-sort', async () => {
    const onSort = vi.fn();
    render(<Roster onSort={onSort} />);
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Team')).toHaveAttribute('aria-sort', 'none');
    expect(header('TSRs')).not.toHaveAttribute('aria-sort');
    expect(within(header('TSRs')).queryByRole('button')).not.toBeInTheDocument();
    const nameButton = within(header('Name')).getByRole('button', { name: 'Name' });
    expect(nameButton).toHaveClass('gt-table__sort', 'gt-table__sort--active');
    expect(nameButton.querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevron-up');

    await userEvent.click(nameButton);
    expect(onSort).toHaveBeenLastCalledWith({ key: 'name', dir: 'desc' });
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending');
    expect(nameButton.querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevron-down');
    expect(names()).toEqual(['Cho Park', 'Ben Okafor', 'Ana Ruiz']);

    // Another column starts ascending, and the first goes back to none.
    await userEvent.click(within(header('Team')).getByRole('button'));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'team', dir: 'asc' });
    expect(header('Team')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Name')).toHaveAttribute('aria-sort', 'none');
    expect(nameButton).not.toHaveClass('gt-table__sort--active');
    expect(names()).toEqual(['Ben Okafor', 'Ana Ruiz', 'Cho Park']);
    await userEvent.click(within(header('Team')).getByRole('button'));
    expect(onSort).toHaveBeenLastCalledWith({ key: 'team', dir: 'desc' });
  });

  it('sorts by keyboard: the sort buttons are in the tab order', async () => {
    render(<Roster />);
    await userEvent.tab();
    expect(within(header('Name')).getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending');
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(header('Team')).toHaveAttribute('aria-sort', 'ascending');
  });

  it('a sortable table with no sort yet starts each column ascending', async () => {
    const onSort = vi.fn();
    render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} onSort={onSort} />);
    expect(header('Name')).toHaveAttribute('aria-sort', 'none');
    expect(header('Team')).toHaveAttribute('aria-sort', 'none');
    await userEvent.click(within(header('Team')).getByRole('button'));
    expect(onSort).toHaveBeenCalledWith({ key: 'team', dir: 'asc' });
  });

  it('loading renders skeleton rows hidden from assistive tech', () => {
    const { container, rerender } = render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} loading />);
    const table = screen.getByRole('table', { name: 'Roster' });
    expect(table).toHaveAttribute('aria-busy', 'true');
    const bodyRows = container.querySelectorAll('tbody tr');
    expect(bodyRows).toHaveLength(4);
    for (const row of bodyRows) {
      expect(row).toHaveAttribute('aria-hidden', 'true');
      expect(row.querySelectorAll('td .gt-skeleton')).toHaveLength(3);
    }
    // Only the header row is in the accessibility tree; no data, no empty row.
    expect(screen.getAllByRole('row')).toHaveLength(1);
    expect(screen.queryByText('Ana Ruiz')).not.toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();

    rerender(<Table caption="Roster" columns={COLUMNS} rows={[]} loading skeletonRows={2} />);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    rerender(<Table caption="Roster" columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByRole('table')).not.toHaveAttribute('aria-busy');
  });

  it('an empty table renders the empty state in one cell', () => {
    const { rerender } = render(<Table caption="Roster" columns={COLUMNS} rows={[]} />);
    const cell = screen.getByRole('cell');
    expect(cell).toHaveAttribute('colspan', '3');
    expect(cell).toHaveClass('gt-table__empty-cell');
    const empty = cell.firstElementChild!;
    expect(empty).toHaveClass('gt-empty', 'gt-empty--card');
    // A row's title is a paragraph, not a heading.
    expect(within(cell).getByText('Nothing here yet.').tagName).toBe('P');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();

    rerender(<Table caption="Roster" columns={COLUMNS} rows={[]} emptyText="No students match these filters." />);
    expect(within(screen.getByRole('cell')).getByText('No students match these filters.')).toBeInTheDocument();
    rerender(<Table caption="Roster" columns={COLUMNS} rows={[]} emptyState={<span>Import a roster first.</span>} />);
    expect(within(screen.getByRole('cell')).getByText('Import a roster first.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();
    expect(cssRules('.gt-table td.gt-table__empty-cell')[0].getPropertyValue('padding')).toBe('0px');
  });

  it('rowHref makes the first cell a link to the row', () => {
    render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} rowHref={(r) => `/app/students/${r.id}`} />);
    const link = screen.getByRole('link', { name: 'Ben Okafor' });
    expect(link).toHaveAttribute('href', '/app/students/2');
    expect(link).toHaveClass('gt-table__open');
    expect(link.parentElement!.tagName).toBe('TD');
    expect(screen.getAllByRole('link')).toHaveLength(3);
    // Only the first cell opens the row.
    expect(within(screen.getAllByRole('row')[1]).getByText('Team 4').closest('a')).toBeNull();
  });

  it('rowTo makes the first cell a router link, so opening a row does not reload the app', async () => {
    render(
      <MemoryRouter initialEntries={['/app/roster']}>
        <Routes>
          <Route path="/app/roster" element={<Table caption="Roster" columns={COLUMNS} rows={ROWS} rowTo={(r) => `/app/students/${r.id}`} />} />
          <Route path="/app/students/:id" element={<p>Student page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Cho Park' });
    expect(link).toHaveAttribute('href', '/app/students/3');
    expect(link).toHaveClass('gt-table__open');
    expect(screen.getAllByRole('link')).toHaveLength(3);
    await userEvent.click(link);
    expect(screen.getByText('Student page')).toBeInTheDocument();
  });

  it('a row opens once: rowTo comes before rowHref, and either before onRowClick', () => {
    const onRowClick = vi.fn();
    render(
      <MemoryRouter>
        <Table caption="Roster" columns={COLUMNS} rows={ROWS.slice(0, 1)} rowTo={() => '/in-app'} rowHref={() => 'https://example.org'} onRowClick={onRowClick} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Ana Ruiz' })).toHaveAttribute('href', '/in-app');
    expect(screen.queryByRole('button', { name: 'Ana Ruiz' })).not.toBeInTheDocument();
  });

  it('onRowClick makes the first cell a button that opens the row, and nothing else does', async () => {
    const onRowClick = vi.fn();
    render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} onRowClick={onRowClick} />);
    const open = screen.getByRole('button', { name: 'Cho Park' });
    expect(open).toHaveClass('gt-table__open');
    expect(open).toHaveAttribute('type', 'button');
    await userEvent.click(open);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[2]);
    // The rest of the row is not a target: no <tr onClick>.
    await userEvent.click(screen.getByText('Team 7'));
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it('renders each cell by its column’s render, and keys rows by rowKey', () => {
    const rowKey = vi.fn((row: Student) => `s${row.id}`);
    render(
      <Table
        caption="Roster"
        columns={[{ key: 'name', label: 'Name' }, { key: 'tsr', label: 'TSRs', render: (r) => <strong>{r.tsr} done</strong> }]}
        rows={ROWS}
        rowKey={rowKey}
      />,
    );
    expect(screen.getByText('4 / 4 done').tagName).toBe('STRONG');
    expect(rowKey).toHaveBeenCalledWith(ROWS[0], 0);
  });

  it('a rowHeader column’s cells are the rows’ headers, and read as body cells', () => {
    render(<Table caption="Roster" columns={[{ ...COLUMNS[0], rowHeader: true }, COLUMNS[1]]} rows={ROWS} />);
    const rowHeaders = screen.getAllByRole('rowheader');
    expect(rowHeaders.map((h) => h.textContent)).toEqual(['Ana Ruiz', 'Ben Okafor', 'Cho Park']);
    for (const h of rowHeaders) expect(h).toHaveAttribute('scope', 'row');
    expect(screen.getAllByRole('cell')).toHaveLength(3);
    const [body] = cssRules('.gt-table tbody th');
    expect(body.getPropertyValue('background')).toBe('var(--gt-surface)');
    expect(body.getPropertyValue('color')).toBe('var(--gt-text-primary)');
    expect(body.getPropertyValue('padding')).toBe('var(--gt-space-md)');
    expect(body.getPropertyValue('white-space')).toBe('normal');
    expect(cssRules('.gt-table tbody tr:hover th')[0].getPropertyValue('background')).toBe('var(--gt-gray-50)');
    expect(cssRules('.gt-table--dense tbody th')[0].getPropertyValue('padding')).toBe('8px 12px');
  });

  it('a column’s class and width reach its header and cells, and a row’s class its row', () => {
    render(
      <Table
        caption="Roster"
        columns={[COLUMNS[0], { key: 'tsr', label: 'TSRs', className: 'num', width: '6rem' }, { key: 'team', label: 'Team', sortable: true, width: '8rem' }]}
        rows={ROWS}
        onSort={() => {}}
        rowClassName={(r, i) => (i === 2 ? `last-${r.id}` : undefined)}
      />,
    );
    expect(header('TSRs')).toHaveClass('num');
    expect(header('TSRs').style.width).toBe('6rem');
    expect(header('Team').style.width).toBe('8rem');
    for (const cell of screen.getAllByText(/ \/ 4$/)) expect(cell).toHaveClass('num');
    const rows = screen.getAllByRole('row');
    expect(rows[3]).toHaveClass('last-3');
    expect(rows[1]).not.toHaveAttribute('class');
  });

  it('takes dense rows and a sticky header', () => {
    const { rerender } = render(<Table caption="Breakdown" columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByRole('table')).not.toHaveClass('gt-table--dense');
    rerender(<Table caption="Breakdown" columns={COLUMNS} rows={ROWS} dense stickyHeader />);
    expect(screen.getByRole('table')).toHaveClass('gt-table', 'gt-table--dense', 'gt-table--sticky');
    expect(cssRules('.gt-table--dense td')[0].getPropertyValue('padding')).toBe('8px 12px');
    expect(cssRules('.gt-table--dense th')[0].getPropertyValue('padding')).toBe('6px 12px');
    const [sticky] = cssRules('.gt-table--sticky thead th');
    expect(sticky.getPropertyValue('position')).toBe('sticky');
    expect(sticky.getPropertyValue('top')).toBe('0px');
  });

  it('the wrapper becomes a focusable region named by the caption while the table overflows', () => {
    const { observed, report, disconnect } = stubResizeObserver();
    const { container, unmount } = render(<Table caption={<>Class <em>roster</em></>} columns={COLUMNS} rows={ROWS} />);
    const wrapper = container.firstChild as HTMLElement;
    // The wrapper and the table: either one resizing can start or end the overflow.
    expect(observed).toEqual([wrapper, screen.getByRole('table')]);
    expect(wrapper).not.toHaveAttribute('role');
    expect(wrapper).not.toHaveAttribute('tabindex');

    size(wrapper, { scrollWidth: 640, clientWidth: 360 });
    report();
    const region = screen.getByRole('region', { name: 'Class roster' });
    expect(region).toBe(wrapper);
    expect(region).toHaveAttribute('tabindex', '0');

    // A feature's max-height scrolls it down: that overflows too. A pixel of rounding does not.
    size(wrapper, { scrollHeight: 900, clientHeight: 400 });
    report();
    expect(screen.getByRole('region', { name: 'Class roster' })).toBe(wrapper);
    size(wrapper, { scrollWidth: 361, clientWidth: 360 });
    report();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(wrapper).not.toHaveAttribute('tabindex');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('stays a plain wrapper where there is no ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { container } = render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} />);
    expect(container.firstChild).not.toHaveAttribute('role');
  });

  it('passes className, native props and ref to its wrapper, and keeps the region’s role and name to itself', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} className="x" data-key="t" style={{ maxHeight: 320 }} ref={ref} />);
    expect(ref.current).toBe(container.firstChild);
    expect(ref.current).toHaveClass('gt-table-wrapper', 'x');
    expect(ref.current).toHaveAttribute('data-key', 't');
    expect(ref.current).toHaveStyle({ maxHeight: '320px' });

    // @ts-expect-error: the wrapper is a region only while it overflows
    const roled = <Table role="grid" caption="Roster" columns={COLUMNS} rows={ROWS} />;
    // @ts-expect-error: the caption names the table and its region
    const named = <Table aria-label="Other" caption="Roster" columns={COLUMNS} rows={ROWS} />;
    // @ts-expect-error: the caption labels the region
    const labelled = <Table aria-labelledby="x" caption="Roster" columns={COLUMNS} rows={ROWS} />;
    // @ts-expect-error: the region joins the tab order only while it overflows
    const stop = <Table tabIndex={0} caption="Roster" columns={COLUMNS} rows={ROWS} />;
    // @ts-expect-error: every table needs a caption to name it
    const unnamed = <Table columns={COLUMNS} rows={ROWS} />;
    expect([roled, named, labelled, stop, unnamed]).toHaveLength(5);
  });

  it('ports the table block, and sets what the global button rule would on the open-row button', () => {
    render(<Table caption="Roster" columns={COLUMNS} rows={ROWS} onRowClick={() => {}} />);
    const [wrapper] = cssRules('.gt-table-wrapper');
    expect(wrapper.getPropertyValue('overflow-x')).toBe('auto');
    expect(cssRules('.gt-table-wrapper:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    const [th] = cssRules('.gt-table th');
    expect(th.getPropertyValue('padding')).toBe('10px var(--gt-space-md)');
    expect(th.getPropertyValue('background')).toBe('var(--gt-surface-sunken)');
    expect(th.getPropertyValue('white-space')).toBe('nowrap');
    const [td] = cssRules('.gt-table td');
    expect(td.getPropertyValue('border-bottom')).toBe('1px solid var(--gt-border)');
    expect(cssRules('.gt-table tbody tr:hover td')[0].getPropertyValue('background')).toBe('var(--gt-gray-50)');
    const [open] = cssRules('.gt-table__open');
    expect(open.getPropertyValue('padding')).toBe('0px');
    expect(open.getPropertyValue('border-style')).toBe('none');
    expect(open.getPropertyValue('border-radius')).toBe('4px');
    expect(open.getPropertyValue('background')).toBe('none');
    expect(open.getPropertyValue('font-weight')).toBe('var(--gt-weight-semibold)');
    expect(cssRules('.gt-table__open:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring-tight)');
  });
});
