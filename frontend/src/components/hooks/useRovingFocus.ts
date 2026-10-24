import { useRef, type KeyboardEvent, type KeyboardEventHandler, type RefCallback } from 'react';

export type RovingOrientation = 'horizontal' | 'vertical' | 'both';

export interface RovingOptions {
  /** How many items the group has, in DOM order. */
  count: number;
  /**
   * The selected item (the active tab, the checked option), or -1 for none. It holds the group's one
   * tab stop; when nothing is selected, or the selected item is disabled, the first enabled item does.
   */
  activeIndex: number;
  /** ← → for a tab list, ↑ ↓ for a vertical list, all four for a radio group. @default 'horizontal' */
  orientation?: RovingOrientation;
  /** Wrap from the last item to the first and back. @default true */
  loop?: boolean;
  /** Items the keys pass over: disabled options. */
  isDisabled?: (index: number) => boolean;
  /**
   * Called with the item a key moved to, once it has focus. A radio group or automatic tabs select it
   * here; manual tabs leave the selection, and the tab stop, where they are.
   */
  onMove?: (index: number) => void;
}

/** What each item spreads onto its element. */
export interface RovingItemProps {
  tabIndex: 0 | -1;
  ref: RefCallback<HTMLElement>;
  onKeyDown: KeyboardEventHandler<HTMLElement>;
}

const FORWARD: Record<RovingOrientation, string[]> = {
  horizontal: ['ArrowRight'],
  vertical: ['ArrowDown'],
  both: ['ArrowRight', 'ArrowDown'],
};
const BACKWARD: Record<RovingOrientation, string[]> = {
  horizontal: ['ArrowLeft'],
  vertical: ['ArrowUp'],
  both: ['ArrowLeft', 'ArrowUp'],
};

const neverDisabled = () => false;

/**
 * The roving tabindex of the WAI-ARIA composite widgets: one tab stop for the whole group, and the
 * arrow keys, Home and End to move between its enabled items. Tabs, a radio group of FilterChips and
 * a SegmentedControl share it.
 *
 * Only the selected item (else the first enabled one) is in the tab order. An arrow moves to the
 * next or previous enabled item, wrapping unless `loop` is false; Home and End go to the first and
 * last enabled items. The hook focuses that item, then calls `onMove`. A handled key never scrolls
 * the page, and an arrow held with Alt, Ctrl, Meta or Shift stays the browser's (Alt+← is Back).
 */
export function useRovingFocus({
  count, activeIndex, orientation = 'horizontal', loop = true, isDisabled = neverDisabled, onMove,
}: RovingOptions): { getItemProps: (index: number) => RovingItemProps } {
  const items = useRef<(HTMLElement | null)[]>([]);
  const enabled = (i: number) => i >= 0 && i < count && !isDisabled(i);
  const firstEnabled = () => {
    for (let i = 0; i < count; i++) if (enabled(i)) return i;
    return -1;
  };
  const lastEnabled = () => {
    for (let i = count - 1; i >= 0; i--) if (enabled(i)) return i;
    return -1;
  };
  const tabStop = enabled(activeIndex) ? activeIndex : firstEnabled();

  // The nearest enabled item from `from` in direction `by`, or `from` itself when there is none
  // (without loop: none before the end).
  const nextFrom = (from: number, by: 1 | -1) => {
    let i = from;
    for (let steps = 1; steps < count; steps++) {
      i += by;
      if (i < 0 || i >= count) {
        if (!loop) return from;
        i = (i + count) % count;
      }
      if (enabled(i)) return i;
    }
    return from;
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    let next: number;
    if (FORWARD[orientation].includes(e.key)) next = nextFrom(index, 1);
    else if (BACKWARD[orientation].includes(e.key)) next = nextFrom(index, -1);
    else if (e.key === 'Home') next = firstEnabled();
    else if (e.key === 'End') next = lastEnabled();
    else return;
    e.preventDefault();
    if (next === -1 || next === index) return;
    items.current[next]?.focus();
    onMove?.(next);
  };

  return {
    getItemProps: (index) => ({
      tabIndex: index === tabStop ? 0 : -1,
      ref: (el) => {
        items.current[index] = el;
      },
      onKeyDown: (e) => onKeyDown(index, e),
    }),
  };
}
