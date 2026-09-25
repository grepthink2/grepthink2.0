import * as React from 'react';

export interface RankedProjectSlotProps {
  /** 1-based rank shown in the leading chip. */
  rank: number;
  /** Project name; omit for an empty (dashed) slot. */
  project?: string;
  team?: string;
  /** Omit to disable the up control (rank 1). */
  onMoveUp?: () => void;
  /** Omit to disable the down control (last rank). */
  onMoveDown?: () => void;
  onRemove?: () => void;
  /** @default 'Drag a project here or pick from the list' */
  emptyLabel?: string;
  className?: string;
}

export function RankedProjectSlot(props: RankedProjectSlotProps): React.JSX.Element;
