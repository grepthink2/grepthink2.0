import * as React from 'react';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  /** Shows an × button and makes the tag removable. */
  onRemove?: () => void;
  /** @default 'neutral' */
  tone?: 'neutral' | 'green' | 'blue';
}

export function Tag(props: TagProps): React.JSX.Element;
