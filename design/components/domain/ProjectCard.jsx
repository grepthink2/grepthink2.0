import React from 'react';
import { Badge } from '../display/Badge.jsx';

/**
 * Project card — thumbnail band with kanban glyph, name, team,
 * member count and status chip. Mirrors the Figma "Project" card
 * (thumbnail band + white footer, 2.61px shadow, 5px chip).
 */
export function ProjectCard({
  name,
  team,
  memberCount,
  status = 'Active',
  statusTone = 'success',
  description,
  onView,
  onClick,
  className = '',
}) {
  return (
    <div
      className={['gt-project-card', onClick ? 'gt-project-card--clickable' : '', className].filter(Boolean).join(' ')}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="gt-project-card__thumb">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 5v11M12 5v6M18 5v14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="gt-project-card__status">
          <Badge tone={statusTone} solid>{status}</Badge>
        </span>
      </div>
      <div className="gt-project-card__body">
        <span className="gt-project-card__name">{name}</span>
        {team && <span className="gt-project-card__team">{team}</span>}
        {description && <p className="gt-project-card__desc">{description}</p>}
        <div className="gt-project-card__foot">
          {memberCount != null && (
            <span className="gt-project-card__members">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
              </svg>
              {memberCount} member{memberCount === 1 ? '' : 's'}
            </span>
          )}
          {onView && (
            <button type="button" className="gt-project-card__view" onClick={(e) => { e.stopPropagation(); onView(); }}>
              See All
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M7 17L17 7M8 7h9v9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
