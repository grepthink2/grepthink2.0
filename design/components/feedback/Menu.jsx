import React from 'react';

const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)';
const Check = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;

/**
 * Action list inside a Popover. Dense 32px rows (44 on phones), ↑ ↓ Home End move, Enter
 * activates, Esc closes. `autoFocus` focuses the first item on mount; `autoFocus="checked"`
 * focuses the checked row (a single-choice menu opens on the current choice) — adopted from the
 * codebase, as are the `checked` / `radio` rows.
 */
export function Menu({ children, onClose, ariaLabel, autoFocus = false, className = '', ...rest }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll(ITEMS));
    const checked = autoFocus === 'checked' ? items.find((el) => el.getAttribute('aria-checked') === 'true') : undefined;
    const target = checked || items[0];
    if (target) target.focus();
  }, [autoFocus]);
  const onKeyDown = (e) => {
    if (!ref.current) return;
    const items = Array.from(ref.current.querySelectorAll(ITEMS));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] || items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] || items[items.length - 1]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape' && onClose) onClose();
  };
  return (
    <div ref={ref} role="menu" aria-label={ariaLabel} className={['gt-menu', className].filter(Boolean).join(' ')} onKeyDown={onKeyDown} {...rest}>
      {children}
    </div>
  );
}

/**
 * One row. `checked` makes it a `menuitemcheckbox` (multi-select lists: labels); with `radio`
 * a `menuitemradio` (one choice: the scrum board's sprint picker). Checkable rows without an
 * icon show a check slot, so the state is not colour alone.
 */
export function MenuItem({ icon, children, shortcut, destructive = false, disabled = false, checked, radio = false, onSelect, className = '', ...rest }) {
  const checkable = checked !== undefined;
  return (
    <button
      type="button"
      role={checkable ? (radio ? 'menuitemradio' : 'menuitemcheckbox') : 'menuitem'}
      aria-checked={checkable ? !!checked : undefined}
      className={['gt-menu__item', destructive ? 'gt-menu__item--destructive' : '', checkable && checked ? 'gt-menu__item--checked' : '', className].filter(Boolean).join(' ')}
      disabled={disabled}
      onClick={onSelect}
      {...rest}
    >
      {icon ? <span className="gt-menu__icon">{icon}</span> : checkable && <span className="gt-menu__check">{checked ? <Check /> : null}</span>}
      <span className="gt-menu__label">{children}</span>
      {shortcut && <span className="gt-menu__shortcut">{shortcut}</span>}
    </button>
  );
}

/** Thin rule between item groups. */
export function MenuSeparator() {
  return <div className="gt-menu__sep" role="separator" />;
}
