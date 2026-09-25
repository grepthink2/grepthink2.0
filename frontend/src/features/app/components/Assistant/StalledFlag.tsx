import React from 'react';
import type { AssistantSurface } from './AssistantSuggestionCard';
import './Assistant.scss';

export interface StalledFlagProps {
  taskKey: string;
  title: string;
  /** Column the task is stuck in. @default 'In Progress' */
  status?: string;
  /** @default 6 */
  days?: number;
  /** Evidence after the dot. @default 'no commits' */
  detail?: string;
  /** First name for the nudge action; omit to hide it. */
  assignee?: string;
  onNudge?: () => void;
  /** @default 'app' */
  surface?: AssistantSurface;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A task that has sat in one column with no repository activity. It states facts (days,
 * commits), never blame, and offers a nudge.
 */
export const StalledFlag: React.FC<StalledFlagProps> = ({
  taskKey,
  title,
  status = 'In Progress',
  days = 6,
  detail = 'no commits',
  assignee,
  onNudge,
  surface = 'app',
  className,
  style,
}) => (
  <div
    style={style}
    className={['gt-asst', 'gt-asst-stalled', `gt-asst--${surface}`, className]
      .filter(Boolean)
      .join(' ')}
    role="group"
    aria-label={`Stalled: ${taskKey}`}
  >
    <span className="gt-asst-stalled__label">
      <i aria-hidden="true" />
      Stalled
    </span>
    <h4 className="gt-asst-stalled__title">
      <code>{taskKey}</code>
      {title}
    </h4>
    <p className="gt-asst-stalled__detail">
      {status} for {days} {days === 1 ? 'day' : 'days'} · {detail}
    </p>
    {assignee && (
      <button type="button" className="gt-asst__link" onClick={onNudge}>
        Nudge {assignee} →
      </button>
    )}
  </div>
);
