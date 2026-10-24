// Intentional addition: Tag — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  /** Shows a real × button (Tab-reachable) and makes the tag removable. */
  onRemove?: () => void;
  /** Accessible name of the × . @default `Remove ${children}` */
  removeLabel?: string;
  /** @default 'neutral' */
  tone?: 'neutral' | 'green' | 'blue';
}

export function Tag(props: TagProps): React.JSX.Element;
