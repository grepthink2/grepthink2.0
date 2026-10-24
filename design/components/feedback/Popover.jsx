import React from 'react';

/**
 * Anchored floating surface — the primitive Menu, MentionListbox and
 * the board-settings panel compose on. Positions above/below its
 * anchor with a 6px offset, closes on Esc / outside click, never
 * traps focus. Esc is taken in the capture phase and stopped, so a
 * popover inside a Modal closes on its own; the surface sets its own
 * text colour (both adopted from the codebase).
 */
export function Popover({
  open = false,
  onClose,
  anchor = null,
  placement = 'bottom',
  align = 'start',
  size = 'md',
  padded = true,
  className = '',
  children,
  ...rest
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    // capture + stop: a popover inside a modal closes alone (adopted from the codebase)
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (onClose) onClose(); } };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target) && onClose) onClose(); };
    document.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', down);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('mousedown', down);
    };
  }, [open, onClose]);

  return (
    <span className="gt-popover-anchor" ref={ref}>
      {anchor}
      {open && (
        <div
          className={[
            'gt-popover',
            `gt-popover--${placement}`,
            `gt-popover--${align}`,
            size === 'sm' ? 'gt-popover--sm' : '',
            padded ? '' : 'gt-popover--flush',
            className,
          ].filter(Boolean).join(' ')}
          {...rest}
        >
          {children}
        </div>
      )}
    </span>
  );
}
