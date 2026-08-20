import * as React from 'react';

export interface TooltipProps {
  /** Tooltip text/content. */
  content: React.ReactNode;
  /** @default 'top' */
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}

export function Tooltip(props: TooltipProps): React.JSX.Element;
