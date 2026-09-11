import * as React from 'react';

export interface AlertProps {
  /** @default 'info' */
  tone?: 'success' | 'warning' | 'error' | 'info';
  /** Bold first line. */
  title?: string;
  /** Body text. */
  children?: React.ReactNode;
  /** Shows the × dismiss. */
  onDismiss?: () => void;
  className?: string;
}

/** Inline alert using the semantic soft/text pairs. Floating notices: see Toast. */
export function Alert(props: AlertProps): React.JSX.Element;
