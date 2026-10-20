import * as React from 'react';

export interface SpinnerProps {
  /** Diameter in px. 14 in sm buttons, 16 in md buttons and rows, 20 in cards, 24 for a page region. @default 16 */
  size?: 14 | 16 | 20 | 24;
  /** Screen-reader text inside the `role="status"` wrapper. @default 'Loading' */
  label?: string;
  /** Ring only, `aria-hidden` — for a busy Button, which already announces itself. @default false */
  decorative?: boolean;
  className?: string;
}

/**
 * The one loading indicator. Use Skeleton instead when the shape of the coming content is known.
 */
export function Spinner(props: SpinnerProps): React.JSX.Element;
