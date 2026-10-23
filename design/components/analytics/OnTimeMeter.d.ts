// Intentional addition: OnTimeMeter — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface OnTimeMeterProps {
  /** 0–1, or null when no deadline fell in the range. */
  rate: number | null;
  late?: number;
  missing?: number;
  expected?: number;
  /** Submissions edited after the deadline (counted separately). */
  editedLate?: number;
  className?: string;
}

/** 8px meter + "82% on time · 14 late · 6 missing · 9 edited late". */
export function OnTimeMeter(props: OnTimeMeterProps): React.JSX.Element;
