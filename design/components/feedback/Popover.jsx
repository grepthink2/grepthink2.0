import React from 'react';

/**
 * Anchored floating surface — the primitive Menu, MentionListbox and
 * the board-settings panel compose on. Positions above/below its
 * anchor with a 6px offset, closes on Esc / outside click, never
 * traps focus.
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
    const key = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose && onClose(); };
    document.addEventListener('keydown', key);
    document.addEventListener('mousedown', down);
    return () => {
      document.removeEventListener('keydown', key);
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
