import { useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';
import './Popover.scss';

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  open?: boolean;
  onClose?: () => void;
  /** The control the surface hangs off; rendered whether or not it is open. */
  anchor?: ReactNode;
  placement?: 'bottom' | 'top';
  align?: 'start' | 'end';
  size?: 'sm' | 'md';
  /** false for a Menu, which brings its own padding. */
  padded?: boolean;
  children?: ReactNode;
}

/**
 * Anchored floating surface, ported from design/components/feedback/Popover.jsx: the
 * primitive Menu and MentionListbox compose on. Positions above or below its anchor with
 * a 6px offset, closes on Esc or an outside click, and never traps focus.
 *
 * One addition: an open popover takes Esc in the capture phase and stops it there, so a
 * popover inside a modal closes on its own instead of taking the modal down with it
 * (both listen on `document`, and the modal registered first).
 */
export function Popover({
  open = false,
  onClose,
  anchor = null,
  placement = 'bottom',
  align = 'start',
  size = 'md',
  padded = true,
  className = '',
  children,
  ...rest
}: PopoverProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose?.();
    };
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose?.();
    };
    document.addEventListener('keydown', key, true);
    document.addEventListener('mousedown', down);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('mousedown', down);
    };
  }, [open, onClose]);

  return (
    <span className="gt-popover-anchor" ref={ref}>
      {anchor}
      {open && (
        <div
          className={[
            'gt-popover',
            `gt-popover--${placement}`,
            `gt-popover--${align}`,
            size === 'sm' ? 'gt-popover--sm' : '',
            padded ? '' : 'gt-popover--flush',
            className,
          ].filter(Boolean).join(' ')}
          {...rest}
        >
          {children}
        </div>
      )}
    </span>
  );
}
