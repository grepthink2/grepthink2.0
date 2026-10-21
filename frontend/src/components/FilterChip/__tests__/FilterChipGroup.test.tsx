import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChipGroup, type FilterChipOption } from '../FilterChipGroup';

const RANGE: FilterChipOption[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'class', label: 'Class to date', disabled: true, title: 'Select a class first' },
  { value: 'all', label: 'All' },
];
const KINDS: FilterChipOption[] = [
  { value: 'ta', label: 'TA meetings', count: 3 },
  { value: 'review', label: 'Final reviews' },
  { value: 'meeting', label: 'Team meetings' },
];

function Range({ initial = '7d', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [range, setRange] = useState(initial);
  return (
    <>
      <FilterChipGroup
        type="single"
        ariaLabel="Date range"
        options={RANGE}
        value={range}
        onChange={(v) => {
          onChange?.(v);
          setRange(v);
        }}
      />
      <button type="button">After</button>
    </>
  );
}

function Kinds({ onChange }: { onChange?: (v: string[]) => void }) {
  const [kinds, setKinds] = useState<string[]>(['ta']);
  return (
    <FilterChipGroup
      ariaLabel="Kinds"
      size="sm"
      options={KINDS}
      value={kinds}
      onChange={(v) => {
        onChange?.(v);
        setKinds(v);
      }}
    />
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('FilterChipGroup', () => {
  it('single group is a radiogroup with arrow keys', async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    const group = screen.getByRole('radiogroup', { name: 'Date range' });
    expect(group).toHaveClass('gt-filter-chips');
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(radio('7 days')).toHaveAttribute('aria-checked', 'true');

    await userEvent.tab();
    expect(radio('7 days')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('30 days')).toHaveFocus();
    expect(radio('30 days')).toHaveAttribute('aria-checked', 'true');
    expect(radio('7 days')).toHaveAttribute('aria-checked', 'false');
    // The disabled chip is passed over, and the last wraps to the first.
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('All')).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(radio('7 days')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(radio('All')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio('30 days')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(radio('7 days')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(radio('All')).toHaveFocus();
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['30d', 'all', '7d', 'all', '30d', '7d', 'all']);
  });

  it('single group is one tab stop, entered at the checked chip', async () => {
    render(<Range initial="all" />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0']);
    await userEvent.tab();
    expect(radio('All')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(radio('All')).toHaveFocus();
  });

  it('single group with nothing checked is entered at the first enabled chip', async () => {
    const options = [{ value: 'off', label: 'Off', disabled: true }, ...RANGE];
    render(<FilterChipGroup type="single" ariaLabel="Date range" options={options} value="none" />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);
    await userEvent.tab();
    expect(radio('7 days')).toHaveFocus();
  });

  it('single group checks a chip by click or Space, and a press on the checked chip changes nothing', async () => {
    const onChange = vi.fn();
    render(<Range onChange={onChange} />);
    await userEvent.click(radio('7 days'));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(radio('30 days'));
    expect(onChange).toHaveBeenLastCalledWith('30d');
    expect(radio('30 days')).toHaveAttribute('aria-checked', 'true');
    radio('All').focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('all');
    expect(onChange).toHaveBeenCalledTimes(2);
    // A disabled chip is not a choice, and says why on hover.
    expect(radio('Class to date')).toBeDisabled();
    expect(radio('Class to date')).toHaveAttribute('title', 'Select a class first');
  });

  it('multiple group toggles values', async () => {
    const onChange = vi.fn();
    render(<Kinds onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'Kinds' });
    const ta = within(group).getByRole('button', { name: 'TA meetings 3' });
    const reviews = within(group).getByRole('button', { name: 'Final reviews' });
    expect(ta).toHaveAttribute('aria-pressed', 'true');
    expect(reviews).toHaveAttribute('aria-pressed', 'false');
    expect(ta).toHaveClass('gt-filter-chip--sm');

    await userEvent.click(reviews);
    expect(onChange).toHaveBeenLastCalledWith(['ta', 'review']);
    expect(reviews).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(ta);
    expect(onChange).toHaveBeenLastCalledWith(['review']);
    expect(ta).toHaveAttribute('aria-pressed', 'false');
  });

  it('multiple group, the default, puts every chip in the tab order and leaves the arrows alone', async () => {
    const onChange = vi.fn();
    render(<Kinds onChange={onChange} />);
    for (const chip of screen.getAllByRole('button')) expect(chip).not.toHaveAttribute('tabindex');
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'TA meetings 3' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'TA meetings 3' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Final reviews' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a multi group handed no list, as untyped code can, has nothing pressed and adds to an empty one', async () => {
    const onChange = vi.fn();
    render(<FilterChipGroup ariaLabel="Kinds" options={KINDS} value={undefined as unknown as string[]} onChange={onChange} />);
    for (const chip of screen.getAllByRole('button')) expect(chip).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Final reviews' }));
    expect(onChange).toHaveBeenCalledWith(['review']);
  });

  it('count renders on its chip', () => {
    render(<Kinds />);
    expect(screen.getByText('3')).toHaveClass('gt-filter-chip__count');
  });

  it('passes className, native props and ref to the group, and keeps its role and name to itself', () => {
    const ref = createRef<HTMLDivElement>();
    render(<FilterChipGroup ariaLabel="Kinds" options={KINDS} value={[]} className="x" data-key="g" ref={ref} />);
    const group = screen.getByRole('group', { name: 'Kinds' });
    expect(ref.current).toBe(group);
    expect(group).toHaveClass('gt-filter-chips', 'x');
    expect(group).toHaveAttribute('data-key', 'g');

    // @ts-expect-error: type decides the role
    const roled = <FilterChipGroup role="toolbar" ariaLabel="Range" type="single" options={RANGE} value="7d" />;
    // @ts-expect-error: the name comes from ariaLabel
    const named = <FilterChipGroup aria-label="Other" ariaLabel="Scopes" options={KINDS} value={[]} />;
    render(<div>{roled}{named}</div>);
    expect(screen.getByRole('radiogroup', { name: 'Range' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Scopes' })).toBeInTheDocument();
  });

  it('types the value by the group’s type', () => {
    // @ts-expect-error: a single group's value is one string
    const single = <FilterChipGroup type="single" ariaLabel="Range" options={RANGE} value={['7d']} />;
    // @ts-expect-error: a multi group's value is a list
    const multi = <FilterChipGroup ariaLabel="Kinds" options={KINDS} value="ta" />;
    expect(single).toBeTruthy();
    expect(multi).toBeTruthy();
  });
});
