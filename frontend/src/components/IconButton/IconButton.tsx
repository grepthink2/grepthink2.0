import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { useTooltipDismiss } from '@/components/Tooltip/useTooltipDismiss';
import '@/components/Tooltip/Tooltip.scss';
import './IconButton.scss';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed' | 'children'> {
  /** The icon: a lucide icon, which keeps itself out of the accessibility tree. */
  children: ReactNode;
  /** Required accessible name. Canonical names: "Close" (modal / drawer ×), "Dismiss" (alert, toast, banner), "Remove {name}" (chip). */
  ariaLabel: string;
  /** @default 'ghost' */
  variant?: 'ghost' | 'solid' | 'danger';
  /** 28 / 36 / 44; 44 minimum under 768px. The modal × is `md`. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Toggle state, rendered as `aria-pressed` (chart legend, editor toolbar, password eye). */
  pressed?: boolean;
  /**
   * Hover / focus tooltip: true shows `ariaLabel`, a string shows that text, false shows none.
   * Switching it between false and a label while mounted remounts the button. @default true
   */
  tooltip?: boolean | string;
  /** @default 'top' */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Icon-only button, ported from design/components/primitives/IconButton.jsx: toolbar actions, the
 * × of a dialog, overflow menus. `type` defaults to `"button"`; `pressed` makes it a toggle.
 *
 * By default `ariaLabel` also shows as the shared Tooltip's bubble on hover and keyboard focus,
 * composed as the design does it: the Tooltip's classes around the button, and a bubble that is
 * `aria-hidden`, since the label is already the button's name. Esc hides it as it does a Tooltip's,
 * and so does pressing the button, so the first Esc after it opens a menu closes the menu
 * (useTooltipDismiss). There is no bubble while disabled: the wrapper stays, so the button is
 * the same element when it turns disabled and back. `tooltip={false}` drops the wrapper too: for a
 * button inside something that shows a tooltip already, or an absolutely positioned × (the
 * wrapper is an inline span around the button).
 */
export function IconButton({
  children, ariaLabel, variant = 'ghost', size = 'md', disabled = false, pressed, tooltip = true, tooltipSide = 'top',
  type = 'button', className = '', ref, ...rest
}: IconButtonProps) {
  const tip = tooltip === true ? ariaLabel : tooltip;
  const showBubble = !!tip && !disabled;
  const { dismissed, handlers } = useTooltipDismiss(showBubble);
  const button = (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={['gt-icon-button', `gt-icon-button--${variant}`, `gt-icon-button--${size}`, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-pressed={pressed}
      disabled={disabled}
    >
      {children}
    </button>
  );
  if (!tip) return button;
  return (
    <span
      className={['gt-icon-tip', 'gt-tooltip', dismissed ? 'gt-tooltip--dismissed' : ''].filter(Boolean).join(' ')}
      {...(showBubble ? handlers : {})}
    >
      {button}
      {showBubble && <span className={`gt-tooltip__bubble gt-tooltip__bubble--${tooltipSide}`} aria-hidden="true">{tip}</span>}
    </span>
  );
}
