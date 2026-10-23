import React from 'react';
import { useTooltipDismiss } from '../display/Tooltip.jsx';

/**
 * Icon-only button (toolbar actions, close, overflow menus). `ariaLabel` is required and, by
 * default, also shows as a Tooltip on hover and keyboard focus (the bubble is aria-hidden: the
 * label is already the name). `pressed` makes it a toggle (`aria-pressed`). `aria-label` and
 * `aria-pressed` are set from `ariaLabel` / `pressed` after the caller's props, so nothing overrides them.
 * Esc hides the bubble, and so does pressing the button (useTooltipDismiss), so the first Esc after it
 * opens a menu closes the menu. While disabled there is no bubble, but the `gt-icon-tip gt-tooltip`
 * wrapper stays, so the button is the same element when it turns disabled and back (adopted from the
 * codebase, PR #259). `tooltip={false}` drops the wrapper too.
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
  type = 'button',
  className = '',
  ...rest
}) {
  const tip = tooltip === true ? ariaLabel : tooltip;
  const showBubble = !!tip && !disabled;
  const { dismissed, handlers } = useTooltipDismiss(showBubble);
  const cls = ['gt-icon-button', `gt-icon-button--${variant}`, `gt-icon-button--${size}`, className].filter(Boolean).join(' ');
  const btn = (
    <button
      {...rest}
      type={type}
      className={cls}
      aria-label={ariaLabel}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      disabled={disabled}
    >
      {children}
    </button>
  );
  if (!tip) return btn;
  return (
    <span className={['gt-icon-tip gt-tooltip', dismissed ? 'gt-tooltip--dismissed' : ''].filter(Boolean).join(' ')} {...(showBubble ? handlers : {})}>
      {btn}
      {showBubble && <span className={`gt-tooltip__bubble gt-tooltip__bubble--${tooltipSide}`} aria-hidden="true">{tip}</span>}
    </span>
  );
}
