// Intentional addition: CountBadge — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface CountBadgeProps {
  count: number;
  /** Cap shown as "99+". @default 99 */
  max?: number;
  /** Screen-reader text replacing the bare number ("3 pending"). */
  label?: string;
  /** Render "0" (tab counts) or nothing. @default true */
  showZero?: boolean;
  className?: string;
}

/** Neutral count pill (tab counts, list totals). */
export function CountBadge(props: CountBadgeProps): React.JSX.Element | null;
