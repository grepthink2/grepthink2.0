import * as React from 'react';

export interface KbdProps {
  /** Several keycaps rendered side by side (a chord). */
  keys?: React.ReactNode[];
  /** Single keycap content when `keys` is not given. */
  children?: React.ReactNode;
  /** Translucent variant for the green sidebar / dark surfaces. @default false */
  onDark?: boolean;
  className?: string;
}

export function Kbd(props: KbdProps): React.JSX.Element;
/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modKey(): string;
/** Namespace-visible alias of `modKey`. */
export const ModKey: typeof modKey;
