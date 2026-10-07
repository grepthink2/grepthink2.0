import { render, screen } from '@testing-library/react';
import { MessageSquare } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { StatTile } from '../StatTile';

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
  it('colours the delta only when the figure shown moved: "0%" and "—" are flat', () => {
    const { rerender } = render(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: 0.004, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Late" value={5} icon={MessageSquare} delta={{ value: -0.004, vsLabel: 'vs', goodWhenUp: false }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: 0, vsLabel: 'vs', goodWhenUp: true }} />);
    expect(screen.getByText('0%').closest('.metric-card__delta')).toHaveClass('metric-card__delta--flat');
    rerender(<StatTile label="Messages" value={5} icon={MessageSquare} delta={{ value: null, vsLabel: 'vs', goodWhenUp: true }} />);
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
  it('names the sparkline by its weeks and draws a rising trend rising, the dot on its last point', () => {
    const { container } = render(<StatTile label="Messages" value={8} icon={MessageSquare} trend={[0, 4, 8]} />);
    expect(screen.getByRole('img', { name: 'Last 3 weeks' })).toBeInTheDocument();
    const points = container.querySelector('.metric-card__spark polyline')!.getAttribute('points')!.split(' ');
    const ys = points.map((p) => Number(p.split(',')[1]));
    expect(ys[0]).toBeGreaterThan(ys[1]); // SVG y grows downwards, so a higher value sits higher
    expect(ys[1]).toBeGreaterThan(ys[2]);
    const dot = container.querySelector('.metric-card__spark circle')!;
    expect(`${dot.getAttribute('cx')},${dot.getAttribute('cy')}`).toBe(points[2]);
  });
});
