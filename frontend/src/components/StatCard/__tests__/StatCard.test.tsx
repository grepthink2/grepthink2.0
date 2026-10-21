import { createRef } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageSquare, Users } from 'lucide-react';
import { cssRules } from '@/test/cssRules';
import { StatCard } from '../StatCard';

const icon = <MessageSquare size={16} aria-hidden="true" />;
const card = (container: HTMLElement) => container.firstChild as HTMLElement;
const delta = (text: string) => screen.getByText(text).closest('.gt-stat-card__delta');

/** The sparkline's vertices ("M x,y L x,y …") as [x, y] pairs, then its dot. */
function spark(container: HTMLElement) {
  const svg = container.querySelector('.gt-stat-card__spark')!;
  const points = svg.querySelector('path')!.getAttribute('d')!.split(' ')
    .map((step) => step.slice(1).split(',').map(Number) as [number, number]);
  const dot = svg.querySelector('circle')!;
  return { svg, points, dot: [Number(dot.getAttribute('cx')), Number(dot.getAttribute('cy'))] as [number, number] };
}

describe('StatCard', () => {
  it('is a metric card: uppercase label, the value, the tinted icon chip and the hint', () => {
    const { container, rerender } = render(<StatCard label="Registered Students" value={62} icon={icon} hint="58 enrolled" />);
    expect(card(container)).toHaveClass('gt-stat-card', 'gt-stat-card--primary');
    expect(card(container)).not.toHaveClass('gt-stat-card--compact');
    expect(screen.getByText('Registered Students')).toHaveClass('gt-stat-card__label');
    expect(screen.getByText('62')).toHaveClass('gt-stat-card__value');
    expect(screen.getByText('58 enrolled')).toHaveClass('gt-stat-card__hint');
    const chip = container.querySelector('.gt-stat-card__icon')!;
    expect(chip).toHaveAttribute('aria-hidden', 'true');
    expect(chip.querySelector('svg')).not.toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    for (const accent of ['blue', 'purple', 'amber'] as const) {
      rerender(<StatCard label="Teams" value={8} accent={accent} />);
      expect(card(container)).toHaveClass(`gt-stat-card--${accent}`);
    }
    // No icon, no chip; no hint, delta or trend, no bottom row.
    expect(container.querySelector('.gt-stat-card__icon')).toBeNull();
    expect(container.querySelector('.gt-stat-card__bottom')).toBeNull();
    rerender(<StatCard label="Teams" value={8} compact />);
    expect(card(container)).toHaveClass('gt-stat-card--compact');
  });

  it('formats the value: raw as given, compact, percent; a string passes through', () => {
    const { rerender } = render(<StatCard label="Messages" value={1284} />);
    expect(screen.getByText('1284')).toBeInTheDocument();
    rerender(<StatCard label="Messages" value={12900} format="compact" />);
    expect(screen.getByText('12.9K')).toBeInTheDocument();
    rerender(<StatCard label="Messages" value={1284} format="compact" />);
    expect(screen.getByText('1,284')).toBeInTheDocument();
    rerender(<StatCard label="On time" value={0.82} format="percent" />);
    expect(screen.getByText('82%')).toBeInTheDocument();
    rerender(<StatCard label="TSRs submitted" value="24/31" format="percent" />);
    expect(screen.getByText('24/31')).toBeInTheDocument();
  });

  it('renders — with the hint when the value is unknown', () => {
    const { rerender } = render(<StatCard label="Signed in (7d)" value={null} hint="Appears once sign-ins are recorded" />);
    expect(screen.getByText('—')).toHaveClass('gt-stat-card__value', 'gt-stat-card__null');
    expect(screen.getByText('Appears once sign-ins are recorded')).toBeInTheDocument();
    rerender(<StatCard label="Signed in (7d)" value={undefined} />);
    expect(screen.getByText('—')).toHaveClass('gt-stat-card__null');
    rerender(<StatCard label="Signed in (7d)" value={NaN} format="compact" />);
    expect(screen.getByText('—')).toHaveClass('gt-stat-card__null');
    rerender(<StatCard label="Signed in (7d)" value={0} />);
    expect(screen.getByText('0')).not.toHaveClass('gt-stat-card__null');
  });

  it('failed renders — with Could not load, and no delta or trend', () => {
    const { container, rerender } = render(
      <StatCard label="Teams" value={8} failed delta={{ value: 0.2 }} trend={[1, 2, 3]} />,
    );
    expect(screen.getByText('—')).toHaveClass('gt-stat-card__null');
    expect(screen.queryByText('8')).not.toBeInTheDocument();
    expect(screen.getByText('Could not load')).toHaveClass('gt-stat-card__hint');
    expect(container.querySelector('.gt-stat-card__delta')).toBeNull();
    expect(container.querySelector('.gt-stat-card__spark')).toBeNull();
    // A hint of the caller's says why instead.
    rerender(<StatCard label="Teams" value={8} failed hint="The roster did not load" />);
    expect(screen.getByText('The roster did not load')).toBeInTheDocument();
    expect(screen.queryByText('Could not load')).not.toBeInTheDocument();
  });

  it('formats the delta, colours it by direction × goodWhenUp, and draws a sparkline', () => {
    const { container } = render(
      <StatCard compact format="compact" label="Messages" value={1284} icon={icon} delta={{ value: 0.18, vsLabel: 'vs previous 30 days' }} trend={[1, 2, 3, 5, 8]} />,
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    expect(delta('+18%')).toHaveClass('gt-stat-card__delta--good');
    expect(screen.getByText('+18%')).toHaveClass('gt-stat-card__delta-value');
    expect(screen.getByText('vs previous 30 days')).toHaveClass('gt-stat-card__delta-vs');
    // The figure and its comparison read apart.
    expect(delta('+18%')).toHaveTextContent('+18% vs previous 30 days');
    expect(delta('+18%')!.querySelector('svg')).toHaveClass('lucide-trending-up');
    expect(delta('+18%')!.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('.gt-stat-card__spark path')).toHaveLength(1);
    expect(container.querySelectorAll('.gt-stat-card__spark circle')).toHaveLength(1); // the last point only
    // Meta and sparkline share the bottom row.
    const bottom = container.querySelector('.gt-stat-card__bottom')!;
    expect(bottom.firstElementChild).toHaveClass('gt-stat-card__meta');
    expect(bottom.lastElementChild).toHaveClass('gt-stat-card__spark');
  });

  it('a drop in something good is bad, a drop in something bad is good, a rise in something bad is bad', () => {
    const { rerender } = render(<StatCard label="Late" value={5} delta={{ value: -0.2, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(delta('−20%')).toHaveClass('gt-stat-card__delta--good');
    expect(delta('−20%')!.querySelector('svg')).toHaveClass('lucide-trending-down');
    rerender(<StatCard label="Messages" value={5} delta={{ value: -0.2, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(delta('−20%')).toHaveClass('gt-stat-card__delta--bad');
    rerender(<StatCard label="Late" value={5} delta={{ value: 0.2, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(delta('+20%')).toHaveClass('gt-stat-card__delta--bad');
    // goodWhenUp defaults to true.
    rerender(<StatCard label="Messages" value={5} delta={{ value: 0.2 }} />);
    expect(delta('+20%')).toHaveClass('gt-stat-card__delta--good');
    expect(screen.getByText('+20%').nextElementSibling).toBeNull(); // no vsLabel, no comparison
  });

  it('colours the delta only when the figure shown moved, and hides it without a baseline', () => {
    const { container, rerender } = render(<StatCard label="Messages" value={5} delta={{ value: 0.004, vsLabel: 'vs' }} />);
    expect(delta('0%')).toHaveClass('gt-stat-card__delta--flat');
    expect(delta('0%')!.querySelector('svg')).toHaveClass('lucide-minus');
    rerender(<StatCard label="Late" value={5} delta={{ value: -0.004, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(delta('0%')).toHaveClass('gt-stat-card__delta--flat');
    rerender(<StatCard label="Messages" value={5} delta={{ value: 0, vsLabel: 'vs' }} />);
    expect(delta('0%')).toHaveClass('gt-stat-card__delta--flat');
    rerender(<StatCard label="Messages" value={5} delta={{ value: 0.006, vsLabel: 'vs' }} />);
    expect(delta('+1%')).toHaveClass('gt-stat-card__delta--good');
    // No baseline (null, NaN, or left out by untyped code): no delta at all.
    for (const value of [null, NaN, undefined as unknown as null]) {
      rerender(<StatCard label="Messages" value={5} delta={{ value, vsLabel: 'no previous range' }} />);
      expect(container.querySelector('.gt-stat-card__delta')).toBeNull();
      expect(screen.queryByText('no previous range')).not.toBeInTheDocument();
    }
  });

  it('draws neither a delta nor a sparkline without them, and no sparkline for fewer than two points', () => {
    const { container, rerender } = render(<StatCard label="Classes" value={12} />);
    expect(container.querySelector('.gt-stat-card__delta')).toBeNull();
    expect(container.querySelector('.gt-stat-card__spark')).toBeNull();
    rerender(<StatCard label="Messages" value={5} trend={[5]} />);
    expect(container.querySelector('.gt-stat-card__spark')).toBeNull();
    rerender(<StatCard label="Messages" value={5} trend={[]} />);
    expect(container.querySelector('.gt-stat-card__spark')).toBeNull();
  });

  it('draws a decorative sparkline: a rising trend rises, the dot sits on the last point, its ring never clipped', () => {
    const { container } = render(<StatCard label="Messages" value={8} trend={[0, 4, 8]} />);
    const { svg, points, dot } = spark(container);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(screen.queryByRole('img')).toBeNull();
    expect(svg).toHaveAttribute('viewBox', '0 0 84 24');
    const ys = points.map(([, y]) => y);
    expect(ys[0]).toBeGreaterThan(ys[1]); // SVG y grows downwards, so a higher value sits higher
    expect(ys[1]).toBeGreaterThan(ys[2]);
    expect(dot[0]).toBeCloseTo(points[2][0], 1);
    expect(dot[1]).toBeCloseTo(points[2][1], 1);
    // The top-right extreme is 3px from the edges and the ring reaches 4.5: the box lets it show.
    expect(cssRules('.gt-stat-card__spark').map((s) => s.getPropertyValue('overflow'))).toContain('visible');
  });

  it('draws finite path data for all-equal and all-zero trends', () => {
    const { container, rerender } = render(<StatCard label="Messages" value={5} trend={[5, 5, 5]} />);
    const finite = () => {
      const { points, dot } = spark(container);
      return [...points.flat(), ...dot].every(Number.isFinite);
    };
    expect(spark(container).points).toHaveLength(3);
    expect(finite()).toBe(true);
    rerender(<StatCard label="Messages" value={0} trend={[0, 0]} />);
    expect(spark(container).points).toHaveLength(2);
    expect(finite()).toBe(true);
  });

  it('loading shows a skeleton, marks the card busy, and draws no delta or trend', () => {
    const { container, rerender } = render(
      <StatCard label="Students" value={62} loading delta={{ value: 0.1 }} trend={[1, 2]} hint="On record" />,
    );
    expect(card(container)).toHaveAttribute('aria-busy', 'true');
    const value = container.querySelector('.gt-stat-card__value')!;
    expect(value.querySelector('.gt-skeleton')).toHaveAttribute('aria-hidden', 'true');
    expect(value).not.toHaveTextContent('62');
    expect(value).not.toHaveClass('gt-stat-card__null');
    expect(container.querySelector('.gt-stat-card__delta')).toBeNull();
    expect(container.querySelector('.gt-stat-card__spark')).toBeNull();
    expect(screen.getByText('On record')).toBeInTheDocument();
    rerender(<StatCard label="Students" value={null} loading />);
    expect(container.querySelector('.gt-stat-card__value')).not.toHaveClass('gt-stat-card__null');
    rerender(<StatCard label="Students" value={62} />);
    expect(card(container)).not.toHaveAttribute('aria-busy');
  });

  it('a clickable card is one stretched button named by its label and value, described by its meta', async () => {
    const onClick = vi.fn();
    const { container, rerender } = render(
      <StatCard label="Not On Roster" value={3} hint="Registered but unmatched" delta={{ value: 0.5, vsLabel: 'vs last week' }} onClick={onClick} />,
    );
    expect(card(container)).toHaveClass('gt-stat-card--clickable');
    const button = screen.getByRole('button', { name: 'Not On Roster: 3' });
    expect(button).toHaveClass('gt-stat-card__hit');
    expect(button).toHaveAttribute('type', 'button');
    expect(button).toBeEmptyDOMElement();
    expect(button).toHaveAccessibleDescription('+50% vs last week Registered but unmatched');
    // The delta and the hint read apart in the text too, not only where the browser adds a space.
    expect(container.querySelector('.gt-stat-card__meta')).toHaveTextContent('+50% vs last week Registered but unmatched');
    await userEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith();

    rerender(<StatCard label="Not On Roster" value={3} format="percent" onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Not On Roster: 300%' })).not.toHaveAttribute('aria-describedby');
    rerender(<StatCard label="Not On Roster" value={null} onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Not On Roster: —' })).toBeInTheDocument();
    // While loading the figure is not known yet: the button says what it opens.
    rerender(<StatCard label="Not On Roster" value={0} loading onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Not On Roster' })).toBeInTheDocument();
  });

  it('info opens with the keyboard', async () => {
    const user = userEvent.setup();
    render(
      <StatCard
        label="Registered Students"
        value={62}
        icon={<Users size={16} aria-hidden="true" />}
        info={{ body: 'Students registered in GrepThink', learnMoreHref: '/help/roster' }}
        onClick={() => {}}
      />,
    );
    // The stretched button first, then the ⓘ, its own tab stop above it.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Registered Students: 62' })).toHaveFocus();
    await user.tab();
    const trigger = screen.getByRole('button', { name: 'About registered students' });
    expect(trigger).toHaveFocus();
    expect(trigger.closest('.gt-stat-card__label-row')).not.toBeNull();
    await user.keyboard('{Enter}');
    const panel = screen.getByRole('dialog', { name: 'Registered Students' });
    expect(within(panel).getByText('Students registered in GrepThink')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Learn more' })).toHaveAttribute('href', '/help/roster');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('info takes its own title when given', async () => {
    render(<StatCard label="Messages" value={5} info={{ title: 'How Messages is counted', body: 'Team channels.' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'About messages' }));
    expect(screen.getByRole('dialog', { name: 'How Messages is counted' })).toBeInTheDocument();
  });

  it('passes className, native props and ref to its root, and keeps aria-busy to itself', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<StatCard label="Teams" value={8} className="x" data-key="s" ref={ref} />);
    expect(ref.current).toBe(card(container));
    expect(ref.current).toHaveClass('gt-stat-card', 'x');
    expect(ref.current).toHaveAttribute('data-key', 's');
    // @ts-expect-error: loading decides aria-busy
    const busy = <StatCard label="Teams" value={8} aria-busy />;
    expect(busy).toBeTruthy();
  });

  it('ports the stat card block, and sets what the global button rule would on the stretched button', () => {
    render(<StatCard label="Teams" value={8} onClick={() => {}} />);
    const [root] = cssRules('.gt-stat-card');
    expect(root.getPropertyValue('box-sizing')).toBe('border-box');
    expect(root.getPropertyValue('border-radius')).toBe('var(--gt-radius-md)');
    expect(cssRules('.gt-stat-card__value')[0].getPropertyValue('font-size')).toBe('2rem');
    const [compact] = cssRules('.gt-stat-card--compact');
    expect(compact.getPropertyValue('padding')).toBe('14px var(--gt-space-md)');
    expect(cssRules('.gt-stat-card--compact .gt-stat-card__value')[0].getPropertyValue('font-size')).toBe('var(--gt-text-h2)');
    expect(cssRules('.gt-stat-card__label')[0].getPropertyValue('text-transform')).toBe('uppercase');
    const [skeleton] = cssRules('.gt-stat-card__value .gt-skeleton');
    expect(skeleton.getPropertyValue('width')).toBe('64px');
    expect(skeleton.getPropertyValue('height')).toBe('22px');
    expect(cssRules('.gt-stat-card__spark-line')[0].getPropertyValue('stroke')).toBe('var(--gt-chart-context)');
    const [hit] = cssRules('.gt-stat-card__hit');
    expect(hit.getPropertyValue('inset')).toBe('0px');
    expect(hit.getPropertyValue('padding')).toBe('0px');
    expect(hit.getPropertyValue('border-style')).toBe('none');
    expect(hit.getPropertyValue('border-radius')).toBe('inherit');
    expect(hit.getPropertyValue('background')).toBe('transparent');
    expect(cssRules('.gt-stat-card__hit:focus-visible')[0].getPropertyValue('box-shadow')).toBe('var(--gt-focus-ring)');
    // The ⓘ sits above the stretched button.
    const [info] = cssRules('.gt-stat-card .gt-infopop');
    expect(info.getPropertyValue('position')).toBe('relative');
    expect(info.getPropertyValue('z-index')).toBe('1');
    expect(cssRules('.gt-stat-card--blue .gt-stat-card__icon')[0].getPropertyValue('color')).toBe('var(--gt-accent)');
    expect(cssRules('.gt-stat-card--clickable', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });
});
