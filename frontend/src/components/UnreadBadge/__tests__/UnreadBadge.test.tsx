import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { UnreadBadge } from '../UnreadBadge';

describe('UnreadBadge', () => {
  it('renders nothing at zero', () => {
    const { container, rerender } = render(<UnreadBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<UnreadBadge count={-2} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<UnreadBadge count={Number.NaN} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows 99+ over max and reads "120 unread"', () => {
    const { container } = render(<UnreadBadge count={120} />);
    expect(container.firstChild).toHaveClass('gt-unread');
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('120 unread')).toHaveClass('gt-visually-hidden');
  });

  it('reads as "n unread" inside a link, or as its own label', () => {
    const { rerender } = render(<a href="/app/messages">Messages <UnreadBadge count={3} /></a>);
    expect(screen.getByRole('link')).toHaveAccessibleName('Messages 3 unread');
    rerender(<a href="/app/messages">Messages <UnreadBadge count={12} max={9} label="12 new messages" /></a>);
    expect(screen.getByRole('link')).toHaveAccessibleName('Messages 12 new messages');
    expect(screen.getByText('9+')).toHaveAttribute('aria-hidden', 'true');
  });

  it('dot shows no number and keeps the label', () => {
    const { container } = render(<UnreadBadge count={5} dot />);
    expect(container.firstChild).toHaveClass('gt-unread', 'gt-unread--dot');
    expect(container.firstChild).toHaveTextContent(/^5 unread$/);
    expect(screen.queryByText('5')).not.toBeInTheDocument();
  });

  it('passes className, native props and ref to its span', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<UnreadBadge count={2} className="x" data-key="u" ref={ref} />);
    expect(ref.current).toBe(container.firstChild);
    expect(ref.current).toHaveClass('gt-unread', 'x');
    expect(ref.current).toHaveAttribute('data-key', 'u');
  });

  it('is solid error red with white bold text, from the shared count block', () => {
    render(<UnreadBadge count={1} />);
    const [box] = cssRules('.gt-unread');
    expect(box.getPropertyValue('height')).toBe('18px');
    const [, , look] = cssRules('.gt-unread');
    expect(look.getPropertyValue('background')).toBe('var(--gt-error)');
    expect(look.getPropertyValue('color')).toBe('var(--gt-text-inverse)');
    expect(look.getPropertyValue('font-weight')).toBe('var(--gt-weight-bold)');
    expect(look.getPropertyValue('padding')).toBe('0px 6px');
    const [dot] = cssRules('.gt-unread--dot');
    expect(dot.getPropertyValue('width')).toBe('8px');
    expect(dot.getPropertyValue('height')).toBe('8px');
  });
});
