import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsFilterRow } from '../AnalyticsFilterRow';

const base = {
  institutions: [{ id: 'i1', name: 'UC Santa Cruz' }],
  institutionId: 'i1',
  classes: [{ id: 'c1', label: 'CSE 115A · Fall 2026' }, { id: 'c2', label: 'CSE 115B' }],
  classId: null as string | null,
  range: { preset: '30d' as const, from: null, to: null },
};
const TWO_SCHOOLS = [...base.institutions, { id: 'i2', name: 'İstinye University' }];

describe('AnalyticsFilterRow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the institution picker only for more than one institution', () => {
    const { rerender } = render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    expect(screen.queryByLabelText('Institution')).toBeNull();
    rerender(<AnalyticsFilterRow {...base} institutions={[...base.institutions, { id: 'i2', name: 'İstinye University' }]} onChange={() => {}} />);
    expect(screen.getByLabelText('Institution')).toBeInTheDocument();
  });
  it('marks the active chip, disables "Class to date" without a class, and reports changes', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: '30d' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Class to date' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: '90d' }));
    expect(onChange).toHaveBeenCalledWith({ window: '90d' });
    await userEvent.selectOptions(screen.getByLabelText('Class'), 'c2');
    expect(onChange).toHaveBeenCalledWith({ classId: 'c2' });
  });
  it('applies a custom range from the popover and shows it in the chip', async () => {
    // The calendar opens on the current month: pin the clock so September 2026 is the one that opens.
    vi.useFakeTimers({ now: new Date('2026-09-15T12:00:00Z'), shouldAdvanceTime: true });
    const onChange = vi.fn();
    const { rerender } = render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: /September 1st, 2026/ }));
    await userEvent.click(screen.getByLabelText('To'));
    await userEvent.click(screen.getByRole('button', { name: /September 30th, 2026/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith({ window: 'custom', from: '2026-09-01', to: '2026-09-30' });
    rerender(<AnalyticsFilterRow {...base} range={{ preset: 'custom', from: '2026-09-01', to: '2026-09-30' }} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Custom: Sep 1 – Sep 30/ })).toBeChecked();
  });
  it('keeps the panel open through a press on a calendar day and closes it on a press outside', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T12:00:00Z'), shouldAdvanceTime: true });
    render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: /September 1st, 2026/ }));
    expect(screen.getByLabelText('From')).toHaveTextContent('Sep 1, 2026');
    await userEvent.click(document.body);
    expect(screen.queryByLabelText('From')).toBeNull();
  });
  it('clears To when From moves past it', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T12:00:00Z'), shouldAdvanceTime: true });
    render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByLabelText('To'));
    await userEvent.click(screen.getByRole('button', { name: /September 10th, 2026/ }));
    await userEvent.click(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: /September 20th, 2026/ }));
    expect(screen.getByLabelText('To')).toHaveTextContent('Select a date');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });
  it('keeps Apply disabled for a range that ends before it starts', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} range={{ preset: 'custom', from: '2026-09-20', to: '2026-09-10' }} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Custom/ }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await userEvent.click(apply);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('reseeds the dates from the applied range each time the panel opens', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T12:00:00Z'), shouldAdvanceTime: true });
    const { rerender } = render(<AnalyticsFilterRow {...base} range={{ preset: 'custom', from: '2026-09-01', to: '2026-09-30' }} onChange={() => {}} />);
    rerender(<AnalyticsFilterRow {...base} range={{ preset: 'custom', from: '2026-08-03', to: '2026-08-28' }} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: /^Custom/ }));
    expect(screen.getByLabelText('From')).toHaveTextContent('Aug 3, 2026');
    expect(screen.getByLabelText('To')).toHaveTextContent('Aug 28, 2026');
    await userEvent.keyboard('{Escape}');
    // back on 30d: a draft that was never applied is dropped
    rerender(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: /September 1st, 2026/ }));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    expect(screen.getByLabelText('From')).toHaveTextContent('Select a date');
  });
  it('returns focus to the Custom chip after Apply', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} range={{ preset: 'custom', from: '2026-09-01', to: '2026-09-30' }} onChange={onChange} />);
    const custom = screen.getByRole('radio', { name: /^Custom/ });
    await userEvent.click(custom);
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(onChange).toHaveBeenCalledWith({ window: 'custom', from: '2026-09-01', to: '2026-09-30' });
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    expect(custom).toHaveFocus();
  });
  it('moves focus and the selection with the arrow keys, skipping the disabled chip', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<AnalyticsFilterRow {...base} range={{ preset: '90d', from: null, to: null }} onChange={onChange} />);
    const chip = (name: string) => screen.getByRole('radio', { name });
    expect(['7d', '30d', '90d', 'Class to date', 'All', 'Custom'].map((n) => chip(n).tabIndex)).toEqual([-1, -1, 0, -1, -1, -1]);
    await userEvent.tab();
    await userEvent.tab();
    expect(chip('90d')).toHaveFocus(); // the group's one tab stop is the checked chip
    await userEvent.keyboard('{ArrowRight}');
    expect(chip('All')).toHaveFocus(); // "Class to date" is disabled without a class
    expect(onChange).toHaveBeenLastCalledWith({ window: 'all' });
    await userEvent.keyboard('{ArrowDown}');
    expect(chip('Custom')).toHaveFocus(); // focus only: a custom window needs dates
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('From')).toBeNull();
    await userEvent.keyboard('{ArrowRight}');
    expect(chip('7d')).toHaveFocus(); // wraps
    expect(onChange).toHaveBeenLastCalledWith({ window: '7d' });
    await userEvent.keyboard('{ArrowLeft}');
    expect(chip('Custom')).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(chip('All')).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith({ window: 'all' });
    rerender(<AnalyticsFilterRow {...base} range={{ preset: 'all', from: null, to: null }} onChange={onChange} />);
    expect(['7d', '30d', '90d', 'Class to date', 'All', 'Custom'].map((n) => chip(n).tabIndex)).toEqual([-1, -1, -1, -1, 0, -1]);
  });
  it('jumps to the first and the last enabled chip with Home and End', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    act(() => screen.getByRole('radio', { name: '30d' }).focus());
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('radio', { name: '7d' })).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith({ window: '7d' });
    // a modified arrow (Alt+Left is the browser's Back) is left to the browser
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(screen.getByRole('radio', { name: '7d' })).toHaveFocus();
    expect(onChange).toHaveBeenCalledTimes(1);
  });
  it('opens the panel with Space on Custom; Escape closes it and focuses the Custom chip', async () => {
    render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    const custom = screen.getByRole('radio', { name: 'Custom' });
    act(() => custom.focus());
    await userEvent.keyboard(' ');
    expect(custom.tabIndex).toBe(0); // while its panel is open, Custom is the group's tab stop, so Shift+Tab from the panel lands on it
    await userEvent.tab();
    expect(screen.getByLabelText('From')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(custom).toHaveFocus();
    expect(custom.tabIndex).toBe(-1);
  });
  it('closes the panel when the arrow keys move off Custom, as a press on another chip would', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    act(() => screen.getByRole('radio', { name: 'Custom' }).focus());
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    expect(onChange).toHaveBeenCalledWith({ window: 'all' });
  });
  it('closes the panel on an outside press without sending focus to the Custom chip', async () => {
    render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    const custom = screen.getByRole('radio', { name: 'Custom' });
    await userEvent.click(custom);
    await userEvent.tab();
    expect(screen.getByLabelText('From')).toHaveFocus();
    // a bare mousedown, with no default focus move after it, so a close that pulled focus to the chip would show
    fireEvent.mouseDown(document.body);
    expect(screen.queryByLabelText('From')).toBeNull();
    expect(custom).not.toHaveFocus();
  });
  it('leaves Escape alone while the panel is closed', async () => {
    render(<AnalyticsFilterRow {...base} onChange={() => {}} />);
    const custom = screen.getByRole('radio', { name: 'Custom' });
    await userEvent.click(custom);
    await userEvent.click(custom); // open, then closed again: no Escape listener may outlive the panel
    const select = screen.getByLabelText('Class');
    act(() => select.focus());
    await userEvent.keyboard('{Escape}');
    expect(select).toHaveFocus();
    expect(custom).not.toHaveFocus();
  });
  it('leaves the range alone when arrow keys are pressed inside the Custom panel', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    act(() => screen.getByLabelText('From').focus());
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{ArrowDown}{ArrowUp}');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: '30d' })).toBeChecked();
    expect(screen.getByLabelText('From')).toHaveFocus();
  });
  it('clears the class when the institution changes, and "All classes" clears it too', async () => {
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} institutions={TWO_SCHOOLS} classId="c1" onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('Institution'), 'i2');
    expect(onChange).toHaveBeenLastCalledWith({ institutionId: 'i2', classId: null });
    await userEvent.selectOptions(screen.getByLabelText('Class'), 'All classes');
    expect(onChange).toHaveBeenLastCalledWith({ classId: null });
  });
  it('disables every control while the first load is pending', () => {
    render(<AnalyticsFilterRow {...base} onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Class')).toBeDisabled();
    expect(screen.getByRole('radio', { name: '7d' })).toBeDisabled();
  });
  it('disables the institution picker and the Custom chip too while the first load is pending', () => {
    render(<AnalyticsFilterRow {...base} institutions={TWO_SCHOOLS} onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Institution')).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeDisabled();
  });
});
