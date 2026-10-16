import { useEffect, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import './Menu.scss';

const ITEMS = [
  '[role="menuitem"]:not(:disabled)',
  '[role="menuitemcheckbox"]:not(:disabled)',
  '[role="menuitemradio"]:not(:disabled)',
].join(', ');

export interface MenuProps extends Omit<HTMLAttributes<HTMLDivElement>, 'autoFocus'> {
  onClose?: () => void;
  ariaLabel: string;
  /**
   * Focus the first item on mount: right for a menu opened from a button. `'checked'` focuses
   * the checked row instead (the first item when none is): a single-choice menu opens on the
   * current choice. `'checked'` is an addition to the design's Menu, like `checked` below.
   */
  autoFocus?: boolean | 'checked';
}

/**
 * Action list inside a Popover, ported from design/components/feedback/Menu.jsx. Dense
 * ~32px rows, arrow-key navigation, Enter activates, Esc closes.
 */
export function Menu({ children, onClose, ariaLabel, autoFocus = false, className = '', ...rest }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(ITEMS));
    const checked = autoFocus === 'checked'
      ? items.find((el) => el.getAttribute('aria-checked') === 'true')
      : undefined;
    (checked ?? items[0])?.focus();
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
  /**
   * With `checked`, makes the row a `menuitemradio` instead: one choice in the menu (the
   * scrum board's sprint picker). Also not in the design's Menu; the same recorded addition.
   */
  radio?: boolean;
  onSelect?: () => void;
}

/** Single action row. */
export function MenuItem({
  icon, children, shortcut, destructive = false, disabled = false, checked, radio = false, onSelect,
  className = '', ...rest
}: MenuItemProps) {
  const checkable = checked !== undefined;
  const checkableRole = radio ? 'menuitemradio' : 'menuitemcheckbox';
  return (
    <button
      type="button"
      role={checkable ? checkableRole : 'menuitem'}
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
