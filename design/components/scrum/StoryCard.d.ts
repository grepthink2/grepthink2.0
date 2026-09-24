import * as React from 'react';

export interface StoryCardProps {
  /** Story key ("US-3"). */
  storyKey: string;
  title: string;
  /** Story points (sum or estimated). */
  points: number | string;
  /** Time estimate ("2d"). */
  estimate: string;
  reporter: string;
  assignee: string;
  /** Child tasks completed. @default 0 */
  tasksDone?: number;
  /** @default 0 */
  tasksTotal?: number;
  /** Completed points, shown as "n/points pts". */
  pointsDone?: number;
  /** Highlight as the selected story. @default false */
  active?: boolean;
  /** Open the story detail (description, comments, tasks). */
  onOpen?: () => void;
  className?: string;
}

/**
 * User Story card with task rollup.
 * @startingPoint section="Scrum" subtitle="User Story with points, estimate & rollup" viewport="700x200"
 */
export function StoryCard(props: StoryCardProps): React.JSX.Element;
