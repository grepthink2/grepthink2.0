import type { HTMLAttributes, Ref } from 'react';
import './Spinner.scss';

export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Diameter in px: 14 in sm buttons, 16 in md buttons and rows, 20 in cards, 24 for a page region. @default 16 */
  size?: 14 | 16 | 20 | 24;
  /** What a screen reader hears, as the text of the `role="status"` wrapper. @default 'Loading' */
  label?: string;
  /** The ring alone, hidden from assistive tech: for a busy Button, which announces itself. @default false */
  decorative?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The one loading indicator, ported from design/components/feedback/Spinner.jsx: a ring in
 * `currentColor` with a transparent quarter, turning every 0.7s (1.6s under reduced motion, never
 * stopped). Use Skeleton instead when the shape of the coming content is known.
 */
export function Spinner({ size = 16, label = 'Loading', decorative = false, className = '', ref, ...rest }: SpinnerProps) {
  const ring = `gt-spinner gt-spinner--${size}`;
  if (decorative) {
    return <span {...rest} ref={ref} className={[ring, className].filter(Boolean).join(' ')} aria-hidden="true" />;
  }
  return (
    <span {...rest} ref={ref} className={['gt-spinner-wrap', className].filter(Boolean).join(' ')} role="status">
      <span className={ring} aria-hidden="true" />
      <span className="gt-visually-hidden">{label}</span>
    </span>
  );
}
