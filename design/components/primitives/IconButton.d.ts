import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed'> {
  children: React.ReactNode;
  /** Required accessible name. Canonical names: "Close" (modal / drawer ×), "Dismiss" (alert, toast, banner), "Remove {name}" (chip). */
  ariaLabel: string;
  /** @default 'ghost' */
  variant?: 'ghost' | 'solid' | 'danger';
  /** 28 / 36 / 44; 44 minimum under 768px. The modal × is `md`. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Toggle state, rendered as `aria-pressed` (chart legend, editor toolbar, password eye). */
  pressed?: boolean;
  /** Hover / focus tooltip: true shows `ariaLabel`, a string shows that text, false hides it. @default true */
  tooltip?: boolean | string;
  /** @default 'top' */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export function IconButton(props: IconButtonProps): React.JSX.Element;
