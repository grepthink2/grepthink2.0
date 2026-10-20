import React from 'react';
import { Modal } from './Modal.jsx';
import { Alert } from './Alert.jsx';
import { Button } from '../primitives/Button.jsx';

/**
 * Confirmation dialog — `role="alertdialog"` on the Modal shell (sm). The message names the thing
 * and the consequence. Cancel (outline) takes focus first; Confirm is primary, or danger when the
 * action destroys something. While `onConfirm`'s promise runs, Confirm is busy, Cancel waits, and
 * Esc / the scrim are blocked; a rejection shows `errorText` inside the dialog as an Alert.
 * Replaces ConfirmModal (5 callers), 5 window.confirm and 3 alert() calls.
 */
export function ConfirmDialog({
  open = false, title, message, confirmLabel = 'Confirm', busyLabel, cancelLabel = 'Cancel', destructive = false,
  onConfirm, onCancel, busy: busyProp, error: errorProp, errorText = 'That didn’t work. Try again.', portal = true,
}) {
  const [busyState, setBusy] = React.useState(false);
  const [errState, setErr] = React.useState('');
  const busy = busyProp ?? busyState;
  const error = errorProp ?? errState;
  React.useEffect(() => { if (open) { setBusy(false); setErr(''); } }, [open]);
  const confirm = async () => {
    if (busy || !onConfirm) return;
    setErr('');
    try {
      const r = onConfirm();
      if (r && typeof r.then === 'function') { setBusy(true); await r; }
    } catch (e) {
      setErr(errorText);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onCancel} title={title} size="sm" role="alertdialog" closeDisabled={busy} portal={portal}
      footer={(
        <>
          <Button variant="outline" onClick={onCancel} disabled={busy} data-autofocus>{cancelLabel}</Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={confirm} loading={busy} loadingLabel={busyLabel}>{confirmLabel}</Button>
        </>
      )}>
      <p className="gt-confirm__message">{message}</p>
      {error && <Alert tone="error" className="gt-confirm__error">{error}</Alert>}
    </Modal>
  );
}

const AlertGlyph = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>;

/**
 * Inline confirm row — the row-level delete inside a dialog (never a dialog over a dialog).
 * `role="group"` labelled by its sentence; Cancel takes focus; Esc cancels without closing the
 * enclosing dialog; Delete shows its busy state.
 */
export function InlineConfirm({ message, confirmLabel = 'Delete', busyLabel = 'Deleting…', cancelLabel = 'Cancel', busy = false, autoFocus = true, onConfirm, onCancel, className = '' }) {
  const id = React.useId();
  const rootRef = React.useRef(null);
  React.useEffect(() => {
    if (!autoFocus) return;
    const b = rootRef.current && rootRef.current.querySelector('[data-cancel]');
    if (b) b.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={rootRef} className={['gt-inline-confirm', className].filter(Boolean).join(' ')} role="group" aria-labelledby={`${id}-msg`}
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); e.preventDefault(); if (onCancel) onCancel(); } }}>
      <span className="gt-inline-confirm__icon"><AlertGlyph /></span>
      <p className="gt-inline-confirm__text" id={`${id}-msg`}>{message}</p>
      <span className="gt-inline-confirm__actions">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={busy} data-cancel>{cancelLabel}</Button>
        <Button variant="danger" size="sm" onClick={onConfirm} loading={busy} loadingLabel={busyLabel}>{confirmLabel}</Button>
      </span>
    </div>
  );
}
