import { act } from '@testing-library/react';
import { vi } from 'vitest';

/**
 * Installs a ResizeObserver (jsdom has none, so charts keep their fallback widths). `report(width)` tells every observer
 * that is still connected that its element is `width` pixels wide; `disconnect` counts disconnections. Undo it with
 * `vi.unstubAllGlobals()`.
 */
export function stubResizeObserver() {
  const live = new Set<ResizeObserverCallback>();
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
      live.add(callback);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      disconnect();
      live.delete(this.callback);
    }
  });
  const report = (width: number) => act(() => {
    live.forEach((callback) => callback([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver));
  });
  return { report, disconnect };
}
