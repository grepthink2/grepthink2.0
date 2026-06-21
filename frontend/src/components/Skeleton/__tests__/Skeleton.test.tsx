import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

describe('Skeleton', () => {
  it('renders a decorative, screen-reader-hidden block', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.skeleton');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('applies width and height styles', () => {
    const { container } = render(<Skeleton width="120px" height="12px" />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    expect(el.style.width).toBe('120px');
    expect(el.style.height).toBe('12px');
  });

  it('squares the box and rounds fully when circle is set', () => {
    const { container } = render(<Skeleton circle height="40px" />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    // circle uses `height` for width so the box is square.
    expect(el.style.width).toBe('40px');
    expect(el.style.borderRadius).toBe('50%');
  });

  it('merges a custom className', () => {
    const { container } = render(<Skeleton className="avatar" />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    expect(el).toHaveClass('skeleton');
    expect(el).toHaveClass('avatar');
  });

  it('omits border-radius styling by default', () => {
    const { container } = render(<Skeleton />);
    const el = container.querySelector('.skeleton') as HTMLElement;
    expect(el.style.borderRadius).toBe('');
  });
});
