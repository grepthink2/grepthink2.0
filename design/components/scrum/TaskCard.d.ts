import * as React from 'react';
import { TaskTag } from './TagBadge';
import { PRLinkChipProps } from './PointsChip';

export interface TaskMoveAudit {
  /** Column it landed in ("Done"). */
  to: string;
  /** Who moved it. */
  by: string;
  /** When ("2h ago"). */
  at: string;
}

export interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Task key ("GT-12"). */
  taskKey: string;
  /** Parent User Story key ("US-3"). */
  storyKey?: string;
  title: string;
  /** Work-type tags. */
  tags?: TaskTag[];
  points?: number | string;
  /** Time estimate ("4h"). */
  estimate?: string;
  reporter: string;
  assignee: string;
  /** Linked PR/MR chip. */
  pr?: PRLinkChipProps;
  /** Last-move audit line ("Done · Tony Wu · 2h ago"). */
  moved?: TaskMoveAudit;
  commentCount?: number;
  onOpen?: () => void;
}

/**
 * Draggable scrum task card.
 * @startingPoint section="Scrum" subtitle="Task with tags, points, PR link & audit" viewport="700x220"
 */
export function TaskCard(props: TaskCardProps): React.JSX.Element;
