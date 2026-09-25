import React from 'react';

const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
};

/**
 * Single toast — white surface, 3px left accent bar in the semantic
 * color, optional action ("Undo"/"Retry") and × dismiss.
 * Auto-dismisses: 5s default, 8s for errors, sticky when an error
 * carries an action (or duration={0}).
 */
export function Toast({ variant = 'info', message, actionLabel, onAction, onDismiss, duration, className = '' }) {
  const v = variant === 'neutral' ? 'info' : variant;
  const [leaving, setLeaving] = React.useState(false);
  const dismiss = React.useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => { if (onDismiss) onDismiss(); }, 150);
  }, [onDismiss]);
  React.useEffect(() => {
    const ms = duration !== undefined ? duration : v === 'error' ? (actionLabel ? 0 : 8000) : 5000;
    if (!ms || !onDismiss) return;
    const id = window.setTimeout(dismiss, ms);
    return () => window.clearTimeout(id);
  }, [duration, v, actionLabel, dismiss, onDismiss]);

  return (
    <div className={['gt-toast', `gt-toast--${v}`, leaving ? 'gt-toast--leaving' : '', className].filter(Boolean).join(' ')} role={v === 'error' ? 'alert' : 'status'}>
      <span className="gt-toast__icon">{ICONS[v]}</span>
      <p className="gt-toast__msg">{message}</p>
      {actionLabel && (
        <button type="button" className="gt-toast__action" onClick={onAction}>{actionLabel}</button>
      )}
      {onDismiss && (
        <button type="button" className="gt-toast__dismiss" aria-label="Dismiss" onClick={dismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      )}
    </div>
  );
}

/**
 * Fixed bottom-right toast container — max 3 visible, newest on top,
 * 8px gap. Pass `toasts` (newest first) or compose Toast children.
 */
export function ToastStack({ toasts = [], onDismiss, children, className = '' }) {
  return (
    <div className={['gt-toast-stack', className].filter(Boolean).join(' ')}>
      {toasts.slice(0, 3).map((t) => (
        <Toast key={t.id} {...t} onDismiss={onDismiss ? () => onDismiss(t.id) : undefined} />
      ))}
      {children}
    </div>
  );
}
