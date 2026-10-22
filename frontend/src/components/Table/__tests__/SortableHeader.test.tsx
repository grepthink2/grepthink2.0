import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cssRules } from '@/test/cssRules';
import { SortableHeader } from '../SortableHeader';
import { useTableSort, type SortAccessors } from '../useTableSort';

interface Person {
  name: string;
  age: number;
}
const PEOPLE: Person[] = [{ name: 'Cho', age: 21 }, { name: 'Ana', age: 30 }, { name: 'Ben', age: 19 }];
const ACCESSORS: SortAccessors<Person, 'name' | 'age'> = { name: (p) => p.name, age: (p) => p.age };

/** A table of its own, sorted by useTableSort, as the roster, project and assignment lists are. */
function People() {
  const { sortedRows, sort, toggleSort } = useTableSort(PEOPLE, ACCESSORS, { key: 'name', direction: 'asc' });
  return (
    <table>
      <thead>
        <tr>
          <SortableHeader label="Name" sortKey="name" currentSort={sort} onSort={toggleSort} />
          <SortableHeader label="Age" sortKey="age" currentSort={sort} onSort={toggleSort} className="num" />
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sortedRows.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.age}</td><td /></tr>)}
      </tbody>
    </table>
  );
}

const header = (name: string) => screen.getByRole('columnheader', { name });
const firstColumn = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('SortableHeader', () => {
  it('is a column header with a sort button, its aria-sort following the sort', async () => {
    render(<People />);
    expect(header('Name')).toHaveAttribute('scope', 'col');
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending');
    // ARIA 1.2 puts aria-sort on the sorted column only.
    expect(header('Age')).not.toHaveAttribute('aria-sort');
    // Unsorted, its glyph is neutral: a first press may sort either way.
    expect(header('Age').querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevrons-up-down');
    expect(header('Age')).toHaveClass('num');
    const name = within(header('Name')).getByRole('button', { name: 'Name' });
    expect(name).toHaveAttribute('type', 'button');
    expect(name).toHaveClass('gt-table__sort', 'gt-table__sort--active');
    const icon = name.querySelector('.gt-table__sort-icon')!;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon).toHaveClass('lucide-chevron-up');
    expect(firstColumn()).toEqual(['Ana', 'Ben', 'Cho']);

    await userEvent.click(name);
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending');
    expect(name.querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevron-down');
    expect(firstColumn()).toEqual(['Cho', 'Ben', 'Ana']);

    // Another column takes over, ascending; this one loses aria-sort and goes back to the faint neutral glyph.
    await userEvent.click(within(header('Age')).getByRole('button'));
    expect(header('Age')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Name')).not.toHaveAttribute('aria-sort');
    expect(name).not.toHaveClass('gt-table__sort--active');
    expect(name.querySelector('.gt-table__sort-icon')).toHaveClass('lucide-chevrons-up-down');
    expect(firstColumn()).toEqual(['Ben', 'Cho', 'Ana']);
  });

  it('is unsorted with no sort at all, and reports its own key', async () => {
    const onSort = vi.fn();
    render(<table><thead><tr><SortableHeader label="Due" sortKey="due" currentSort={null} onSort={onSort} /></tr></thead></table>);
    expect(header('Due')).not.toHaveAttribute('aria-sort');
    await userEvent.click(screen.getByRole('button', { name: 'Due' }));
    expect(onSort).toHaveBeenCalledWith('due');
  });

  it('passes className, native props and ref to its th, and keeps scope and aria-sort to itself', () => {
    const ref = createRef<HTMLTableCellElement>();
    render(
      <table><thead><tr>
        <SortableHeader label="Name" sortKey="name" currentSort={null} onSort={() => {}} className="x" data-key="h" ref={ref} />
      </tr></thead></table>,
    );
    expect(ref.current).toBe(header('Name'));
    expect(ref.current).toHaveClass('x');
    expect(ref.current).toHaveAttribute('data-key', 'h');
    // @ts-expect-error: a sortable header is a column header
    const scoped = <SortableHeader scope="row" label="A" sortKey="a" currentSort={null} onSort={() => {}} />;
    // @ts-expect-error: currentSort decides aria-sort
    const sorted = <SortableHeader aria-sort="ascending" label="A" sortKey="a" currentSort={null} onSort={() => {}} />;
    expect([scoped, sorted]).toHaveLength(2);
  });

  it('ports the sort button, and sets what the global button rule would', () => {
    render(<People />);
    const [button] = cssRules('.gt-table__sort');
    expect(button.getPropertyValue('padding')).toBe('0px');
    expect(button.getPropertyValue('border-style')).toBe('none');
    expect(button.getPropertyValue('border-radius')).toBe('4px');
    expect(button.getPropertyValue('background')).toBe('none');
    expect(button.getPropertyValue('font')).toBe('inherit');
    expect(button.getPropertyValue('color')).toBe('inherit');
    expect(cssRules('.gt-table__sort:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring-tight)');
    expect(cssRules('.gt-table__sort-icon')[0].getPropertyValue('opacity')).toBe('0.35');
    expect(cssRules('.gt-table__sort--active .gt-table__sort-icon')[0].getPropertyValue('opacity')).toBe('1');
    expect(cssRules('.gt-table__sort--active')[0].getPropertyValue('color')).toBe('var(--gt-text-primary)');
  });
});
