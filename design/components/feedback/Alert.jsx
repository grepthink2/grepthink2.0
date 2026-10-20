import React from 'react';

const G = ({ children }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>;
const ICONS = {
  success: <G><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4 12 14.01l-3-3" /></G>,
  warning: <G><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" /></G>,
  error: <G><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" /></G>,
  info: <G><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></G>,
};

/**
 * Inline alert for a persistent condition, on the semantic soft / text pairs. Error alerts are
 * announced at once (`role="alert"`); other tones are status messages (`role="status"`).
 * `actions` holds buttons (Try again, Restore draft, Discard, Unsend) — children are a <div> now,
 * so buttons and paragraphs both fit. Passing confirmations are Toasts; field errors sit under
 * their field; a save error is an Alert above the form's actions.
 */
export function Alert({ tone = 'info', title, children, actions, onDismiss, className = '' }) {
  return (
    <div className={['gt-alert', `gt-alert--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="gt-alert__icon">{ICONS[tone]}</span>
      <div className="gt-alert__content">
        {title && <p className="gt-alert__title">{title}</p>}
        {children && <div className="gt-alert__text">{children}</div>}
        {actions && <div className="gt-alert__actions">{actions}</div>}
      </div>
      {onDismiss && (
        <button type="button" className="gt-alert__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </div>
  );
}
