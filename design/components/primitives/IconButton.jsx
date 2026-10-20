import React from 'react';

/**
 * Icon-only button (toolbar actions, close, overflow menus). `ariaLabel` is required and, by
 * default, also shows as a Tooltip on hover and keyboard focus (the bubble is aria-hidden: the
 * label is already the name). `pressed` makes it a toggle (`aria-pressed`).
 * The × of a modal or drawer is `<IconButton ariaLabel="Close">`; dismissing an alert, toast or
 * banner is "Dismiss"; removing a chip is "Remove {name}".
 */
export function IconButton({
  children,
  ariaLabel,
  variant = 'ghost',
  size = 'md',
  disabled = false,
  pressed,
  tooltip = true,
  tooltipSide = 'top',
  onClick,
  className = '',
  ...rest
}) {
  const cls = ['gt-icon-button', `gt-icon-button--${variant}`, `gt-icon-button--${size}`, className].filter(Boolean).join(' ');
  const btn = (
    <button
      type="button"
      className={cls}
      aria-label={ariaLabel}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      {children}
    </button>
  );
  const tip = tooltip === true ? ariaLabel : tooltip;
  if (!tip || disabled) return btn;
  return (
    <span className="gt-icon-tip gt-tooltip">
      {btn}
      <span className={`gt-tooltip__bubble gt-tooltip__bubble--${tooltipSide}`} aria-hidden="true">{tip}</span>
    </span>
  );
}
