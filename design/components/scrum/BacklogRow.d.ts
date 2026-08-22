import * as React from 'react';

export interface BacklogRowProps {
  /** Story key ("US-9"). */
  storyKey: string;
  title: string;
  points?: number | string;
  /** Time estimate ("2d"). */
  estimate?: string;
  reporter?: string;
  assignee?: string;
  /** When it was archived ("Jun 12"). */
  archivedAt?: string;
  /** Shows the restore action. */
  onRestore?: () => void;
  /** @default 'Move to sprint' */
  restoreLabel?: string;
  onOpen?: () => void;
  className?: string;
}

/** Archived / unscheduled User Story row for the backlog list. */
export function BacklogRow(props: BacklogRowProps): React.JSX.Element;
