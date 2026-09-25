import React from 'react';
import { AssistantMark } from './AssistantIcon.jsx';

const Check = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * A board change the assistant proposes from repository evidence.
 * States: pending (Approve / Dismiss) → approved (collapsed confirmation)
 * or dismissed (muted line + Undo). Nothing changes until a person approves.
 * `surface="app"` is the flat in-app card; `surface="landing"` is the
 * floating marketing shell.
 */
export function AssistantSuggestionCard({
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
  className = '',
  style,
}) {
  return (
    <div style={style} className={['gt-asst', 'gt-asst-suggest', `gt-asst--${surface}`, `gt-asst-suggest--${state}`, className].filter(Boolean).join(' ')} role="group" aria-label="Project assistant suggestion">
      <div className="gt-asst__head">
        <span className="gt-asst__author"><AssistantMark />Project assistant</span>
        {time && <span className="gt-asst__time">{time}</span>}
      </div>

      {state === 'pending' && (
        <div className="gt-asst__body">
          <p className="gt-asst-suggest__text">{evidence} {question}</p>
          {taskKey && (
            <div className="gt-asst-suggest__task">
              <code className="gt-asst-suggest__key">{taskKey}</code>
              <span className="gt-asst-suggest__title">{taskTitle}</span>
              <span className="gt-asst-suggest__to">→ {target}</span>
            </div>
          )}
          <div className="gt-asst__actions">
            <button type="button" className="gt-asst__btn gt-asst__btn--ok" onClick={onApprove}>Approve</button>
            <button type="button" className="gt-asst__btn gt-asst__btn--no" onClick={onDismiss}>Dismiss</button>
          </div>
        </div>
      )}

      {state === 'approved' && (
        <div className="gt-asst-suggest__done" role="status">
          <Check />{taskKey} moved to {target} · approved by {approvedBy}
        </div>
      )}

      {state === 'dismissed' && (
        <div className="gt-asst-suggest__dismissed" role="status">
          Suggestion dismissed
          {onUndo && <button type="button" className="gt-asst__link" onClick={onUndo}>Undo</button>}
        </div>
      )}
    </div>
  );
}
