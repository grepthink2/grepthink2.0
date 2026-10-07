import { useEffect, useState, type RefObject } from 'react';

/** The element's content width in CSS pixels, rounded and never below `floor`, so an SVG can draw one user unit per pixel; `fallback` until the first report and wherever ResizeObserver is missing (jsdom). */
export function useMeasuredWidth(ref: RefObject<HTMLElement | null>, fallback = 600, floor = 280): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(floor, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, floor]);
  return width;
}
