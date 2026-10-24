// Intentional addition: SearchTrigger — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface SearchTriggerProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  /** Visible label. @default 'Search' */
  label?: string;
  /** Opens the CommandPalette. */
  onOpen?: () => void;
  /** 40px icon-only form for phone headers. @default false */
  iconOnly?: boolean;
}

/**
 * Header button that opens the global ⌘K search.
 * @startingPoint section="Search" subtitle="Header trigger for the ⌘K palette" viewport="700x120"
 */
export function SearchTrigger(props: SearchTriggerProps): React.JSX.Element;
