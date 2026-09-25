import * as React from 'react';

export interface UnlinkedPRChipProps {
  /** @default 'PR #44' */
  pr?: string;
  onAdd?: () => void;
  /** @default 'Add task' */
  addLabel?: string;
  /** @default 'app' — 'bare' drops all chrome for embedding in another shell */
  surface?: 'app' | 'landing' | 'bare';
  className?: string;
  /** Placement styles (stage positioning). */
  style?: React.CSSProperties;
}

export function UnlinkedPRChip(props: UnlinkedPRChipProps): React.JSX.Element;
