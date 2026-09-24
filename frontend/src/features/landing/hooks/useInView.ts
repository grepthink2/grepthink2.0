import { useEffect, useRef, useState } from 'react';

export interface InViewState {
  /** Latches true the first time the element enters the watched area. */
  seen: boolean;
  /** Whether the element is in the watched area right now. */
  visible: boolean;
}

/** The upper 80% of the viewport: a band counts as seen once it rises past the bottom fifth. */
const WATCHED_AREA = '0px 0px -20% 0px';

function startsSeen(): boolean {
  if (typeof globalThis.IntersectionObserver === 'undefined') return true;
  return (
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Watches one element for the landing page's scroll effects. `seen` drives the one-time reveal
 * and each band's moment; `visible` pauses the floating cards while they are off screen. With
 * reduced motion, or without IntersectionObserver, `seen` is true from the first render, so the
 * final frame shows straight away. A root margin, not a visibility ratio, decides "seen", so a
 * band taller than the viewport still triggers.
 */
export function useInView<T extends Element>() {
  const ref = useRef<T>(null);
  const [state, setState] = useState<InViewState>(() => {
    const seen = startsSeen();
    return { seen, visible: seen };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof globalThis.IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        const visible = entry.isIntersecting;
        setState((prev) => {
          const seen = prev.seen || visible;
          return seen === prev.seen && visible === prev.visible ? prev : { seen, visible };
        });
      },
      { rootMargin: WATCHED_AREA },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, state] as const;
}
