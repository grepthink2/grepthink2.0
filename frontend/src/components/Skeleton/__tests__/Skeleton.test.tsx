import { render } from '@testing-library/react';
import { Skeleton } from '../Skeleton';

const skeleton = (ui: React.ReactElement) =>
  render(ui).container.querySelector('.skeleton') as HTMLElement;

describe('Skeleton', () => {
  it('is a decorative block, hidden from screen readers, that keeps a caller\'s class', () => {
    const el = skeleton(<Skeleton className="avatar" />);

    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toHaveClass('skeleton', 'avatar');
  });

  it('takes the size it is given, and is a square with round corners only when circle is set', () => {
    const bar = skeleton(<Skeleton width="120px" height="12px" />);
    expect([bar.style.width, bar.style.height, bar.style.borderRadius]).toEqual(['120px', '12px', '']);

    // circle uses `height` for the width too, so the box is square.
    const avatar = skeleton(<Skeleton circle height="40px" />);
    expect([avatar.style.width, avatar.style.borderRadius]).toEqual(['40px', '50%']);
  });
});
