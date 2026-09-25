import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  children: React.ReactNode;
  /** Required accessible label — icon buttons have no visible text. */
  ariaLabel: string;
  /** @default 'ghost' */
  variant?: 'ghost' | 'solid' | 'danger';
  /** @default 'md' */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
}

export function IconButton(props: IconButtonProps): React.JSX.Element;
