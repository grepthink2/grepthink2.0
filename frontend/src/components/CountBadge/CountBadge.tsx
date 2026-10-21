import type { HTMLAttributes, Ref } from 'react';
import './CountBadge.scss';

export interface CountBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  count: number;
  /** The cap, shown as "99+". @default 99 */
  max?: number;
  /** Screen-reader text in place of the bare number ("3 pending requests"). */
  label?: string;
  /** Render "0" (tab counts), or nothing at 0. @default true */
  showZero?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The neutral count pill, ported from design/components/display/CountBadge.jsx: tab counts, list
 * totals, "Past (3)". 18px, grey, "99+" over `max`. With `label`, the number is hidden and the label
 * is what a screen reader hears. Unread counts are UnreadBadge, never a coloured CountBadge.
 *
 * Native props and `ref` reach the span.
 */
export function CountBadge({ count, max = 99, label, showZero = true, className = '', ref, ...rest }: CountBadgeProps) {
  if (!showZero && !count) return null;
  const shown = count > max ? `${max}+` : count;
  return (
    <span {...rest} ref={ref} className={['gt-count', className].filter(Boolean).join(' ')}>
      {label ? (
        <>
          <span aria-hidden="true">{shown}</span>
          <span className="gt-visually-hidden">{label}</span>
        </>
      ) : shown}
    </span>
  );
}
