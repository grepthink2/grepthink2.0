// Intentional addition: InfoPopover — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface InfoPopoverProps {
  /** Panel heading; also the trigger's name unless `label` is set. */
  title: string;
  body: React.ReactNode;
  /** Adds a "Learn more" link. */
  learnMoreHref?: string;
  /** Accessible name of the ⓘ ("About TSRs submitted"). @default title */
  label?: string;
  /** @default 'bottom' */
  placement?: 'bottom' | 'top';
  /** @default 'start' */
  align?: 'start' | 'end';
  className?: string;
}

/** ⓘ trigger + explanation panel (click / Enter, Esc closes). */
export function InfoPopover(props: InfoPopoverProps): React.JSX.Element;
