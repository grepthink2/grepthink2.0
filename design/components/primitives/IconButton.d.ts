// Intentional addition: IconButton — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'aria-pressed'> {
  children: React.ReactNode;
  /** Required accessible name. Canonical names: "Close" (modal / drawer ×), "Dismiss" (alert, toast, banner), "Remove {name}" (chip). */
  ariaLabel: string;
  /** Set from `ariaLabel` and `pressed`. JSX takes any hyphenated prop a type leaves out, so both are declared `never` (adopted from the codebase). */
  'aria-label'?: never;
  'aria-pressed'?: never;
  /** @default 'ghost' */
  variant?: 'ghost' | 'solid' | 'danger';
  /** 28 / 36 / 44; 44 minimum under 768px. The modal × is `md`. @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Toggle state, rendered as `aria-pressed` (chart legend, editor toolbar, password eye). */
  pressed?: boolean;
  /** Hover / focus tooltip: true shows `ariaLabel`, a string shows that text, false drops the wrapper. While disabled the wrapper stays with no bubble, so the button stays the same element. @default true */
  tooltip?: boolean | string;
  /** @default 'top' */
  tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
}

export function IconButton(props: IconButtonProps): React.JSX.Element;
