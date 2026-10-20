import * as React from 'react';

export interface TooltipProps {
  /** One short line. */
  content: React.ReactNode;
  /** @default 'top' */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Whether the trigger joins the tab order. Pass false inside another control (a card that is a
   * button): a focusable span there is nested interactive content. Adopted from the codebase. @default true
   */
  focusable?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Hover / focus tooltip. */
export function Tooltip(props: TooltipProps): React.JSX.Element;
