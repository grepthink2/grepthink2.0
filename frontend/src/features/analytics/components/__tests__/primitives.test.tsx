import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { ChartCard } from '../ChartCard';
import { ChartLegend } from '../ChartLegend';
import { LivePill } from '../LivePill';
import { UnitToggle } from '../UnitToggle';

describe('ChartCard', () => {
  it('shows a skeleton while loading, the content at reduced opacity while refetching, and an inline error', () => {
    const { rerender, container } = render(<ChartCard title="Messages" state="loading"><p>body</p></ChartCard>);
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    expect(container.querySelector('.gt-chart-card')).toHaveAttribute('aria-busy', 'true');
    rerender(<ChartCard title="Messages" state="refetching"><p>body</p></ChartCard>);
    expect(screen.getByText('body')).toBeInTheDocument();
    expect(container.querySelector('.gt-chart-card')).toHaveAttribute('data-state', 'refetching');
    rerender(<ChartCard title="Messages" state="error" errorMessage="This card could not load."><p>body</p></ChartCard>);
    expect(screen.getByRole('alert')).toHaveTextContent('This card could not load.');
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    rerender(<ChartCard title="Messages" state="empty" emptyMessage={{ icon: Inbox, title: 'No sprints yet', hint: 'Boards fill in once teams create their first sprint.' }}><p>body</p></ChartCard>);
    expect(screen.getByText('No sprints yet')).toBeInTheDocument();
  });
  it('renders the live pill, the subtitle and the definition popover trigger', async () => {
    render(<ChartCard title="Scrum board" subtitle="Tasks on every team's board right now, by sprint." live definition={{ title: 'How this is counted', body: 'Every task in view.' }} state="ready"><p>body</p></ChartCard>);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText(/by sprint/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How this is counted' }));
    expect(screen.getByText('Every task in view.')).toBeInTheDocument();
  });
});

describe('UnitToggle', () => {
  it('is a segmented control with aria-pressed and arrow-key movement', async () => {
    const onChange = vi.fn();
    render(<UnitToggle value="count" onChange={onChange} />);
    const tasks = screen.getByRole('button', { name: 'Tasks' });
    expect(tasks).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Points' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Points' }));
    expect(onChange).toHaveBeenCalledWith('points');
    fireEvent.keyDown(tasks, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('points');
  });
});

describe('ChartLegend and LivePill', () => {
  it('renders swatches as classes, toggles items, and the pill reads LIVE', async () => {
    const onToggle = vi.fn();
    const { container } = render(
      <ChartLegend items={[{ key: 'a', label: 'Team channels', swatch: 'rect', colorClass: 'gt-series--1', value: '572' }, { key: 'b', label: 'Direct', swatch: 'line', colorClass: 'gt-series--2' }]} hidden={['b']} onToggle={onToggle} />,
    );
    expect(container.querySelector('.gt-legend__swatch.gt-series--1.gt-legend__swatch--rect')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Direct/ })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: /Team channels/ }));
    expect(onToggle).toHaveBeenCalledWith('a');
    expect(container.querySelectorAll('[style*="#"]')).toHaveLength(0); // no inline hex anywhere
    render(<LivePill />);
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });
});
