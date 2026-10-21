import type { HTMLAttributes, ReactNode, Ref } from 'react';
import { X } from 'lucide-react';
import './Tag.scss';

export interface TagProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: ReactNode;
  /** Shows a real × button, in the tab order, that calls this. */
  onRemove?: () => void;
  /** The ×'s accessible name. @default `Remove ${children}` for text children, "Remove tag" otherwise */
  removeLabel?: string;
  /** @default 'neutral' */
  tone?: 'neutral' | 'green' | 'blue';
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Chip for a picked value (skills, Combobox chips, applied filters), ported from
 * design/components/display/Tag.jsx: square-ish corners where a Badge is a pill, neutral, green or
 * blue, long text truncated. With `onRemove` it shows the design's 18px ×: a real `<button>` named
 * "Remove {name}", reachable by Tab, with a 44px hit area on phones. The × calls `onRemove` with no
 * arguments; where focus goes once the tag is gone is the caller's to decide.
 *
 * Native props and `ref` reach the chip's span.
 */
export function Tag({ children, onRemove, removeLabel, tone = 'neutral', className = '', ref, ...rest }: TagProps) {
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : 'tag';
  return (
    <span
      {...rest}
      ref={ref}
      className={['gt-tag', `gt-tag--${tone}`, onRemove ? 'gt-tag--removable' : '', className].filter(Boolean).join(' ')}
    >
      <span className="gt-tag__text">{children}</span>
      {onRemove && (
        <button type="button" className="gt-tag__remove" aria-label={removeLabel || `Remove ${text}`} onClick={() => onRemove()}>
          <X size={10} strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}
