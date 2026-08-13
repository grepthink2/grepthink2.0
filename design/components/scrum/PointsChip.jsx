import React from 'react';
import { Avatar } from '../display/Avatar.jsx';

/** Story-point chip — rounded square, mono numeral. */
export function PointsChip({ points, size = 'md', title = 'Story points', className = '' }) {
  return (
    <span className={['gt-points', `gt-points--${size}`, className].filter(Boolean).join(' ')} title={title}>
      {points}
    </span>
  );
}

/** Time-estimate chip — clock glyph + human estimate ("6h", "2d"). */
export function EstimateChip({ estimate, className = '', ...rest }) {
  return (
    <span className={['gt-estimate', className].filter(Boolean).join(' ')} title="Time estimate" {...rest}>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      {estimate}
    </span>
  );
}

/**
 * Linked PR/MR chip — GitHub or git.ucsc.edu (GitLab). State colors:
 * open green, merged purple, closed red, draft gray.
 */
export function PRLinkChip({ label, url, state = 'open', provider = 'github', className = '' }) {
  return (
    <a
      className={['gt-prchip', `gt-prchip--${state}`, className].filter(Boolean).join(' ')}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={`${provider === 'gitlab' ? 'Merge request' : 'Pull request'} · ${state}`}
      onClick={(e) => e.stopPropagation()}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="18" cy="18" r="3" stroke="currentColor" strokeWidth="2.5"/>
        <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="2.5"/>
        <path d="M6 9v6a3 3 0 003 3h6M18 15V9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
      </svg>
      {label}
    </a>
  );
}

/** Reporter → assignee pair (tiny avatars with an arrow). */
export function UserPair({ reporter, assignee, size = 'xs', className = '' }) {
  return (
    <span className={['gt-userpair', className].filter(Boolean).join(' ')}>
      <span title={`Reporter: ${reporter}`}><Avatar name={reporter} size={size} /></span>
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <span title={`Assignee: ${assignee}`}><Avatar name={assignee} size={size} /></span>
    </span>
  );
}
