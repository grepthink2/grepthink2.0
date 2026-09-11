import * as React from 'react';

export type TaskTag = 'backend' | 'frontend' | 'ui/ux' | 'infra' | 'design' | 'research' | 'bug' | 'chore' | 'optimization' | 'docs';

export interface TagBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tag: TaskTag;
  /** Shows an × and makes the tag removable. */
  onRemove?: () => void;
}

/** The 10 preset work tags, in canonical order. */
export const TASK_TAGS: TaskTag[];
export function TagBadge(props: TagBadgeProps): React.JSX.Element;
