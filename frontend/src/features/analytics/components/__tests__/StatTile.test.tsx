import { render, screen, within } from '@testing-library/react';
import { MessageSquare } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatTile } from '../StatTile';

/** Every coordinate the sparkline draws (the line's vertices, then the dot), as numbers. */
function sparkNumbers(container: HTMLElement): number[] {
  const svg = container.querySelector('.metric-card__spark')!;
  const line = svg.querySelector('polyline')!.getAttribute('points')!.split(/[ ,]/);
  const dot = ['cx', 'cy'].map((a) => svg.querySelector('circle')!.getAttribute(a)!);
  return [...line, ...dot].map(Number);
}

/** The last point's marker, ring included (r + 1: half its 2 px stroke), lies inside the viewBox. */
function expectRingInside(container: HTMLElement) {
  const svg = container.querySelector('.metric-card__spark')!;
  const [minX, minY, width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const [cx, cy, r] = ['cx', 'cy', 'r'].map((a) => Number(svg.querySelector('circle')!.getAttribute(a)));
  expect(cx - (r + 1)).toBeGreaterThanOrEqual(minX);
  expect(cx + (r + 1)).toBeLessThanOrEqual(minX + width);
  expect(cy - (r + 1)).toBeGreaterThanOrEqual(minY);
  expect(cy + (r + 1)).toBeLessThanOrEqual(minY + height);
}

describe('StatTile', () => {
  it('formats the value, colours the delta by direction × goodWhenUp, and draws a sparkline', () => {
    const { container } = render(
      <StatTile label="Messages" value={1284} icon={MessageSquare} delta={{ value: 0.18, vsLabel: 'vs previous 30 days', goodWhenUp: true }} trend={[1, 2, 3, 5, 8]} />,
    );
    expect(screen.getByText('1,284')).toBeInTheDocument();
    const delta = screen.getByText('+18%');
    expect(delta.closest('.metric-card__delta')).toHaveClass('metric-card__delta--good');
    expect(screen.getByText('vs previous 30 days')).toBeInTheDocument();
    expect(container.querySelectorAll('.metric-card__spark polyline')).toHaveLength(1);
    expect(container.querySelectorAll('.metric-card__spark circle')).toHaveLength(1); // the last point only
  });
  it('a drop in something good is bad, a drop in something bad is good', () => {
    const { rerender } = render(<StatTile label="Late" value={5} icon={MessageSquare} delta={{ value: -0.2, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(screen.getByText('−20%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--good');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: -0.2, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('−20%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--bad');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: null, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
  it('renders — with the hint when the value is unknown', () => {
    render(<StatTile label="Active users" value={null} icon={MessageSquare} hint="Appears once sign-ins are recorded" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Appears once sign-ins are recorded')).toBeInTheDocument();
  });
  it('a rise in something bad is bad', () => {
    render(<StatTile label="Late" value={5} icon={MessageSquare} delta={{ value: 0.2, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(screen.getByText('+20%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--bad');
  });
  it('colours the delta only when the figure shown moved: "0%" and "—" are flat', () => {
    const { rerender } = render(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: 0.004, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Late" value={5} icon={MessageSquare} delta={{ value: -0.004, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: 0, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: null, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('—').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: NaN, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('—').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: 0.006, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('+1%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--good');
  });
  it('draws neither a delta nor a sparkline without them, and no sparkline for fewer than two points', () => {
    const { container, rerender } = render(<StatTile label="Classes" value={12} icon={MessageSquare} />);
    expect(container.querySelector('.metric-card__delta')).toBeNull();
    expect(container.querySelector('.metric-card__spark')).toBeNull();
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} trend={[5]} />);
    expect(container.querySelector('.metric-card__spark')).toBeNull();
  });
  it('renders the slots inside a clickable tile, and neither while loading', () => {
    const delta = { value: 0.18, vsLabel: 'vs previous 30 days', goodWhenUp: true };
    const { container, rerender } = render(<StatTile label="Messages" value={1284} icon={MessageSquare} delta={delta} trend={[1, 2, 3]} onClick={() => {}} />);
    const button = screen.getByRole('button');
    expect(within(button).getByText('+18%').closest('.metric-card__delta')?.tagName).toBe('SPAN'); // a button holds phrasing content only
    expect(button.querySelector('.metric-card__spark')).not.toBeNull();
    rerender(<StatTile label="Messages" value={1284} icon={MessageSquare} delta={delta} trend={[1, 2, 3]} onClick={() => {}} loading />);
    expect(container.querySelector('.metric-card__delta')).toBeNull();
    expect(container.querySelector('.metric-card__spark')).toBeNull();
  });
  it('draws a decorative sparkline: a rising trend rises, the dot sits on the last point, its ring inside the box', () => {
    const { container, rerender } = render(<StatTile label="Messages" value={8} icon={MessageSquare} trend={[0, 4, 8]} />);
    const svg = container.querySelector('.metric-card__spark')!;
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).not.toHaveAttribute('role');
    expect(screen.queryByRole('img')).toBeNull();
    const points = svg.querySelector('polyline')!.getAttribute('points')!.split(' ');
    const ys = points.map((p) => Number(p.split(',')[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]); // SVG y grows downwards, so a higher value sits higher
    expect(ys[1]).toBeGreaterThan(ys[2]);
    const dot = svg.querySelector('circle')!;
    expect(`${dot.getAttribute('cx')},${dot.getAttribute('cy')}`).toBe(points[2]);
    expectRingInside(container); // the last point is the top-right extreme
    rerender(<StatTile label="Messages" value={0} icon={MessageSquare} trend={[8, 0]} />);
    expectRingInside(container); // the bottom-right extreme
  });
  it('draws finite path data for all-equal and all-zero trends', () => {
    const { container, rerender } = render(<StatTile label="Messages" value={5} icon={MessageSquare} trend={[5, 5, 5]} />);
    expect(sparkNumbers(container)).toHaveLength(8);
    expect(sparkNumbers(container).filter((n) => !Number.isFinite(n))).toEqual([]);
    rerender(<StatTile label="Messages" value={0} icon={MessageSquare} trend={[0, 0]} />);
    expect(sparkNumbers(container)).toHaveLength(6);
    expect(sparkNumbers(container).filter((n) => !Number.isFinite(n))).toEqual([]);
  });
});
