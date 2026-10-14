import * as React from 'react';

export interface DefinitionPopoverProps {
  /** @default 'How this is counted' */
  title?: string;
  /** Plain-language definition, sentence case. */
  body: React.ReactNode;
  learnMoreHref?: string;
  /** @default 'bottom' */
  placement?: 'top' | 'bottom';
  /** @default 'start' */
  align?: 'start' | 'end';
  className?: string;
}

/** ⓘ trigger + 320px definition popover (Popover surface, Esc/outside-click close). */
export function DefinitionPopover(props: DefinitionPopoverProps): React.JSX.Element;
