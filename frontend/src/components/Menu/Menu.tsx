import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import './Menu.scss';

const ITEMS = '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled)';

export interface MenuProps extends HTMLAttributes<HTMLDivElement> {
  onClose?: () => void;
  ariaLabel: string;
  /** Focus the first item on mount: right for a menu opened from a button. */
  autoFocus?: boolean;
}

/**
 * Action list inside a Popover, ported from design/components/feedback/Menu.jsx. Dense
 * ~32px rows, arrow-key navigation, Enter activates, Esc closes.
 */
export function Menu({ children, onClose, ariaLabel, autoFocus = false, className = '', ...rest }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.querySelector<HTMLElement>(ITEMS)?.focus();
  }, [autoFocus]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(ITEMS));
    if (!items.length) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); (items[i + 1] ?? items[0]).focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (items[i - 1] ?? items[items.length - 1]).focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Escape') { onClose?.(); }
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      className={['gt-menu', className].filter(Boolean).join(' ')}
      onKeyDown={onKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface MenuItemProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onSelect'> {
  icon?: ReactNode;
  shortcut?: string;
  destructive?: boolean;
  disabled?: boolean;
  /**
   * Makes the row a `menuitemcheckbox` for multi-select lists (labels). Not in the
   * design's Menu, which only has actions; recorded as an intentional addition.
   */
  checked?: boolean;
  onSelect?: () => void;
}

/** Single action row. */
export function MenuItem({
  icon, children, shortcut, destructive = false, disabled = false, checked, onSelect,
  className = '', ...rest
}: MenuItemProps) {
  const checkable = checked !== undefined;
  return (
    <button
      type="button"
      role={checkable ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={checkable ? checked : undefined}
      className={[
        'gt-menu__item',
        destructive ? 'gt-menu__item--destructive' : '',
        checkable && checked ? 'gt-menu__item--checked' : '',
        className,
      ].filter(Boolean).join(' ')}
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
