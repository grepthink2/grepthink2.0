import React from 'react';
import { PointsChip, EstimateChip, UserPair } from './PointsChip.jsx';

/**
 * Backlog row — archived / not-yet-scheduled User Story. Dense list
 * row with points, estimate, reporter → assignee and restore actions.
 */
export function BacklogRow({
  storyKey,
  title,
  points,
  estimate,
  reporter,
  assignee,
  archivedAt,
  onRestore,
  restoreLabel = 'Move to sprint',
  onOpen,
  className = '',
}) {
  return (
    <div className={['gt-backlog-row', className].filter(Boolean).join(' ')}>
      <span className="gt-backlog-row__key">{storyKey}</span>
      <button type="button" className="gt-backlog-row__title" onClick={onOpen}>{title}</button>
      {archivedAt && <span className="gt-backlog-row__archived">archived {archivedAt}</span>}
      <span className="gt-backlog-row__meta">
        {estimate && <EstimateChip estimate={estimate} />}
        {points != null && <PointsChip points={points} size="sm" />}
        {reporter && assignee && <UserPair reporter={reporter} assignee={assignee} />}
      </span>
      {onRestore && (
        <button type="button" className="gt-backlog-row__restore" onClick={onRestore}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 3v5h5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {restoreLabel}
        </button>
      )}
    </div>
  );
}
