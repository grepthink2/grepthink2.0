import React from 'react';

/**
 * Action list inside a Popover. Dense ~32px rows, arrow-key navigation,
 * Enter activates, Esc closes.
 */
export function Menu({ children, onClose, ariaLabel, autoFocus = false, className = '', ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (autoFocus && ref.current) {
      const first = ref.current.querySelector('[role="menuitem"]:not(:disabled)');
      if (first) first.focus();
    }
  }, [autoFocus]);
  const onKeyDown = (e) => {
    if (!ref.current) return;
    const items = Array.from(ref.current.querySelectorAll('[role="menuitem"]:not(:disabled)'));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { onClose && onClose(); }
  };
  return (
    <div ref={ref} role="menu" aria-label={ariaLabel} className={['gt-menu', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown} {...rest}>
      {children}
    </div>
  );
}

/** Single action row. */
export function MenuItem({ icon, children, shortcut, destructive = false, disabled = false, onSelect, className = '', ...rest }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={['gt-menu__item', destructive ? 'gt-menu__item--destructive' : '', className].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onSelect}
      {...rest}
    >
      {icon && <span className="gt-menu__icon">{icon}</span>}
      <span className="gt-menu__label">{children}</span>
      {shortcut && <span className="gt-menu__shortcut">{shortcut}</span>}
    </button>
  );
}

/** Thin rule between item groups. */
export function MenuSeparator() {
  return <div className="gt-menu__sep" role="separator" />;
}
