import React from 'react';
import { Check } from 'lucide-react';
import { AssistantMark } from './AssistantIcon';
import './Assistant.scss';

export type AssistantSurface = 'app' | 'landing';

export interface AssistantSuggestionCardProps {
  /** @default 'pending' */
  state?: 'pending' | 'approved' | 'dismissed';
  /** The evidence sentence, e.g. <>PR <b>#41</b> was merged into main.</>. Shown while pending. */
  evidence?: React.ReactNode;
  /** @default 'Move this task to Done?' */
  question?: React.ReactNode;
  /** Task key shown in the chip and the confirmation line. */
  taskKey?: string;
  taskTitle?: string;
  /** Target column. @default 'Done' */
  target?: string;
  /** @default 'just now' */
  time?: string;
  /** Who approved, for the confirmation line. @default 'you' */
  approvedBy?: string;
  onApprove?: () => void;
  onDismiss?: () => void;
  /** Offered in the dismissed state when provided. */
  onUndo?: () => void;
  /** 'app' is the flat in-app card; 'landing' is the floating marketing shell. @default 'app' */
  surface?: AssistantSurface;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * A board change the Project assistant proposes from repository evidence. Nothing changes
 * until a person approves: pending (Approve / Dismiss) collapses to a confirmation line, or to
 * a muted "dismissed" line with Undo.
 */
export const AssistantSuggestionCard: React.FC<AssistantSuggestionCardProps> = ({
  state = 'pending',
  evidence,
  question = 'Move this task to Done?',
  taskKey,
  taskTitle,
  target = 'Done',
  time = 'just now',
  approvedBy = 'you',
  onApprove,
  onDismiss,
  onUndo,
  surface = 'app',
  className,
  style,
}) => (
  <div
    style={style}
    className={[
      'gt-asst',
      'gt-asst-suggest',
      `gt-asst--${surface}`,
      `gt-asst-suggest--${state}`,
      className,
    ]
      .filter(Boolean)
      .join(' ')}
    role="group"
    aria-label="Project assistant suggestion"
  >
    <div className="gt-asst__head">
      <span className="gt-asst__author">
        <AssistantMark />
        Project assistant
      </span>
      {time && <span className="gt-asst__time">{time}</span>}
    </div>

    {state === 'pending' && (
      <div className="gt-asst__body">
        <p className="gt-asst-suggest__text">
          {evidence} {question}
        </p>
        {taskKey && (
          <div className="gt-asst-suggest__task">
            <code className="gt-asst-suggest__key">{taskKey}</code>
            <span className="gt-asst-suggest__title">{taskTitle}</span>
            <span className="gt-asst-suggest__to">→ {target}</span>
          </div>
        )}
        <div className="gt-asst__actions">
          <button type="button" className="gt-asst__btn gt-asst__btn--ok" onClick={onApprove}>
            Approve
          </button>
          <button type="button" className="gt-asst__btn gt-asst__btn--no" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    )}

    {state === 'approved' && (
      <div className="gt-asst-suggest__done" role="status">
        <Check size={15} strokeWidth={2.6} />
        {taskKey} moved to {target} · approved by {approvedBy}
      </div>
    )}

    {state === 'dismissed' && (
      <div className="gt-asst-suggest__dismissed" role="status">
        Suggestion dismissed
        {onUndo && (
          <button type="button" className="gt-asst__link" onClick={onUndo}>
            Undo
          </button>
        )}
      </div>
    )}
  </div>
);
