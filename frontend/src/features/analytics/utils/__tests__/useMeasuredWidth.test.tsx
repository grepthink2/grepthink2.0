import { render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubResizeObserver } from '../../test/resizeObserver';
import { useMeasuredWidth } from '../useMeasuredWidth';

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  return <div ref={ref} data-testid="probe">{useMeasuredWidth(ref)}</div>;
}

describe('useMeasuredWidth', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('falls back to 600 where ResizeObserver is missing (jsdom)', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent('600');
  });
  it('reports the observed width rounded, never below the floor, and disconnects on unmount', () => {
    const { report, disconnect } = stubResizeObserver();
    const { unmount } = render(<Probe />);
    report(343.6);
    expect(screen.getByTestId('probe')).toHaveTextContent('344');
    report(120);
    expect(screen.getByTestId('probe')).toHaveTextContent('280');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
