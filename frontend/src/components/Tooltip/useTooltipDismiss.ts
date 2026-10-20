import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Esc hides a tooltip's bubble while it is up (WCAG 1.4.13: content that hover or focus shows can
 * be dismissed without moving the pointer or focus). The CSS puts the bubble up while the tooltip
 * is hovered or something inside it has keyboard focus, and `handlers`, spread on the `.gt-tooltip`
 * element, follow the same two things: the pointer entering and leaving, and focus that counts as
 * keyboard focus the way browsers decide `:focus-visible`: it arrived after a key rather than a
 * click, or a key was pressed while it was there. The selector itself is not read at the Esc,
 * which turns it on for something focused by a click: that Esc found no bubble up, and the next
 * one finds it.
 *
 * The key is heard on `window` in the capture phase, ahead of every other listener, and stopped
 * there only when a bubble was up: a dialog or popover around the tooltip stays open, and the next
 * Esc is theirs.
 *
 * Activating the control also hides the bubble (a press, or Enter or Space on it): its label has
 * been read, and the first Esc then reaches what the press opened, such as a menu. A touch press
 * keeps it, since a tap is how a phone shows a bubble. `dismissed` adds `gt-tooltip--dismissed`
 * until the pointer enters again or focus arrives by keyboard; the focus a press brings does not
 * bring it back.
 *
 * Shared by Tooltip and IconButton's label, which passes `enabled` false while it shows none.
 */
export function useTooltipDismiss(enabled = true) {
  const [dismissed, setDismissed] = useState(false);
  const hovered = useRef(false);
  const keyboardFocused = useRef(false);

  useEffect(() => {
    if (!enabled) {
      // No bubble, so nothing the next one should start from.
      hovered.current = false;
      keyboardFocused.current = false;
      return undefined;
    }
    if (dismissed) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || !(hovered.current || keyboardFocused.current)) return;
      e.stopPropagation();
      setDismissed(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, dismissed]);

  const handlers = useMemo(
    () => ({
      onPointerEnter: () => {
        hovered.current = true;
        setDismissed(false);
      },
      onPointerLeave: () => {
        hovered.current = false;
      },
      onPointerDown: (e: { pointerType: string }) => {
        if (e.pointerType !== 'touch') setDismissed(true);
      },
      onFocus: () => {
        keyboardFocused.current = lastInput === 'key';
        if (lastInput === 'key') setDismissed(false);
      },
      onBlur: () => {
        keyboardFocused.current = false;
      },
      // After the window listener has decided about this key: an Esc that turns the bubble on
      // here was not stopped, and the next one is.
      onKeyDown: (e: KeyModifiers & { key: string }) => {
        if (!plainKey(e)) return;
        keyboardFocused.current = true;
        if (e.key === 'Enter' || e.key === ' ') setDismissed(true);
      },
    }),
    [],
  );

  return { dismissed, handlers };
}

type KeyModifiers = Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>;

/** A key the way browsers count one for `:focus-visible`: anything but a Ctrl, Meta or Alt shortcut. */
function plainKey(e: KeyModifiers): boolean {
  return !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * How the last interaction came: a key or a pointer. Followed from the moment this module loads,
 * so focus that arrives by keyboard before the first tooltip mounts still counts.
 */
let lastInput: 'key' | 'pointer' = 'pointer';

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (plainKey(e)) lastInput = 'key';
  }, true);
  window.addEventListener('pointerdown', () => {
    lastInput = 'pointer';
  }, true);
}
