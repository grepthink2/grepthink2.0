import React from 'react';
import { MarketingBadge } from './Eyebrow.jsx';

/**
 * Hero announcement pill — a link with a NEW badge, text and an arrow.
 * Replaces the eyebrow while a launch announcement is on; scrolls to the
 * feature band. The whole pill is the link.
 */
export function AnnouncementPill({
  children,
  href = '#scrum-board',
  badge = 'NEW',
  ariaLabel,
  onClick,
  className = '',
}) {
  return (
    <a className={['gt-announce', className].filter(Boolean).join(' ')} href={href} onClick={onClick} aria-label={ariaLabel}>
      <MarketingBadge>{badge}</MarketingBadge>
      <span className="gt-announce__text">{children}</span>
      <span className="gt-announce__arrow" aria-hidden="true">→</span>
    </a>
  );
}
