import { useEffect, useEffectEvent, useRef, useState, type MouseEvent, type RefObject } from 'react';
import { isTopDialog, popDialog, pushDialog } from './dialogStack';
import { lockBodyScroll } from './scrollLock';

/** What Tab stops on inside a sheet, as the trap counts it. */
const FOCUSABLE = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled):not([type="hidden"])',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** The fields a dialog opens on when nothing is marked to take focus first. */
const FIELDS = 'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)';

export interface UseDialogOptions {
  open: boolean;
  /** Esc and the scrim call it, for the topmost dialog only. */
  onClose?: () => void;
  /** Holds the dialog open, as while it saves: Esc and the scrim do nothing. @default false */
  closeDisabled?: boolean;
  /** Takes focus on open, ahead of `[data-autofocus]`, the first field and the sheet. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** The sheet: the element with the dialog role, which Tab stays inside. */
  sheetRef: RefObject<HTMLElement | null>;
  /** How long the sheet stays mounted for its closing fade. @default 150 */
  exitMs?: number;
  /** Rendered in place (galleries, harness pages): no stack, trap, scroll lock or focus move. @default false */
  inPlace?: boolean;
}

export interface UseDialogResult {
  /** Whether to render the dialog: it is open, or fading out. */
  mounted: boolean;
  /** Fading out, for the `--closing` classes. */
  closing: boolean;
  /** The scrim's `onMouseDown`. */
  onScrimDown: (e: MouseEvent) => void;
}

const reducedMotion = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Whether focus can land on an element: outside hidden and inert subtrees, and drawn, where the browser can tell. */
function canTakeFocus(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true }) : true;
}

/** Focus on open: `initialFocusRef`, else `[data-autofocus]`, else the first field, else the sheet, whichever takes it first. */
function focusInside(sheet: HTMLElement, initial: HTMLElement | null | undefined) {
  const marked = sheet.querySelector<HTMLElement>('[data-autofocus]');
  const field = Array.from(sheet.querySelectorAll<HTMLElement>(FIELDS)).find(canTakeFocus);
  for (const el of [initial, marked, field]) {
    if (!el || !canTakeFocus(el)) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
  sheet.focus();
}

/**
 * Tab and Shift+Tab wrap at the ends of the sheet; between them the browser moves focus. A key
 * pressed in a layer portaled out of the sheet (the date picker's calendar) is that layer's, so
 * focus is never pulled back from it. Focus lost to the page, its element gone, comes back in.
 */
function trapTab(e: KeyboardEvent, sheet: HTMLElement) {
  const active = document.activeElement;
  const lost = !active || active === document.body || active === document.documentElement;
  if (!lost && !sheet.contains(active)) return;
  const stops = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(canTakeFocus);
  if (stops.length === 0) {
    e.preventDefault();
    sheet.focus();
    return;
  }
  const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  if (e.shiftKey) {
    if (lost || !stops.some((el) => el !== active && follows(el, active))) {
      e.preventDefault();
      stops[stops.length - 1].focus();
    }
  } else if (lost || !stops.some((el) => el !== active && follows(active, el))) {
    e.preventDefault();
    stops[0].focus();
  }
}

/**
 * The behaviour Modal, Drawer and ConfirmDialog share, ported from useDialog in
 * design/components/feedback/Modal.jsx:
 *
 * - Open dialogs form a stack (dialogStack), and only the topmost answers Esc and its scrim.
 * - On open, focus moves in: `initialFocusRef`, else `[data-autofocus]`, else the first field, else
 *   the sheet. Tab and Shift+Tab wrap inside the sheet. On close, focus goes back to the element
 *   that had it, if that still exists and nothing has moved focus out of the dialog on purpose.
 * - Esc is heard on `document` in the bubble phase, so every layer inside that takes it first wins:
 *   Popover and the ⌘K palette (capture phase), Tooltip and the date picker's calendar (the window,
 *   capture phase), and a form or row that stops it (team meetings). An Esc that something already
 *   prevented, or that ends an IME composition, is not the dialog's.
 * - The scrim closes the dialog only for a mousedown that starts on the scrim itself: one inside the
 *   sheet, or in a layer portaled out of it, bubbles through the scrim's handler as React events do.
 * - The page behind does not scroll while any dialog is open (scrollLock).
 * - After `open` turns false the sheet stays mounted `exitMs` with `closing` set, for the fade, and
 *   unmounts at once under reduced motion.
 *
 * Codebase-side: an Esc or Tab whose default was prevented is left alone, the trap counts only what
 * is drawn (`checkVisibility`, where the browser has it), and focus moved on purpose as the dialog
 * closes stays where it went.
 */
export function useDialog({
  open, onClose, closeDisabled = false, initialFocusRef, sheetRef, exitMs = 150, inPlace = false,
}: UseDialogOptions): UseDialogResult {
  // The exit: `closing` keeps the sheet up for the fade once `open` turns false. Adjusted while
  // rendering the change rather than in an effect, so the fade starts in the same commit.
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !reducedMotion());
  }
  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  // This dialog's place on the stack while it is open.
  const token = useRef<symbol | null>(null);

  const focusIn = useEffectEvent(() => {
    const sheet = sheetRef.current;
    if (sheet) focusInside(sheet, initialFocusRef?.current);
  });

  const onKeyDown = useEffectEvent((e: KeyboardEvent, self: symbol) => {
    if (e.defaultPrevented || !isTopDialog(self)) return;
    if (e.key === 'Escape') {
      if (e.isComposing || e.keyCode === 229 || closeDisabled || !onClose) return;
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab' && sheetRef.current) {
      trapTab(e, sheetRef.current);
    }
  });

  const giveFocusBack = useEffectEvent((returnTo: Element | null) => {
    const sheet = sheetRef.current;
    const active = document.activeElement;
    // Still in the closing sheet, or lost with it: back to where it came from.
    const stranded = !active || active === document.body || (sheet !== null && sheet.contains(active));
    if (stranded && returnTo instanceof HTMLElement && returnTo.isConnected) returnTo.focus();
  });

  useEffect(() => {
    if (!open || inPlace) return undefined;
    const self = Symbol('dialog');
    token.current = self;
    pushDialog(self);
    const unlock = lockBodyScroll();
    const returnTo = document.activeElement;
    focusIn();
    const listener = (e: KeyboardEvent) => onKeyDown(e, self);
    document.addEventListener('keydown', listener);
    return () => {
      document.removeEventListener('keydown', listener);
      popDialog(self);
      unlock();
      giveFocusBack(returnTo);
    };
  }, [open, inPlace]);

  const onScrimDown = (e: MouseEvent) => {
    if (e.target !== e.currentTarget || closeDisabled) return;
    const self = token.current;
    if (open && !inPlace && self && isTopDialog(self)) onClose?.();
  };

  return { mounted: open || closing, closing, onScrimDown };
}
