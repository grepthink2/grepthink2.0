import type { HTMLAttributes, Ref } from 'react';
import '@/components/CountBadge/CountBadge.scss';

export interface UnreadBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  count: number;
  /** The cap, shown as "99+". @default 99 */
  max?: number;
  /** Screen-reader text. @default `${count} unread` */
  label?: string;
  /** An 8px dot with no number (the collapsed sidebar). @default false */
  dot?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The one unread pill (sidebar, header bell, conversation list, message widget), ported from
 * design/components/display/UnreadBadge.jsx: solid error red, a white bold count, "99+" over `max`.
 * It renders nothing at 0. The number on screen is hidden from screen readers, which hear "3 unread"
 * (the real count, past the cap too) or `label`. Inside a control named by `aria-label`, that name
 * hides this text: put the count in the name ("Notifications, 8 unread"). Its styles are the shared
 * count block in components/CountBadge.
 *
 * Native props and `ref` reach the span.
 */
export function UnreadBadge({ count, max = 99, label, dot = false, className = '', ref, ...rest }: UnreadBadgeProps) {
  if (!(count > 0)) return null;
  const shown = count > max ? `${max}+` : count;
  return (
    <span {...rest} ref={ref} className={['gt-unread', dot ? 'gt-unread--dot' : '', className].filter(Boolean).join(' ')}>
      {!dot && <span aria-hidden="true">{shown}</span>}
      <span className="gt-visually-hidden">{label || `${count} unread`}</span>
    </span>
  );
}
