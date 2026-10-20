import { useId, type ReactNode } from 'react';
import { useTooltipDismiss } from './useTooltipDismiss';
import './Tooltip.scss';

export interface TooltipProps {
  /** One short line. */
  content: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Whether the trigger joins the tab order so keyboard users can reveal the bubble.
   * Pass false when the trigger sits inside another control (a card that is itself a
   * button, say): a focusable span there is nested interactive content, and the
   * bubble's text is already part of that control's accessible name.
   */
  focusable?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Hover/focus tooltip, ported from design/components/display/Tooltip.jsx: a dark bubble,
 * small and quiet, shown instantly by CSS instead of after the browser's `title` delay, while
 * the tooltip is hovered or anything inside it has keyboard focus.
 *
 * Codebase addition: Esc hides an open bubble until the next hover or focus, without closing a
 * dialog or popover around it (useTooltipDismiss).
 */
export function Tooltip({ content, side = 'top', focusable = true, children, className = '' }: TooltipProps) {
  const id = useId();
  const { dismissed, handlers } = useTooltipDismiss();
  return (
    <span
      className={['gt-tooltip', dismissed ? 'gt-tooltip--dismissed' : '', className].filter(Boolean).join(' ')}
      {...handlers}
    >
      <span className="gt-tooltip__trigger" tabIndex={focusable ? 0 : undefined} aria-describedby={id}>
        {children}
      </span>
      <span className={`gt-tooltip__bubble gt-tooltip__bubble--${side}`} role="tooltip" id={id}>
        {content}
      </span>
    </span>
  );
}
