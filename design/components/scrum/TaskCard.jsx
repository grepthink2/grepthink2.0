import React from 'react';
import { TagBadge } from './TagBadge.jsx';
import { PointsChip, EstimateChip, PRLinkChip, UserPair } from './PointsChip.jsx';

/**
 * Scrum task card — the draggable unit on the board.
 * Shows key + parent story, title, tags, points/estimate, reporter → assignee,
 * optional linked PR/MR, and the last-move audit line.
 */
export function TaskCard({
  taskKey,
  storyKey,
  title,
  tags = [],
  points,
  estimate,
  reporter,
  assignee,
  pr,
  moved,
  commentCount,
  onOpen,
  className = '',
  ...rest
}) {
  return (
    <div
      className={['gt-task', onOpen ? 'gt-task--clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={onOpen ? (e) => { if (e.key === 'Enter') onOpen(); } : undefined}
      {...rest}
    >
      <div className="gt-task__top">
        <span className="gt-task__key">{taskKey}</span>
        {storyKey && <span className="gt-task__story">{storyKey}</span>}
        <span className="gt-task__meta">
          {estimate && <EstimateChip estimate={estimate} />}
          {points != null && <PointsChip points={points} size="sm" />}
        </span>
      </div>
      <p className="gt-task__title">{title}</p>
      {tags.length > 0 && (
        <div className="gt-task__tags">
          {tags.map((t) => <TagBadge key={t} tag={t} />)}
        </div>
      )}
      <div className="gt-task__foot">
        <UserPair reporter={reporter} assignee={assignee} />
        <span className="gt-task__foot-right">
          {commentCount > 0 && (
            <span className="gt-task__comments" title={`${commentCount} comments`}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {commentCount}
            </span>
          )}
          {pr && <PRLinkChip {...pr} />}
        </span>
      </div>
      {moved && (
        <div className="gt-task__audit" title="Last move">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M17 1l4 4-4 4M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 01-4 4H3" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {moved.to} · {moved.by} · {moved.at}
        </div>
      )}
    </div>
  );
}
