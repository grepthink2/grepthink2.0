import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { CountBadge } from '../CountBadge';

describe('CountBadge', () => {
  it('renders the count, and 0 unless showZero is false', () => {
    const { container, rerender } = render(<CountBadge count={12} />);
    expect(screen.getByText('12')).toHaveClass('gt-count');
    rerender(<CountBadge count={0} />);
    expect(screen.getByText('0')).toHaveClass('gt-count');
    rerender(<CountBadge count={0} showZero={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('caps the number at max as "99+"', () => {
    const { rerender } = render(<CountBadge count={120} />);
    expect(screen.getByText('99+')).toHaveClass('gt-count');
    rerender(<CountBadge count={12} max={9} />);
    expect(screen.getByText('9+')).toBeInTheDocument();
    rerender(<CountBadge count={99} />);
    expect(screen.getByText('99')).toBeInTheDocument();
  });

  it('reads as its number inside a control, or as its label with the number hidden', () => {
    const { rerender } = render(<button type="button">Requests <CountBadge count={3} /></button>);
    expect(screen.getByRole('button')).toHaveAccessibleName('Requests 3');
    rerender(<button type="button">Requests <CountBadge count={3} label="3 pending requests" /></button>);
    expect(screen.getByRole('button')).toHaveAccessibleName('Requests 3 pending requests');
    expect(screen.getByText('3')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('3 pending requests')).toHaveClass('gt-visually-hidden');
  });

  it('passes className, native props and ref to its span', () => {
    const ref = createRef<HTMLSpanElement>();
    render(<CountBadge count={4} className="x" data-key="c" title="Four teams" ref={ref} />);
    const badge = screen.getByText('4');
    expect(ref.current).toBe(badge);
    expect(badge).toHaveClass('gt-count', 'x');
    expect(badge).toHaveAttribute('data-key', 'c');
    expect(badge).toHaveAttribute('title', 'Four teams');
  });

  it('is the neutral 18px pill, and resets the tracking and style of the tab it sits in', () => {
    render(<CountBadge count={1} />);
    const [box, reset] = cssRules('.gt-count');
    expect(box.getPropertyValue('height')).toBe('18px');
    expect(box.getPropertyValue('min-width')).toBe('18px');
    expect(box.getPropertyValue('box-sizing')).toBe('border-box');
    expect(box.getPropertyValue('font-variant-numeric')).toBe('tabular-nums');
    expect(reset.getPropertyValue('letter-spacing')).toBe('normal');
    expect(reset.getPropertyValue('font-style')).toBe('normal');
    const [look] = cssRules('.gt-count').slice(2);
    expect(look.getPropertyValue('background')).toBe('var(--gt-gray-100)');
    expect(look.getPropertyValue('color')).toBe('var(--gt-text-secondary)');
  });
});
