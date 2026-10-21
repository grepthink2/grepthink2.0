import React from 'react';

/**
 * Esc hides a tooltip's bubble while it is up (WCAG 1.4.13: content that hover or focus shows can be
 * dismissed without moving the pointer or focus). Adopted from the codebase
 * (`components/Tooltip/useTooltipDismiss.ts`, PR #259). The CSS puts the bubble up while the tooltip
 * is hovered or something inside it has keyboard focus; `handlers`, spread on the `.gt-tooltip`
 * element, follow the same two things: the pointer entering and leaving, and focus that counts as
 * keyboard focus the way browsers decide `:focus-visible` — it arrived after a key rather than a
 * click, or a key was pressed while it was there.
 *
 * The key is heard on `window` in the capture phase, ahead of every other listener, and stopped only
 * when a bubble was up: a dialog or popover around the tooltip stays open, and the next Esc is theirs.
 *
 * Activating the control also hides the bubble (a mouse or pen press, or Enter or Space on it): its
 * label has been read, and the first Esc then reaches what the press opened, such as a menu. A touch
 * press keeps it, since a tap is how a phone shows a bubble. `dismissed` adds `gt-tooltip--dismissed`
 * until the pointer enters again or focus arrives by keyboard; the focus a press brings does not
 * bring it back. IconButton passes `enabled` false while it shows no bubble.
 */
const plainKey = (e) => !e.ctrlKey && !e.metaKey && !e.altKey;
/** How the last interaction came ('key' | 'pointer'), followed from load so early keyboard focus counts. One record per page. */
const lastInput = (typeof window !== 'undefined' && window.__gtTooltipInput) || { last: 'pointer' };
if (typeof window !== 'undefined' && !window.__gtTooltipInput) {
  window.__gtTooltipInput = lastInput;
  window.addEventListener('keydown', (e) => { if (plainKey(e)) lastInput.last = 'key'; }, true);
  window.addEventListener('pointerdown', () => { lastInput.last = 'pointer'; }, true);
}

export function useTooltipDismiss(enabled = true) {
  const [dismissed, setDismissed] = React.useState(false);
  const hovered = React.useRef(false);
  const keyboardFocused = React.useRef(false);
  React.useEffect(() => {
    if (!enabled) { hovered.current = false; keyboardFocused.current = false; return undefined; }
    if (dismissed) return undefined;
    const onKeyDown = (e) => {
      if (e.key !== 'Escape' || e.isComposing || !(hovered.current || keyboardFocused.current)) return;
      e.stopPropagation();
      setDismissed(true);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, dismissed]);
  const handlers = React.useMemo(() => ({
    onPointerEnter: () => { hovered.current = true; setDismissed(false); },
    onPointerLeave: () => { hovered.current = false; },
    onPointerDown: (e) => { if (e.pointerType !== 'touch') setDismissed(true); },
    onFocus: () => { keyboardFocused.current = lastInput.last === 'key'; if (lastInput.last === 'key') setDismissed(false); },
    onBlur: () => { keyboardFocused.current = false; },
    // after the window listener has decided about this key: an Esc that turns the bubble on here was not stopped, and the next one is
    onKeyDown: (e) => {
      if (!plainKey(e)) return;
      keyboardFocused.current = true;
      if (e.key === 'Enter' || e.key === ' ') setDismissed(true);
    },
  }), []);
  return { dismissed, handlers };
}

/**
 * Hover / focus tooltip: a dark bubble, small and quiet, shown at once by CSS instead of after
 * the browser's `title` delay. Esc hides an open bubble (useTooltipDismiss). `focusable={false}`
 * when the trigger sits inside another control (the codebase's addition) — the bubble then shows
 * when that control has keyboard focus. Short one-line labels only; explanations are InfoPopovers.
 */
export function Tooltip({ content, side = 'top', focusable = true, children, className = '' }) {
  const id = React.useId();
  const { dismissed, handlers } = useTooltipDismiss();
  return (
    <span className={['gt-tooltip', dismissed ? 'gt-tooltip--dismissed' : '', className].filter(Boolean).join(' ')} {...handlers}>
      <span className="gt-tooltip__trigger" tabIndex={focusable ? 0 : undefined} aria-describedby={id}>{children}</span>
      <span className={`gt-tooltip__bubble gt-tooltip__bubble--${side}`} role="tooltip" id={id}>{content}</span>
    </span>
  );
}
