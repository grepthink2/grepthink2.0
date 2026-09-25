import * as React from 'react';

export interface StalledFlagProps {
  taskKey: string;
  title: string;
  /** Column the task is stuck in. @default 'In Progress' */
  status?: string;
  /** @default 6 */
  days?: number;
  /** Evidence fragment after the dot. @default 'no commits' */
  detail?: string;
  /** First name for the nudge action; omit to hide it. */
  assignee?: string;
  onNudge?: () => void;
  /** @default 'app' */
  surface?: 'app' | 'landing';
  className?: string;
  /** Placement styles (stage positioning). */
  style?: React.CSSProperties;
}

export function StalledFlag(props: StalledFlagProps): React.JSX.Element;
