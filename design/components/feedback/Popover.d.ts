import * as React from 'react';

export interface PopoverProps {
  /** Controlled visibility. */
  open: boolean;
  /** Called on Esc or outside click. */
  onClose?: () => void;
  /** Trigger element rendered inside the anchor wrapper. */
  anchor?: React.ReactNode;
  /** Side of the anchor, 6px offset. @default 'bottom' */
  placement?: 'top' | 'bottom';
  /** Horizontal alignment against the anchor. @default 'start' */
  align?: 'start' | 'end';
  /** 'sm' = radius 7 + tighter padding. @default 'md' */
  size?: 'md' | 'sm';
  /** false removes padding (used by Menu). @default true */
  padded?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Anchored floating surface primitive (white, 1px border, radius 10,
 * pop shadow). Enter = 6px slide + fade 0.15s; never traps focus.
 */
export function Popover(props: PopoverProps): React.JSX.Element;
