import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { ProgressBar } from '../ProgressBar';

const fill = (container: HTMLElement) => container.querySelector<HTMLElement>('.gt-progress__fill')!;

describe('ProgressBar', () => {
  it('is a progressbar with value attributes and a name', () => {
    const { container } = render(<ProgressBar value={62} label="Points done" />);
    const bar = screen.getByRole('progressbar', { name: 'Points done' });
    expect(bar).toHaveClass('gt-progress__track');
    expect(bar).toHaveAttribute('aria-valuenow', '62');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(bar).not.toHaveAttribute('aria-valuetext');
    expect(bar).not.toHaveAttribute('aria-hidden');
    expect(fill(container)).toHaveStyle({ width: '62%' });
    expect(fill(container).parentElement).toBe(bar);
    // The label shows above the bar, with no readout unless asked.
    expect(screen.getByText('Points done')).toHaveClass('gt-progress__label');
    expect(container.querySelector('.gt-progress__pct')).toBeNull();
  });

  it('measures against max, and says the reading in valueText', () => {
    const { container } = render(<ProgressBar value={5} max={8} label="Tasks done" valueText="5 of 8 tasks" />);
    const bar = screen.getByRole('progressbar', { name: 'Tasks done' });
    expect(bar).toHaveAttribute('aria-valuenow', '5');
    expect(bar).toHaveAttribute('aria-valuemax', '8');
    expect(bar).toHaveAttribute('aria-valuetext', '5 of 8 tasks');
    expect(fill(container)).toHaveStyle({ width: '62.5%' });
  });

  it('clamps to 0–100%, and keeps the value it reports between the ends', () => {
    const { container, rerender } = render(<ProgressBar value={140} label="Over" />);
    expect(fill(container)).toHaveStyle({ width: '100%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    rerender(<ProgressBar value={-10} label="Under" />);
    expect(fill(container)).toHaveStyle({ width: '0%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    rerender(<ProgressBar value={9} max={8} label="Over" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
    // A max of 0 measures against 1, so nothing divides by zero.
    rerender(<ProgressBar value={0} max={0} label="Empty" />);
    expect(fill(container)).toHaveStyle({ width: '0%' });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('is named Progress without a label, and shows no head', () => {
    const { container } = render(<ProgressBar value={30} />);
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toBeInTheDocument();
    expect(container.querySelector('.gt-progress__head')).toBeNull();
  });

  it('shows the label and the % readout in a head the bar speaks for', () => {
    const { container } = render(<ProgressBar value={68} label="Sprint 3" showLabel valueText="17 of 25 points" />);
    const head = container.querySelector('.gt-progress__head')!;
    expect(head).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Sprint 3')).toHaveClass('gt-progress__label');
    expect(screen.getByText('68%')).toHaveClass('gt-progress__pct');
    expect(head.nextElementSibling).toBe(screen.getByRole('progressbar', { name: 'Sprint 3' }));
  });

  it('shows the readout alone, rounded, with showLabel and no label', () => {
    const { container } = render(<ProgressBar value={2} max={3} showLabel />);
    expect(screen.getByText('67%')).toHaveClass('gt-progress__pct');
    expect(container.querySelector('.gt-progress__label')).toBeNull();
  });

  it('is a meter for a measurement', () => {
    render(<ProgressBar value={25} label="Contribution" meter showLabel tone="blue" />);
    const meter = screen.getByRole('meter', { name: 'Contribution' });
    expect(meter).toHaveAttribute('aria-valuenow', '25');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('a decorative meter is hidden', () => {
    const { container } = render(<ProgressBar inline decorative value={5} max={8} label="Tasks" />);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar', { hidden: true })).not.toBeInTheDocument();
    const track = container.querySelector('.gt-progress__track')!;
    expect(track).toHaveAttribute('aria-hidden', 'true');
    for (const attribute of ['role', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'aria-label']) {
      expect(track).not.toHaveAttribute(attribute);
    }
    expect(fill(container)).toHaveStyle({ width: '62.5%' });
    // A decorative full bar hides its head too, as always.
    const { container: full } = render(<ProgressBar decorative value={5} label="Sprint 3" showLabel />);
    expect(full.querySelector('.gt-progress__head')).toHaveAttribute('aria-hidden', 'true');
    expect(full.querySelector('.gt-progress__track')).toHaveAttribute('aria-hidden', 'true');
  });

  it('the inline bar is 4px, with no head and no size', () => {
    const { container } = render(<ProgressBar inline value={50} label="Sprint" showLabel size="lg" />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('gt-progress', 'gt-progress--inline');
    expect(root).not.toHaveClass('gt-progress--lg');
    expect(container.querySelector('.gt-progress__head')).toBeNull();
    // Not decorative, it is still a named progressbar.
    expect(screen.getByRole('progressbar', { name: 'Sprint' })).toBeInTheDocument();
    const [inline] = cssRules('.gt-progress--inline .gt-progress__track');
    expect(inline.getPropertyValue('height')).toBe('4px');
    expect(inline.getPropertyValue('background-color')).toBe('var(--gt-gray-200)');
    expect(cssRules('.gt-progress--inline')[0].getPropertyValue('min-width')).toBe('40px');
  });

  it('takes its size and tone', () => {
    const { container, rerender } = render(<ProgressBar value={10} />);
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('gt-progress--md');
    expect(fill(container)).toHaveClass('gt-progress__fill--primary');
    for (const size of ['sm', 'lg'] as const) {
      rerender(<ProgressBar value={10} size={size} />);
      expect(root).toHaveClass(`gt-progress--${size}`);
    }
    for (const tone of ['blue', 'warning', 'error'] as const) {
      rerender(<ProgressBar value={10} tone={tone} />);
      expect(fill(container)).toHaveClass(`gt-progress__fill--${tone}`);
    }
    expect(cssRules('.gt-progress--sm .gt-progress__track')[0].getPropertyValue('height')).toBe('4px');
    expect(cssRules('.gt-progress--md .gt-progress__track')[0].getPropertyValue('height')).toBe('8px');
    expect(cssRules('.gt-progress--lg .gt-progress__track')[0].getPropertyValue('height')).toBe('12px');
    expect(cssRules('.gt-progress__fill--warning')[0].getPropertyValue('background-color')).toBe('var(--gt-warning)');
    expect(cssRules('.gt-progress__fill')[0].getPropertyValue('transition')).toBe('width var(--gt-transition-medium)');
    expect(cssRules('.gt-progress__fill', 'prefers-reduced-motion')[0].getPropertyValue('transition')).toBe('none');
  });

  it('passes className, native props and ref to its root, and keeps the bar’s role and values to itself', () => {
    const ref = createRef<HTMLDivElement>();
    const { container } = render(<ProgressBar value={10} className="x" data-key="p" ref={ref} />);
    expect(ref.current).toBe(container.firstChild);
    expect(ref.current).toHaveClass('gt-progress', 'x');
    expect(ref.current).toHaveAttribute('data-key', 'p');

    // @ts-expect-error: meter and decorative decide the role
    const roled = <ProgressBar value={1} role="img" />;
    // @ts-expect-error: value decides aria-valuenow
    const now = <ProgressBar value={1} aria-valuenow={5} />;
    // @ts-expect-error: label names the bar
    const named = <ProgressBar value={1} aria-label="Other" />;
    // @ts-expect-error: decorative hides the bar
    const hidden = <ProgressBar value={1} aria-hidden />;
    expect([roled, now, named, hidden]).toHaveLength(4);
  });
});
