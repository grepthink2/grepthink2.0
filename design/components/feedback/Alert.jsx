import React from 'react';

const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M22 4L12 14.01l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
  ),
};

/**
 * Inline alert using the semantic soft/text color pairs.
 */
export function Alert({ tone = 'info', title, children, onDismiss, className = '' }) {
  return (
    <div className={['gt-alert', `gt-alert--${tone}`, className].filter(Boolean).join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <span className="gt-alert__icon">{ICONS[tone]}</span>
      <div className="gt-alert__content">
        {title && <p className="gt-alert__title">{title}</p>}
        {children && <p className="gt-alert__text">{children}</p>}
      </div>
      {onDismiss && (
        <button type="button" className="gt-alert__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      )}
    </div>
  );
}

/**
 * Toast — an Alert that floats bottom-right and auto-dismisses.
 * Render via ToastStack; this is the single toast visual.
 */
export function Toast({ tone = 'success', title, children, onDismiss }) {
  return (
    <div className={`gt-toast gt-alert gt-alert--${tone}`} role="status">
      <span className="gt-alert__icon">{ICONS[tone]}</span>
      <div className="gt-alert__content">
        {title && <p className="gt-alert__title">{title}</p>}
        {children && <p className="gt-alert__text">{children}</p>}
      </div>
      {onDismiss && (
        <button type="button" className="gt-alert__dismiss" aria-label="Dismiss" onClick={onDismiss}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      )}
    </div>
  );
}

/** Fixed bottom-right stack for toasts. */
export function ToastStack({ children }) {
  return <div className="gt-toast-stack">{children}</div>;
}
