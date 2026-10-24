import React from 'react';
import { IconButton } from '../primitives/IconButton.jsx';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)';
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dialogPortal = (node, inPlace) => (!inPlace && typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM.createPortal
  ? window.ReactDOM.createPortal(node, document.body) : node);

/* ── The dialog stack (the codebase's dialogStack.ts) ──────────────────────────────────────────
   Open dialogs, oldest first; only the topmost answers Esc and its scrim. A layer knows where focus
   goes back: the element that had it as the dialog opened, and the open dialog that element was in.
   When that dialog closed in the same update (a confirm that closes the dialog under it as it
   succeeds), focus goes back to where *that* one came from, and so on down — never to a button in a
   dialog that is going. */
const stack = [];
const pushDialog = (token, opener, holds) => {
  let parent = null;
  for (let i = stack.length - 1; i >= 0 && opener && !parent; i--) if (stack[i].holds(opener)) parent = stack[i];
  stack.push({ token, opener, parent, holds, open: true });
};
const returnTarget = (layer) => {
  if (layer.parent && !layer.parent.open) return returnTarget(layer.parent);
  const { opener } = layer;
  return opener instanceof HTMLElement && opener.isConnected ? opener : null;
};
const popDialog = (token) => {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i].token !== token) continue;
    const [layer] = stack.splice(i, 1);
    layer.open = false;
    return returnTarget(layer);
  }
  return null;
};
const isTopDialog = (token) => stack.length > 0 && stack[stack.length - 1].token === token;

/* ── The scroll lock (the codebase's scrollLock.ts) ────────────────────────────────────────────
   Counted: the first lock saves body's inline overflow and sets hidden; only the last release puts
   the saved value back, and only while overflow is still the lock's own (a hand-built modal that set
   it meanwhile has the last word). A release counts once, however often it is called. */
const LOCKED = 'hidden';
let locks = 0;
let savedOverflow = '';
export function lockBodyScroll() {
  if (locks === 0) { savedOverflow = document.body.style.overflow; document.body.style.overflow = LOCKED; }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0 && document.body.style.overflow === LOCKED) document.body.style.overflow = savedOverflow;
  };
}

/** Whether focus can land on an element: outside hidden / inert subtrees, and drawn. */
function canTakeFocus(el) {
  if (el.closest('[hidden], [inert]')) return false;
  if (typeof el.checkVisibility === 'function') return el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });
  if (window.getComputedStyle(el).visibility === 'hidden') return false;
  for (let box = el; box; box = box.parentElement) if (window.getComputedStyle(box).display === 'none') return false;
  return true;
}
const isGroupedRadio = (el) => el instanceof HTMLInputElement && el.type === 'radio' && el.name !== '';
/** Where Tab stops in the sheet, as the browser counts them: drawn, tabIndex >= 0 (a roving group's resting items drop out), a radio group once (its checked radio, else its first). */
function tabStops(sheet) {
  const focusable = Array.from(sheet.querySelectorAll(FOCUSABLE)).filter((el) => el.tabIndex >= 0 && canTakeFocus(el));
  const standIns = [];
  for (const el of focusable) {
    if (!isGroupedRadio(el)) continue;
    const at = standIns.findIndex((r) => r.name === el.name && r.form === el.form);
    if (at === -1) standIns.push(el);
    else if (el.checked && !standIns[at].checked) standIns[at] = el;
  }
  return focusable.filter((el) => !isGroupedRadio(el) || standIns.includes(el));
}
/** Focus on open: `initialFocusRef`, else `[data-autofocus]`, else the first field that takes it, else the sheet. */
function focusInside(sheet, initial) {
  const candidates = [initial, sheet.querySelector('[data-autofocus]'), ...sheet.querySelectorAll(FIELDS)];
  for (const el of candidates) {
    if (!el || !canTakeFocus(el)) continue;
    el.focus();
    if (document.activeElement === el) return;
  }
  sheet.focus();
}
/** Tab and Shift+Tab wrap at the sheet's ends; a key in a layer portaled out of the sheet (the date picker) is that layer's; focus lost to the page comes back in. */
function trapTab(e, sheet) {
  const active = document.activeElement;
  const lost = !active || active === document.body || active === document.documentElement;
  if (!lost && !sheet.contains(active)) return;
  const stops = tabStops(sheet);
  if (!stops.length) { e.preventDefault(); sheet.focus(); return; }
  const follows = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  if (e.shiftKey) {
    if (lost || !stops.some((el) => el !== active && follows(el, active))) { e.preventDefault(); stops[stops.length - 1].focus(); }
  } else if (lost || !stops.some((el) => el !== active && follows(active, el))) { e.preventDefault(); stops[0].focus(); }
}

/**
 * The shared dialog behaviour (Modal, ConfirmDialog, Drawer), kept in step with the codebase's
 * useDialog.ts (fold-back 2026-10-22):
 * - a stack: Esc and the scrim close only the topmost dialog;
 * - focus moves in on the next task (so the key that opened the dialog cannot press what it lands
 *   on): initialFocusRef → [data-autofocus] → the first field → the sheet; a field that took focus
 *   as it mounted (autoFocus) keeps it unless initialFocusRef names another;
 * - Tab stays inside, counting only real tab stops (drawn, tabIndex >= 0, one radio per group);
 * - on close, focus returns to the opener — past a dialog that closed in the same update, to the
 *   first opener still in the page — unless something moved focus elsewhere on purpose;
 * - Esc is ignored while composing (IME), when the key repeats, or when something already handled it;
 * - the body scroll lock is counted (see lockBodyScroll);
 * - the sheet stays mounted `exitMs` for the closing fade (instant under reduced motion).
 */
export function useDialog({ open, onClose, closeDisabled = false, initialFocusRef, sheetRef, exitMs = 150, inPlace = false }) {
  const onCloseRef = React.useRef(onClose);
  const disabledRef = React.useRef(closeDisabled);
  onCloseRef.current = onClose;
  disabledRef.current = closeDisabled;
  // `closing` keeps the sheet up for the fade; `opener` is read while rendering the open, before a
  // field inside (autoFocus) can take focus.
  const [closing, setClosing] = React.useState(false);
  const [opener, setOpener] = React.useState(() => (open && typeof document !== 'undefined' ? document.activeElement : null));
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !reduceMotion());
    if (open) setOpener(document.activeElement);
  }
  const openerRef = React.useRef(opener);
  openerRef.current = opener;
  React.useEffect(() => {
    if (!closing) return undefined;
    const t = window.setTimeout(() => setClosing(false), exitMs);
    return () => window.clearTimeout(t);
  }, [closing, exitMs]);

  const token = React.useRef(null);
  React.useEffect(() => {
    if (!open || inPlace) return undefined; // in-place renders (galleries) never trap, lock or take focus
    const self = Symbol('dialog');
    token.current = self;
    // Onto the stack, with where focus goes back: focus already outside this sheet and not the page
    // itself belongs to a dialog that closed in this same update and gave focus back to its opener.
    const active = document.activeElement;
    const outside = active !== null && active !== document.body && !(sheetRef.current && sheetRef.current.contains(active));
    pushDialog(self, outside ? active : openerRef.current, (el) => !!(sheetRef.current && sheetRef.current.contains(el)));
    const unlock = lockBodyScroll();
    const focusTimer = window.setTimeout(() => {
      const sheet = sheetRef.current;
      const initial = initialFocusRef && initialFocusRef.current;
      if (!sheet || (!initial && sheet.contains(document.activeElement))) return;
      focusInside(sheet, initial);
    }, 0);
    const onKey = (e) => {
      if (e.defaultPrevented || !isTopDialog(self)) return;
      if (e.key === 'Escape') {
        if (e.repeat || e.isComposing || e.keyCode === 229 || disabledRef.current || !onCloseRef.current) return;
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'Tab' && sheetRef.current) {
        trapTab(e, sheetRef.current);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      const back = popDialog(self);
      unlock();
      // Focus still in the closing sheet, or lost with it, goes back; focus anywhere else stays.
      const sheet = sheetRef.current;
      const now = document.activeElement;
      const stranded = !now || now === document.body || (sheet !== null && sheet.contains(now));
      if (stranded && back) back.focus();
    };
  }, [open, inPlace]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScrimDown = (e) => {
    if (e.target !== e.currentTarget || disabledRef.current) return;
    const self = token.current;
    if (open && !inPlace && self && isTopDialog(self) && onCloseRef.current) onCloseRef.current();
  };
  return { mounted: open || closing, closing, onScrimDown };
}

const XGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/**
 * Modal dialog. `variant="form"` (default): title left, optional `tabs` under it, pinned footer —
 * Edit Project's header. `variant="message"`: centred title (JoinClassModal). Sizes sm 400 · md 560 ·
 * lg 760. `role="dialog"` + `aria-modal` on the sheet, labelled by its title and described by the
 * subtitle (and by `aria-describedby`, which ConfirmDialog points at its message); `closeDisabled`
 * holds it open while saving. Portaled to <body> at --gt-z-modal; closes with a 0.15s fade.
 */
export function Modal({
  open = false, onClose, title, subtitle, children, footer, tabs, size = 'md', width, variant = 'form',
  closeDisabled = false, initialFocusRef, hideClose = false, role = 'dialog', portal = true, className = '',
  'aria-describedby': describedBy,
}) {
  const sheetRef = React.useRef(null);
  const id = React.useId();
  const { mounted, closing, onScrimDown } = useDialog({ open, onClose, closeDisabled, initialFocusRef, sheetRef, inPlace: !portal });
  if (!mounted) return null;
  return dialogPortal(
    <div className={['gt-modal-backdrop', closing ? 'gt-modal-backdrop--closing' : '', portal ? '' : 'gt-modal-backdrop--inline'].filter(Boolean).join(' ')} onMouseDown={onScrimDown}>
      <div
        ref={sheetRef}
        className={['gt-modal', `gt-modal--${size}`, `gt-modal--${variant}`, className].filter(Boolean).join(' ')}
        role={role}
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-describedby={[subtitle ? `${id}-sub` : null, describedBy].filter(Boolean).join(' ') || undefined}
        tabIndex={-1}
        style={width ? { maxWidth: width } : undefined}
      >
        <div className="gt-modal__head">
          {title && <h2 className="gt-modal__title" id={`${id}-title`}>{title}</h2>}
          {subtitle && <p className="gt-modal__subtitle" id={`${id}-sub`}>{subtitle}</p>}
          {!hideClose && (
            <IconButton className="gt-modal__close" ariaLabel="Close" tooltip={false} onClick={onClose} disabled={closeDisabled}><XGlyph /></IconButton>
          )}
          {tabs && <div className="gt-modal__tabs">{tabs}</div>}
        </div>
        <div className="gt-modal__body">{children}</div>
        {footer && <div className="gt-modal__footer">{footer}</div>}
      </div>
    </div>,
    !portal,
  );
}
