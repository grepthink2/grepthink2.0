import React from 'react';

/**
 * Modal dialog — blurred scrim, white 12px-radius sheet, close ×.
 * Mirrors the app's JoinClassModal shell.
 */
export function Modal({
  open = false,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 500,
  closeDisabled = false,
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && !closeDisabled) onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeDisabled, onClose]);

  if (!open) return null;

  return (
    <div className="gt-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose && onClose(); }}>
      <div className="gt-modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ maxWidth: width }}>
        <button type="button" className="gt-modal__close" aria-label="Close" onClick={onClose} disabled={closeDisabled}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        {(title || subtitle) && (
          <div className="gt-modal__head">
            {title && <h2 className="gt-modal__title">{title}</h2>}
            {subtitle && <p className="gt-modal__subtitle">{subtitle}</p>}
          </div>
        )}
        <div className="gt-modal__body">{children}</div>
        {footer && <div className="gt-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
