import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Inbox } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChartCard } from '../ChartCard';
import { ChartLegend } from '../ChartLegend';
import { ChartTooltip } from '../ChartTooltip';
import { DefinitionPopover } from '../DefinitionPopover';
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
    expect(screen.getByRole('status')).toHaveTextContent('This card could not load.'); // the page's strip is the alert
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    rerender(<ChartCard title="Messages" state="empty" emptyMessage={{ icon: Inbox, title: 'No sprints yet', hint: 'Boards fill in once teams create their first sprint.' }}><p>body</p></ChartCard>);
    expect(screen.getByText('No sprints yet')).toBeInTheDocument();
  });
  it('falls back to the default error copy, and an empty card never draws its children', () => {
    const { rerender } = render(<ChartCard title="Messages" state="error"><p>body</p></ChartCard>);
    expect(screen.getByRole('status')).toHaveTextContent('This card could not load.');
    rerender(<ChartCard title="Messages" state="empty" emptyMessage={{ icon: Inbox, title: 'No messages yet', hint: 'Team channels fill in as teams start talking.' }}><p>body</p></ChartCard>);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    rerender(<ChartCard title="Messages" state="empty"><p>body</p></ChartCard>);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
    expect(screen.queryByText('body')).not.toBeInTheDocument();
  });
  it('renders the live pill, the subtitle and the definition popover trigger', async () => {
    render(<ChartCard title="Scrum board" subtitle="Tasks on every team's board right now, by sprint." live definition={{ title: 'How this is counted', body: 'Every task in view.' }} state="ready"><p>body</p></ChartCard>);
    expect(screen.getByRole('heading', { name: 'Scrum board' })).toBeInTheDocument(); // the heading holds only its title
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText(/by sprint/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'How Scrum board is counted' }));
    expect(screen.getByText('Every task in view.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Scrum board' })).toBeInTheDocument(); // the open definition is not part of it
  });
});

describe('UnitToggle', () => {
  it('is two aria-pressed buttons: only the unpressed half changes the unit, and keys do nothing', async () => {
    const onChange = vi.fn();
    render(<UnitToggle value="count" onChange={onChange} />);
    const tasks = screen.getByRole('button', { name: 'Tasks' });
    const points = screen.getByRole('button', { name: 'Points' });
    expect(tasks).toHaveAttribute('aria-pressed', 'true');
    expect(points).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(points);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('points');
    onChange.mockClear();
    await userEvent.click(tasks);
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(tasks, { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
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
    expect(screen.queryByRole('status')).toBeNull(); // static text: nothing about it changes, so it is no live region
  });
  it('draws a static legend (no onToggle) as one swatch per item and no buttons', () => {
    const { container } = render(
      <ChartLegend items={[{ key: 'todo', label: 'To do', swatch: 'rect', colorClass: 'gt-status--todo', value: '41' }, { key: 'done', label: 'Done', swatch: 'rect', colorClass: 'gt-status--done', value: '55' }]} />,
    );
    expect(container.querySelectorAll('.gt-legend__swatch')).toHaveLength(2);
    expect(container.querySelector('.gt-legend__swatch.gt-legend__swatch--rect.gt-status--done')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('55')).toBeInTheDocument();
  });
  it('renders nothing for fewer than two items', () => {
    const { container, rerender } = render(<ChartLegend items={[{ key: 'cur', label: 'This range', swatch: 'line', colorClass: 'gt-series--1' }]} onToggle={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<ChartLegend items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ChartTooltip', () => {
  it('takes a string x and a numeric y, and keys only the rows that name a series', () => {
    render(<ChartTooltip title="Sep 7" x="40%" y={12} rows={[{ label: 'Team channels', value: '572', colorClass: 'gt-series--1' }, { label: 'Direct', value: '712' }]} />);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveClass('gt-chart-tip');
    expect(tip.style.left).toBe('40%');
    expect(tip.style.top).toBe('12px');
    expect(tip.getAttribute('style')).not.toContain('#');
    expect(tip.querySelectorAll('.gt-chart-tip__key')).toHaveLength(1);
    expect(tip.querySelector('.gt-chart-tip__key.gt-series--1')).not.toBeNull();
    expect(within(tip).getByText('Sep 7')).toBeInTheDocument();
    expect(within(tip).getByText('712')).toBeInTheDocument();
  });
});

describe('DefinitionPopover', () => {
  it('names its trigger after the card, toggles aria-expanded and closes on Escape', async () => {
    render(<DefinitionPopover title="How this is counted" body="Every task in view." cardTitle="Scrum board" />);
    const trigger = screen.getByRole('button', { name: 'How Scrum board is counted' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Every task in view.')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Every task in view.')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  describe('on a screen too narrow for the panel at its ⓘ', () => {
    // jsdom has no layout, so each case sizes the viewport, the ⓘ and the open panel (the first with what a 375 px phone measured).
    const rect = (left: number, width: number) => ({ left, right: left + width, width, top: 0, bottom: 24, height: 24, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
    const layout = (viewport: number, triggerLeft: number, panelWidth: number) => {
      vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(viewport);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('gt-definition__trigger')) return rect(triggerLeft, 24);
        if (this.classList.contains('gt-popover')) return rect(triggerLeft, panelWidth);
        return rect(0, 0);
      });
    };
    const open = async () => {
      render(<DefinitionPopover title="How this is counted" body="Every message in view." cardTitle="Conversations" />);
      await userEvent.click(screen.getByRole('button', { name: 'How Conversations is counted' }));
      return screen.getByText('Every message in view.').closest('.gt-popover') as HTMLElement;
    };
    afterEach(() => vi.restoreAllMocks());

    it('moves the panel left until its right edge is 8 px inside the viewport', async () => {
      layout(375, 153, 354);
      expect((await open()).style.left).toBe('-140px'); // its left edge lands at 375 − 8 − 354 = 13
    });
    it('never moves it past the left edge: a panel with less than 16 px to spare is centred', async () => {
      layout(360, 153, 346);
      expect((await open()).style.left).toBe('-146px'); // (360 − 346) / 2 = 7 on either side
    });
    it('leaves the panel at its ⓘ where it fits', async () => {
      layout(1400, 600, 354);
      expect((await open()).style.left).toBe('');
    });
  });
});
