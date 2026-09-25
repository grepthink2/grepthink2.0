import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useInView } from '../hooks/useInView';

type Entry = { isIntersecting: boolean };

class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly callback: (entries: Entry[]) => void;
  readonly options: IntersectionObserverInit | undefined;
  readonly observe = vi.fn();
  readonly disconnect = vi.fn();

  constructor(callback: (entries: Entry[]) => void, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    FakeObserver.instances.push(this);
  }
}

function Probe() {
  const [ref, { seen, visible }] = useInView<HTMLDivElement>();
  return <div ref={ref} data-testid="probe" data-seen={String(seen)} data-visible={String(visible)} />;
}

afterEach(() => {
  FakeObserver.instances = [];
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('latches seen on the first intersection and tracks visibility live', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<Probe />);
    const probe = screen.getByTestId('probe');
    const [observer] = FakeObserver.instances;
    expect(observer.observe).toHaveBeenCalledWith(probe);
    expect(observer.options?.rootMargin).toBe('0px 0px -20% 0px');
    expect(probe).toHaveAttribute('data-seen', 'false');

    act(() => observer.callback([{ isIntersecting: true }]));
    expect(probe).toHaveAttribute('data-seen', 'true');
    expect(probe).toHaveAttribute('data-visible', 'true');

    act(() => observer.callback([{ isIntersecting: false }]));
    expect(probe).toHaveAttribute('data-seen', 'true');
    expect(probe).toHaveAttribute('data-visible', 'false');
  });

  it('disconnects when the element unmounts', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    const { unmount } = render(<Probe />);
    unmount();
    expect(FakeObserver.instances[0].disconnect).toHaveBeenCalled();
  });

  it('starts seen when the browser has no IntersectionObserver', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-seen', 'true');
  });

  it('starts seen when the user prefers reduced motion', () => {
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    render(<Probe />);
    expect(screen.getByTestId('probe')).toHaveAttribute('data-seen', 'true');
  });
});
