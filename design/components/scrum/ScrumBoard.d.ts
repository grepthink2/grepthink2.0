import * as React from 'react';
import { TaskCardProps } from './TaskCard';

export type BoardStatus = 'todo' | 'in_progress' | 'done';

export interface BoardTask extends Omit<TaskCardProps, 'onOpen'> {
  /** Stable id used for drag & drop. */
  id: string | number;
  status: BoardStatus;
}

export interface ScrumBoardProps {
  tasks: BoardTask[];
  /**
   * Called when a card is dropped on another column. Update the task's
   * status AND its `moved` audit ({to, by, at}) here.
   */
  onMove?: (taskId: string | number, to: BoardStatus) => void;
  /** Click-through to the task detail. */
  onOpenTask?: (task: BoardTask) => void;
  className?: string;
}

/** The three fixed columns. */
export const BOARD_COLUMNS: { id: BoardStatus; label: string }[];

/**
 * TODO / In Progress / Done board with drag & drop and move auditing.
 * @startingPoint section="Scrum" subtitle="3-column drag & drop board" viewport="1100x520"
 */
export function ScrumBoard(props: ScrumBoardProps): React.JSX.Element;
