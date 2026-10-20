import * as React from 'react';

export interface UnreadBadgeProps {
  count: number;
  /** Cap shown as "99+". @default 99 */
  max?: number;
  /** Screen-reader text. @default `${count} unread` */
  label?: string;
  /** 8px dot with no number (collapsed sidebar). @default false */
  dot?: boolean;
  className?: string;
}

/** The one unread-count pill (red). Renders nothing at 0. */
export function UnreadBadge(props: UnreadBadgeProps): React.JSX.Element | null;
