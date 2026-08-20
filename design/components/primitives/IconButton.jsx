import React from 'react';

/**
 * Icon-only button (toolbar actions, close, overflow menus).
 * Always pass `ariaLabel` for accessibility.
 */
export function IconButton({
  children,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  ...rest
}) {
  const cls = [
    'gt-icon-button',
    `gt-icon-button--${variant}`,
    `gt-icon-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={cls}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
}
