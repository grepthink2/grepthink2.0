import { createRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { cssRules } from '@/test/cssRules';
import { NewDot } from '../NewDot';

describe('NewDot', () => {
  it('is a decorative blue dot, hidden from assistive tech', () => {
    const { container } = render(<NewDot />);
    const dot = container.firstElementChild;
    expect(dot).toHaveClass('gt-new-dot');
    expect(dot).not.toHaveClass('gt-new-dot--ring');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot).toBeEmptyDOMElement();
    const [rule] = cssRules('.gt-new-dot');
    expect(rule.getPropertyValue('background')).toBe('var(--gt-new-dot)');
    expect(rule.getPropertyValue('width')).toBe('8px');
  });

  it('draws a ring in the surface behind it with `ring`', () => {
    const { container } = render(<NewDot ring />);
    expect(container.firstElementChild).toHaveClass('gt-new-dot', 'gt-new-dot--ring');
    expect(cssRules('.gt-new-dot--ring')[0].getPropertyValue('box-shadow')).toBe(
      '0 0 0 2px var(--gt-new-dot-ring, var(--gt-surface))',
    );
  });

  it('passes its class, native props and ref to the span', () => {
    const ref = createRef<HTMLSpanElement>();
    const { container } = render(<NewDot ref={ref} className="host__dot" data-testid="dot" />);
    const dot = container.firstElementChild;
    expect(dot).toHaveClass('gt-new-dot', 'host__dot');
    expect(dot).toHaveAttribute('data-testid', 'dot');
    expect(ref.current).toBe(dot);
  });
});
