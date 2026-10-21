import * as React from 'react';

export interface TooltipProps {
  /** One short line. */
  content: React.ReactNode;
  /** @default 'top' */
  side?: 'top' | 'bottom' | 'left' | 'right';
  /**
   * Whether the trigger joins the tab order. Pass false inside another control (a card that is a
   * button): a focusable span there is nested interactive content. Adopted from the codebase. @default true
   */
  focusable?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Hover / focus tooltip; Esc hides an open bubble (WCAG 1.4.13). */
export function Tooltip(props: TooltipProps): React.JSX.Element;
/**
 * Esc-to-dismiss for a `.gt-tooltip` wrapper (Tooltip and IconButton's built-in tooltip): spread
 * `handlers` on the wrapper and add `gt-tooltip--dismissed` while `dismissed`. Esc is heard on `window`
 * in the capture phase and stopped only while a bubble is up; a mouse / pen press or Enter / Space on
 * the control also hides it (a touch press does not); it comes back when the pointer enters again or
 * focus arrives by keyboard. Pass `enabled` false while there is no bubble (a disabled IconButton).
 */
export function useTooltipDismiss(enabled?: boolean): {
  dismissed: boolean;
  handlers: {
    onPointerEnter: () => void;
    onPointerLeave: () => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onFocus: () => void;
    onBlur: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  };
};
