import * as React from 'react';

export interface AssignmentCardProps {
  name: string;
  /** Formatted due date ("Jan 18, 2026"). */
  due: string;
  /** Project the assignment belongs to. */
  project?: string;
  /** @default 'not_started' */
  status?: 'not_started' | 'in_progress' | 'submitted' | 'due_soon' | 'closed';
  /** Start / Continue / Edit Submission click. */
  onAction?: () => void;
  className?: string;
}

export function AssignmentCard(props: AssignmentCardProps): React.JSX.Element;
