import React from 'react';
import { IconButton } from '../primitives/IconButton.jsx';

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
const FIELDS = 'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)';
const openStack = [];
const reduceMotion = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const dialogPortal = (node, inPlace) => (!inPlace && typeof window !== 'undefined' && window.ReactDOM && window.ReactDOM.createPortal
  ? window.ReactDOM.createPortal(node, document.body) : node);

/**
 * The shared dialog behaviour (Modal, ConfirmDialog, Drawer): a stack so Esc and the scrim close
 * only the topmost dialog; focus moves in (initialFocusRef → [data-autofocus] → first field → the
 * sheet), Tab stays inside, focus returns to the trigger on close; body scroll locks; the sheet
 * stays mounted `exitMs` for the closing fade (instant under reduced motion).
 */
export function useDialog({ open, onClose, closeDisabled = false, initialFocusRef, sheetRef, exitMs = 150, inPlace = false }) {
  const me = React.useRef({});
  const onCloseRef = React.useRef(onClose);
  const disabledRef = React.useRef(closeDisabled);
  onCloseRef.current = onClose;
  disabledRef.current = closeDisabled;
  const [mounted, setMounted] = React.useState(open);
  const [closing, setClosing] = React.useState(false);

  React.useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return undefined; }
    if (!mounted) return undefined;
    if (reduceMotion()) { setMounted(false); return undefined; }
    setClosing(true);
    const t = setTimeout(() => { setMounted(false); setClosing(false); }, exitMs);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!open || inPlace) return undefined; // in-place renders (galleries) never trap, lock or take focus
    const self = me.current;
    openStack.push(self);
    const returnTo = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = setTimeout(() => {
      const s = sheetRef.current;
      if (!s) return;
      const target = (initialFocusRef && initialFocusRef.current) || s.querySelector('[data-autofocus]') || s.querySelector(FIELDS) || s;
      target.focus();
    }, 0);
    const onKey = (e) => {
      if (openStack[openStack.length - 1] !== self || e.defaultPrevented) return;
      if (e.key === 'Escape') {
        if (!disabledRef.current && onCloseRef.current) { e.preventDefault(); onCloseRef.current(); }
      } else if (e.key === 'Tab' && sheetRef.current) {
        const list = Array.from(sheetRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.getClientRects().length);
        if (!list.length) { e.preventDefault(); return; }
        const first = list[0]; const last = list[list.length - 1]; const a = document.activeElement;
        if (e.shiftKey && (a === first || a === sheetRef.current)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
      const i = openStack.indexOf(self);
      if (i >= 0) openStack.splice(i, 1);
      if (!openStack.length) document.body.style.overflow = prevOverflow;
      if (returnTo && returnTo.focus && document.contains(returnTo)) returnTo.focus();
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScrimDown = (e) => {
    if (e.target !== e.currentTarget || disabledRef.current) return;
    if (openStack[openStack.length - 1] === me.current && onCloseRef.current) onCloseRef.current();
  };
  return { mounted, closing, onScrimDown };
}

const XGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/**
 * Modal dialog. `variant="form"` (default): title left, optional `tabs` under it, pinned footer —
 * Edit Project's header. `variant="message"`: centred title (JoinClassModal). Sizes sm 400 · md 560 ·
 * lg 760. `role="dialog"` + `aria-modal` on the sheet, labelled by its title; `closeDisabled` holds it
 * open while saving. Portaled to <body> at --gt-z-modal; closes with a 0.15s fade.
 */
export function Modal({
  open = false, onClose, title, subtitle, children, footer, tabs, size = 'md', width, variant = 'form',
  closeDisabled = false, initialFocusRef, hideClose = false, role = 'dialog', portal = true, className = '',
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
        aria-describedby={subtitle ? `${id}-sub` : undefined}
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
