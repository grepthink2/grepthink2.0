import React from 'react';

/**
 * Ranked project slot for the staffing / interest form.
 * Shows rank number, project name, and up/down/remove controls.
 * Empty slots render as a dashed drop target.
 */
export function RankedProjectSlot({
  rank,
  project,
  team,
  onMoveUp,
  onMoveDown,
  onRemove,
  emptyLabel = 'Drag a project here or pick from the list',
  className = '',
}) {
  if (!project) {
    return (
      <div className={['gt-ranked-slot', 'gt-ranked-slot--empty', className].filter(Boolean).join(' ')}>
        <span className="gt-ranked-slot__rank">{rank}</span>
        <span className="gt-ranked-slot__empty">{emptyLabel}</span>
      </div>
    );
  }
  return (
    <div className={['gt-ranked-slot', className].filter(Boolean).join(' ')}>
      <span className="gt-ranked-slot__rank">{rank}</span>
      <div className="gt-ranked-slot__body">
        <span className="gt-ranked-slot__name">{project}</span>
        {team && <span className="gt-ranked-slot__team">{team}</span>}
      </div>
      <div className="gt-ranked-slot__controls">
        <button type="button" className="gt-ranked-slot__ctl" aria-label={`Move ${project} up`} onClick={onMoveUp} disabled={!onMoveUp}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <button type="button" className="gt-ranked-slot__ctl" aria-label={`Move ${project} down`} onClick={onMoveDown} disabled={!onMoveDown}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        {onRemove && (
          <button type="button" className="gt-ranked-slot__ctl gt-ranked-slot__ctl--remove" aria-label={`Remove ${project}`} onClick={onRemove}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
          </button>
        )}
      </div>
    </div>
  );
}
