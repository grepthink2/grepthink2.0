// Intentional addition: ScheduleDivider — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ScheduleItemData } from './ScheduleModel';

export interface ScheduleDividerProps {
  /** A kind 'sprint' item — its `sprint` field is read. */
  item?: ScheduleItemData;
  /** Or the edge directly. */
  sprint?: { name: string; edge: 'start' | 'end' };
  /** Appends " today" ("Sprint 2 ends today"). @default false */
  isToday?: boolean;
  className?: string;
}

/** Sprint start/end rule — dashed hairline with an inline muted label. Never a row. */
export function ScheduleDivider(props: ScheduleDividerProps): React.JSX.Element;
