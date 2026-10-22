import { createRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LayoutGrid, Table2 } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { SegmentedControl, type SegmentedOption } from '../SegmentedControl';

const UNITS: SegmentedOption[] = [
  { value: 'tasks', label: 'Tasks' },
  { value: 'points', label: 'Points' },
  { value: 'hours', label: 'Hours', disabled: true },
  { value: 'days', label: 'Days' },
];

function Unit({ initial = 'tasks', onChange, frozen = false }: { initial?: string; onChange?: (v: string) => void; frozen?: boolean }) {
  const [unit, setUnit] = useState(initial);
  return (
    <>
      <SegmentedControl
        ariaLabel="Unit"
        options={UNITS}
        value={unit}
        onChange={(v) => {
          onChange?.(v);
          if (!frozen) setUnit(v);
        }}
      />
      <button type="button">After</button>
    </>
  );
}

const radio = (name: string) => screen.getByRole('radio', { name });

describe('SegmentedControl', () => {
  it('is a radiogroup named by ariaLabel', () => {
    render(<Unit />);
    const group = screen.getByRole('radiogroup', { name: 'Unit' });
    expect(group).toHaveClass('gt-segmented', 'gt-segmented--md');
    expect(group).not.toHaveClass('gt-segmented--full');
    expect(within(group).getAllByRole('radio')).toHaveLength(4);
    expect(radio('Tasks')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Tasks')).toHaveClass('gt-segmented__option', 'gt-segmented__option--active');
    expect(radio('Points')).toHaveAttribute('aria-checked', 'false');
    expect(radio('Points')).not.toHaveClass('gt-segmented__option--active');
    expect(radio('Points')).toHaveAttribute('type', 'button');
  });

  it('arrow keys move the selection', async () => {
    const onChange = vi.fn();
    render(<Unit onChange={onChange} />);
    await userEvent.tab();
    expect(radio('Tasks')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Points')).toHaveFocus();
    expect(radio('Points')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Tasks')).toHaveAttribute('aria-checked', 'false');
    // All four arrows move, the disabled option is passed over, and the ends wrap.
    await userEvent.keyboard('{ArrowDown}');
    expect(radio('Days')).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Tasks')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(radio('Days')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio('Points')).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(radio('Tasks')).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(radio('Days')).toHaveFocus();
    expect(radio('Days')).toHaveAttribute('aria-checked', 'true');
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['points', 'days', 'tasks', 'days', 'points', 'tasks', 'days']);
  });

  it('disabled options are skipped', async () => {
    const onChange = vi.fn();
    render(<Unit initial="points" onChange={onChange} />);
    expect(radio('Hours')).toBeDisabled();
    await userEvent.click(radio('Hours'));
    expect(onChange).not.toHaveBeenCalled();
    radio('Points').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Days')).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio('Points')).toHaveFocus();
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['days', 'points']);
  });

  it('is one tab stop, entered at the checked option, else the first enabled one', async () => {
    const { unmount } = render(<Unit initial="days" />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '-1', '-1', '0']);
    await userEvent.tab();
    expect(radio('Days')).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    unmount();
    render(<SegmentedControl ariaLabel="Unit" options={[{ value: 'off', label: 'Off', disabled: true }, ...UNITS]} value="none" />);
    expect(screen.getAllByRole('radio').map((r) => r.getAttribute('tabindex'))).toEqual(['-1', '0', '-1', '-1', '-1']);
  });

  it('a click or Space checks an option, and a press on the checked one reports nothing', async () => {
    const onChange = vi.fn();
    render(<Unit onChange={onChange} />);
    await userEvent.click(radio('Tasks'));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(radio('Points'));
    expect(onChange).toHaveBeenLastCalledWith('points');
    radio('Days').focus();
    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenLastCalledWith('days');
    expect(radio('Days')).toHaveAttribute('aria-checked', 'true');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('an arrow back onto the checked option reports nothing, when the parent kept its value', async () => {
    const onChange = vi.fn();
    render(<Unit onChange={onChange} frozen />);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(radio('Points')).toHaveFocus();
    expect(radio('Points')).toHaveAttribute('aria-checked', 'false');
    await userEvent.keyboard('{ArrowLeft}');
    expect(radio('Tasks')).toHaveFocus();
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(['points']);
  });

  it('renders counts after the label, and icons hidden from assistive tech', () => {
    render(
      <SegmentedControl
        ariaLabel="Scope"
        value="people"
        options={[
          { value: 'all', label: 'All', count: 24 },
          { value: 'people', label: 'People', count: 0, icon: <LayoutGrid size={14} aria-hidden="true" /> },
        ]}
      />,
    );
    const all = radio('All 24');
    expect(all.lastElementChild).toHaveClass('gt-segmented__count');
    expect(all).toHaveTextContent('All 24');
    expect(radio('People 0').querySelector('.gt-segmented__icon')).toHaveAttribute('aria-hidden', 'true');
  });

  it('names an icon-only option by its ariaLabel', () => {
    render(
      <SegmentedControl
        ariaLabel="View"
        value="table"
        options={[
          { value: 'table', label: '', ariaLabel: 'Table', icon: <Table2 size={14} aria-hidden="true" /> },
          { value: 'cards', label: '', ariaLabel: 'Cards', icon: <LayoutGrid size={14} aria-hidden="true" /> },
        ]}
      />,
    );
    expect(radio('Table')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Cards')).toHaveAttribute('aria-label', 'Cards');
  });

  it('takes the sm size and full width, and stretches on phones', () => {
    const { rerender } = render(<SegmentedControl ariaLabel="Unit" options={UNITS} value="tasks" size="sm" fullWidth />);
    expect(screen.getByRole('radiogroup')).toHaveClass('gt-segmented--sm', 'gt-segmented--full');
    rerender(<SegmentedControl ariaLabel="Unit" options={UNITS} value="tasks" />);
    expect(screen.getByRole('radiogroup')).not.toHaveClass('gt-segmented--sm');
    const [md] = cssRules('.gt-segmented--md .gt-segmented__option');
    expect(md.getPropertyValue('min-height')).toBe('30px');
    expect(md.getPropertyValue('padding')).toBe('4px 14px');
    const [sm] = cssRules('.gt-segmented--sm .gt-segmented__option');
    expect(sm.getPropertyValue('min-height')).toBe('24px');
    expect(sm.getPropertyValue('padding')).toBe('2px 10px');
    expect(cssRules('.gt-segmented--full')[0].getPropertyValue('width')).toBe('100%');
    expect(cssRules('.gt-segmented--full .gt-segmented__option')[0].getPropertyValue('flex')).toBe('1 1 0px');
    // Under 768px every control is full width with 44px options.
    expect(cssRules('.gt-segmented__option', 'max-width: 767px').map((s) => s.getPropertyValue('min-height'))).toContain('44px');
    expect(cssRules('.gt-segmented', 'max-width: 767px')[0].getPropertyValue('width')).toBe('100%');
  });

  it('passes className, native props and ref, and keeps its role and name to itself', () => {
    const ref = createRef<HTMLDivElement>();
    render(<SegmentedControl ariaLabel="Unit" options={UNITS} value="tasks" className="x" data-key="s" ref={ref} />);
    expect(ref.current).toBe(screen.getByRole('radiogroup'));
    expect(ref.current).toHaveClass('gt-segmented', 'x');
    expect(ref.current).toHaveAttribute('data-key', 's');

    // @ts-expect-error: the control is a radiogroup
    const roled = <SegmentedControl role="tablist" ariaLabel="Unit" options={UNITS} value="tasks" />;
    // @ts-expect-error: the name comes from ariaLabel
    const named = <SegmentedControl aria-label="Other" ariaLabel="Unit" options={UNITS} value="tasks" />;
    // @ts-expect-error: a segmented control needs a name
    const unnamed = <SegmentedControl options={UNITS} value="tasks" />;
    // @ts-expect-error: a value the options do not hold
    const wrong = <SegmentedControl<'a' | 'b'> ariaLabel="Unit" options={[{ value: 'a', label: 'A' }]} value="c" />;
    expect([roled, named, unnamed, wrong]).toHaveLength(4);
  });

  it('ports the track and its options, and sets what the global button rule would', () => {
    render(<Unit />);
    const [track] = cssRules('.gt-segmented');
    expect(track.getPropertyValue('display')).toBe('inline-flex');
    expect(track.getPropertyValue('background')).toBe('var(--gt-gray-100)');
    expect(track.getPropertyValue('box-sizing')).toBe('border-box');
    const [option] = cssRules('.gt-segmented__option');
    expect(option.getPropertyValue('box-sizing')).toBe('border-box');
    expect(option.getPropertyValue('border-style')).toBe('none');
    expect(option.getPropertyValue('border-radius')).toBe('5px');
    expect(option.getPropertyValue('background')).toBe('transparent');
    expect(option.getPropertyValue('font-weight')).toBe('var(--gt-weight-medium)');
    expect(option.getPropertyValue('transition')).toContain('background-color');
    // The padding and font size the global rule sets come from the size class, which every control has.
    expect(cssRules('.gt-segmented--md .gt-segmented__option')[0].getPropertyValue('font-size')).toBe('0.8125rem');
    const [active] = cssRules('.gt-segmented__option--active');
    expect(active.getPropertyValue('font-weight')).toBe('var(--gt-weight-semibold)');
    expect(active.getPropertyValue('background')).toBe('var(--gt-surface)');
    expect(cssRules('.gt-segmented__option:disabled')[0].getPropertyValue('opacity')).toBe('var(--gt-opacity-disabled)');
    expect(cssRules('.gt-segmented__option:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    expect(cssRules('.gt-segmented__option', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });
});
