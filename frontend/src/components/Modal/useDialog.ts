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

/**
 * Whether focus can land on an element: outside hidden and inert subtrees, and drawn. The browser's
 * `checkVisibility` answers the last part where it exists; elsewhere the element's own computed style.
 */
function canTakeFocus(el: HTMLElement): boolean {
  if (el.closest('[hidden], [inert]')) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * Focus on open: `initialFocusRef`, else `[data-autofocus]`, else the first field that takes it (a
 * file input styled away does not), else the sheet.
 */
function focusInside(sheet: HTMLElement, initial: HTMLElement | null | undefined) {
  const candidates = [initial, sheet.querySelector<HTMLElement>('[data-autofocus]'), ...sheet.querySelectorAll<HTMLElement>(FIELDS)];
  for (const el of candidates) {
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
 * - On open, focus moves in, a moment later (after the key or press that opened it): `initialFocusRef`,
 *   else `[data-autofocus]`, else the first field, else the sheet. Tab and Shift+Tab wrap inside the
 *   sheet. On close, focus goes back to the element that had it, if that still exists and nothing has
 *   moved focus out of the dialog on purpose; past a dialog under it that closed in the same update,
 *   to where that one came from (dialogStack).
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
 * Codebase-side: an Esc or Tab whose default was prevented is left alone; the trap counts only what
 * is drawn (`checkVisibility`, where the browser has it); a field inside that takes focus as it
 * mounts (`autoFocus`) keeps it, unless `initialFocusRef` names another; and focus moved on purpose
 * as the dialog closes stays where it went.
 */
export function useDialog({
  open, onClose, closeDisabled = false, initialFocusRef, sheetRef, exitMs = 150, inPlace = false,
}: UseDialogOptions): UseDialogResult {
  // The exit: `closing` keeps the sheet up for the fade once `open` turns false. And the element
  // that had focus as the dialog opened, read while rendering the open, before anything inside (a
  // field with autoFocus) can take focus. Both adjusted while rendering the change rather than in an
  // effect, so they hold from the commit that opens or closes the dialog.
  const [closing, setClosing] = useState(false);
  const [opener, setOpener] = useState<Element | null>(() => (open ? document.activeElement : null));
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !reducedMotion());
    if (open) setOpener(document.activeElement);
  }
  useEffect(() => {
    if (!closing) return undefined;
    const timer = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [closing, exitMs]);

  // This dialog's place on the stack while it is open.
  const token = useRef<symbol | null>(null);

  // On open: the element given, else a focus already inside (a field's autoFocus, or a press there
  // before this ran), else the rest.
  const focusIn = useEffectEvent(() => {
    const sheet = sheetRef.current;
    const initial = initialFocusRef?.current;
    if (!sheet || (!initial && sheet.contains(document.activeElement))) return;
    focusInside(sheet, initial);
  });

  // Onto the stack, with where focus goes back. What has focus now, when that is outside this sheet
  // and not the page itself: a dialog that closed in this same update (the one this confirm took
  // over from) has just given focus back to its own opener, and that is where this one goes back to
  // too. Otherwise the element read while rendering the open.
  const openLayer = useEffectEvent((self: symbol) => {
    const active = document.activeElement;
    const outside = active !== null && active !== document.body && !sheetRef.current?.contains(active);
    pushDialog(self, outside ? active : opener, (el) => sheetRef.current?.contains(el) ?? false);
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

  // Focus still in the closing sheet, or lost with it, goes back (dialogStack says where). Focus
  // anywhere else stays: moved there on purpose, or in a dialog above this one, which gives it back.
  const giveFocusBack = useEffectEvent((back: HTMLElement | null) => {
    const sheet = sheetRef.current;
    const active = document.activeElement;
    const stranded = !active || active === document.body || (sheet !== null && sheet.contains(active));
    if (stranded && back) back.focus();
  });

  useEffect(() => {
    if (!open || inPlace) return undefined;
    const self = Symbol('dialog');
    token.current = self;
    openLayer(self);
    const unlock = lockBodyScroll();
    // Once the key or press that opened the dialog has run its course: focused at once, the dialog's
    // Cancel would take the same Enter's keypress and close it, and a first field the same keystroke.
    const focusTimer = window.setTimeout(() => focusIn(), 0);
    const listener = (e: KeyboardEvent) => onKeyDown(e, self);
    document.addEventListener('keydown', listener);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', listener);
      const back = popDialog(self);
      unlock();
      giveFocusBack(back);
    };
  }, [open, inPlace]);

  const onScrimDown = (e: MouseEvent) => {
    if (e.target !== e.currentTarget || closeDisabled) return;
    const self = token.current;
    if (open && !inPlace && self && isTopDialog(self)) onClose?.();
  };

  return { mounted: open || closing, closing, onScrimDown };
}
