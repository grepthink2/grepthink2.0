// Intentional addition: SplitBar — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface SplitBarSegment {
  key: string;
  label: string;
  value: number;
  /** Scope note shown after the count, e.g. "school-wide". */
  note?: string;
}

export interface SplitBarProps {
  /** Exactly two segments, in slot order (green, blue). */
  segments: SplitBarSegment[];
  /** True when the segments no longer share a denominator (class selected) — renders two stat lines instead of a bar. @default false */
  mixedScope?: boolean;
  className?: string;
}

/** Part-to-whole with two parts as one horizontal bar — never a pie. */
export function SplitBar(props: SplitBarProps): React.JSX.Element;
