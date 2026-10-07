import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    let report: ResizeObserverCallback = () => {};
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class { constructor(cb: ResizeObserverCallback) { report = cb; } observe() {} unobserve() {} disconnect = disconnect; });
    const { unmount } = render(<Probe />);
    act(() => report([{ contentRect: { width: 343.6 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByTestId('probe')).toHaveTextContent('344');
    act(() => report([{ contentRect: { width: 120 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(screen.getByTestId('probe')).toHaveTextContent('280');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
