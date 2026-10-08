import { render, screen } from '@testing-library/react';
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
  it('keeps Apply disabled while the range ends before it starts', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T12:00:00Z'), shouldAdvanceTime: true });
    const onChange = vi.fn();
    render(<AnalyticsFilterRow {...base} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Custom' }));
    await userEvent.click(screen.getByLabelText('To'));
    await userEvent.click(screen.getByRole('button', { name: /September 10th, 2026/ }));
    await userEvent.click(screen.getByLabelText('From'));
    await userEvent.click(screen.getByRole('button', { name: /September 20th, 2026/ }));
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    await userEvent.click(apply);
    expect(onChange).not.toHaveBeenCalled();
  });
  it('disables every control while the first load is pending', () => {
    render(<AnalyticsFilterRow {...base} onChange={() => {}} disabled />);
    expect(screen.getByLabelText('Class')).toBeDisabled();
    expect(screen.getByRole('radio', { name: '7d' })).toBeDisabled();
  });
});
