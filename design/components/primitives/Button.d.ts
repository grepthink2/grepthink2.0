import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  /** Visual style. @default 'primary' */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  /** Shows a spinner and blocks clicks. @default false */
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to container width. @default false */
  fullWidth?: boolean;
  /** Icon element rendered before the label. */
  iconLeft?: React.ReactNode;
  /** Icon element rendered after the label. */
  iconRight?: React.ReactNode;
}

/**
 * Primary action button for GrepThink.
 * @startingPoint section="Primitives" subtitle="Buttons — primary, secondary, ghost, danger" viewport="700x220"
 */
export function Button(props: ButtonProps): React.JSX.Element;
