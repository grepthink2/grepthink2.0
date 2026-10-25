import type { HTMLAttributes, Ref } from 'react';
import './NewDot.scss';

export interface NewDotProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'aria-hidden'> {
  /**
   * A 2px ring in the surface behind the dot (`--gt-new-dot-ring`, default `--gt-surface`), for a dot over an
   * avatar or an icon's corner. A dark host re-colours it from its own class. @default false
   */
  ring?: boolean;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * The "new" dot, ported from design/components/display/NewDot.jsx: something new to read (release
 * notes), never unread messages. Blue (`--gt-new-dot`, informational under the status rule), 8px and
 * decorative: it is `aria-hidden`, and its host carries the words, a visually hidden "New release
 * notes" that the control is described by, so the control's name never changes. Position it from the
 * host's own class. Not UnreadBadge, which is red and carries a count.
 *
 * Native props and `ref` reach the span.
 */
export function NewDot({ ring = false, className = '', ref, ...rest }: NewDotProps) {
  return (
    <span
      {...rest}
      ref={ref}
      className={['gt-new-dot', ring ? 'gt-new-dot--ring' : '', className].filter(Boolean).join(' ')}
      aria-hidden="true"
    />
  );
}
