// Intentional addition: Alert — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface AlertProps {
  /** error → `role="alert"` (announced at once); others → `role="status"`. @default 'info' */
  tone?: 'success' | 'warning' | 'error' | 'info';
  /** Bold first line. Visible heading text, never forwarded as the HTML title attribute. */
  title?: React.ReactNode;
  /** Body (a <div>: paragraphs, links). */
  children?: React.ReactNode;
  /** Buttons under the body: `Button size="sm" variant="outline"` (Try again, Restore draft, Discard, Unsend). */
  actions?: React.ReactNode;
  /** Adds a "Dismiss" × for conditions the user may hide. */
  onDismiss?: () => void;
  className?: string;
}

/** Inline alert for a persistent condition. */
export function Alert(props: AlertProps): React.JSX.Element;
