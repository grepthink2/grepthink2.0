import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { Spinner } from '../Spinner';

describe('Spinner', () => {
  it('announces a labelled spinner as a status', () => {
    render(<Spinner label="Saving" />);
    const status = screen.getByRole('status');
    // A status takes no name from its content: what a screen reader hears is the text inside it.
    expect(status).toHaveTextContent('Saving');
    expect(status).toHaveClass('gt-spinner-wrap');
    expect(status.querySelector('.gt-spinner')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Saving')).toHaveClass('gt-visually-hidden');
  });

  it('says Loading when no label is given', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
  });

  it('renders only a ring, hidden from assistive tech, when decorative', () => {
    const { container } = render(<Spinner decorative label="Saving" />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    expect(container.firstChild).toHaveClass('gt-spinner', 'gt-spinner--16');
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByText('Saving')).toBeNull();
  });

  it('applies the size class, 16 by default', () => {
    const { container, rerender } = render(<Spinner decorative />);
    expect(container.firstChild).toHaveClass('gt-spinner--16');
    rerender(<Spinner decorative size={24} />);
    expect(container.firstChild).toHaveClass('gt-spinner--24');
    rerender(<Spinner size={14} />);
    expect(container.querySelector('.gt-spinner')).toHaveClass('gt-spinner--14');
  });

  it('puts className, native props and ref on its outer element', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container, rerender } = render(<Spinner ref={ref} className="x" data-testid="s" />);
    expect(container.firstChild).toBe(ref.current);
    expect(ref.current).toHaveClass('gt-spinner-wrap', 'x');
    expect(ref.current).toHaveAttribute('data-testid', 's');

    rerender(<Spinner decorative ref={ref} className="x" />);
    expect(ref.current).toHaveClass('gt-spinner', 'x');
  });

  it('keeps turning, slower, under reduced motion', () => {
    render(<Spinner />);
    const [reduced] = cssRules('.gt-spinner', 'prefers-reduced-motion');
    expect(reduced.getPropertyValue('animation-duration')).toBe('1.6s');
    expect(reduced.getPropertyPriority('animation-duration')).toBe('important');
    expect(reduced.getPropertyValue('animation-iteration-count')).toBe('infinite');
  });
});
