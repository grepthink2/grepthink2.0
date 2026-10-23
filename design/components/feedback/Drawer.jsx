import React from 'react';
import { useDialog, dialogPortal } from './Modal.jsx';
import { IconButton } from '../primitives/IconButton.jsx';

const XGlyph = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/**
 * Side sheet with the Modal's behaviour (useDialog): 420px from the right for editors (the
 * assignment editor), from the left for the phone navigation; header, scrolling body, pinned
 * footer. Slides 24px in over 0.2s (a fade under reduced motion); full width on phones.
 */
export function Drawer({
  open = false, onClose, title, subtitle, children, footer, side = 'right', width, closeDisabled = false,
  initialFocusRef, ariaLabel, portal = true, className = '',
}) {
  const sheetRef = React.useRef(null);
  const id = React.useId();
  const { mounted, closing, onScrimDown } = useDialog({ open, onClose, closeDisabled, initialFocusRef, sheetRef, exitMs: 200, inPlace: !portal });
  if (!mounted) return null;
  return dialogPortal(
    <div className={['gt-drawer-backdrop', side === 'left' ? 'gt-drawer-backdrop--left' : '', closing ? 'gt-drawer-backdrop--closing' : '', portal ? '' : 'gt-drawer-backdrop--inline'].filter(Boolean).join(' ')} onMouseDown={onScrimDown}>
      <aside
        ref={sheetRef}
        className={['gt-drawer', side === 'left' ? 'gt-drawer--left' : '', className].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-describedby={subtitle ? `${id}-sub` : undefined}
        tabIndex={-1}
        style={width ? { width } : undefined}
      >
        <div className="gt-drawer__head">
          {title && <h2 className="gt-drawer__title" id={`${id}-title`}>{title}</h2>}
          {subtitle && <p className="gt-drawer__subtitle" id={`${id}-sub`}>{subtitle}</p>}
          <IconButton className="gt-drawer__close" ariaLabel="Close" tooltip={false} onClick={onClose} disabled={closeDisabled}><XGlyph /></IconButton>
        </div>
        <div className="gt-drawer__body">{children}</div>
        {footer && <div className="gt-drawer__footer">{footer}</div>}
      </aside>
    </div>,
    !portal,
  );
}
