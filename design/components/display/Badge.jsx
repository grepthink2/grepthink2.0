import React from 'react';

const I = ({ d }) => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const ICONS = {
  crown: <I d={<><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></>} />,
  star: <I d={<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />} />,
  shield: <I d={<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />} />,
  key: <I d={<><circle cx="7.5" cy="15.5" r="5.5" /><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3" /></>} />,
  graduation: <I d={<><path d="M21.42 10.92a1 1 0 0 0-.02-1.84L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.83l8.57 3.91a2 2 0 0 0 1.66 0z" /><path d="M22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>} />,
  presentation: <I d={<><path d="M2 3h20M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3M7 21l5-5 5 5" /></>} />,
  users: <I d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>} />,
  building: <I d={<><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4" /></>} />,
  userPlus: <I d={<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></>} />,
};

const TONES = ['neutral', 'success', 'warning', 'error', 'info', 'gold', 'merged'];

/**
 * The status colour rule (decided 2026-10-19): green = done or positive · blue = in progress or
 * informational · amber = needs attention soon · red = a problem · grey = not started or inactive.
 * Pull requests keep GitHub's colours (Merged purple is the documented exception).
 * A feature picks a status key, never a colour: <Badge status="task.blocked" />.
 */
export const BADGE_STATUS = {
  'assignment.active': ['info', 'Active'], 'assignment.draft': ['neutral', 'Draft'], 'assignment.closed': ['neutral', 'Closed'],
  'assignment.not_started': ['neutral', 'Not started'], 'assignment.in_progress': ['info', 'In progress'],
  'assignment.submitted': ['success', 'Submitted'], 'assignment.due_soon': ['warning', 'Due soon'],
  'assignment.opens_later': ['neutral', 'Opens later'], 'assignment.missed': ['error', 'Missed'],
  'class.active': ['info', 'Active'], 'class.complete': ['success', 'Complete'],
  'project.open': ['success', 'Open'], 'project.closed': ['neutral', 'Closed'], 'project.member': ['info', 'Member'],
  'sprint.active': ['info', 'Active'], 'sprint.planned': ['neutral', 'Planned'], 'sprint.completed': ['success', 'Completed'],
  'task.todo': ['neutral', 'To do'], 'task.in_progress': ['info', 'In progress'], 'task.done': ['success', 'Done'], 'task.blocked': ['error', 'Blocked'],
  'pr.open': ['success', 'Open'], 'pr.merged': ['merged', 'Merged'], 'pr.closed': ['error', 'Closed'], 'pr.draft': ['neutral', 'Draft'],
  'attendance.present': ['success', 'Present'], 'attendance.late': ['warning', 'Late'], 'attendance.absent': ['error', 'Absent'], 'attendance.unmarked': ['neutral', 'Not marked'],
  'meeting.weekly': ['info', 'Meets weekly'], 'meeting.no_zoom': ['warning', 'No Zoom link yet'],
  'roster.enrolled': ['success', 'Enrolled'], 'roster.waitlisted': ['warning', 'Waitlisted'], 'roster.dropped': ['error', 'Dropped'],
  'roster.not_on_roster': ['warning', 'Not on roster'], 'roster.registered': ['success', 'Registered'], 'roster.not_registered': ['neutral', 'Not registered'],
  'request.incoming': ['warning', 'Incoming'], 'request.invitation': ['warning', 'Invitation'], 'request.pending': ['info', 'Pending'], 'request.denied': ['error', 'Denied'],
  'health.excellent': ['success', 'Excellent'], 'health.warning': ['warning', 'Warning'], 'health.poor': ['error', 'Poor'],
  'sentiment.positive': ['success', 'Positive'], 'sentiment.neutral': ['neutral', 'Neutral'], 'sentiment.negative': ['error', 'Negative'],
  'signups.open': ['success', 'Sign-ups open'], 'signups.closed': ['neutral', 'Sign-ups closed'],
  'slot.free': ['success', 'Free'], 'slot.yours': ['info', 'Your team'], 'slot.past': ['neutral', 'Past'],
  'review.no_review_ta': ['warning', 'No Review TA'], 'review.no_product_owner': ['warning', 'No Product Owner'],
  live: ['info', 'Live'],
  'release.new': ['info', 'New'],   /* What's new (2026-10-23): an entry newer than the version this browser last saw — informational, never the unread red */
};

/** Category labels are not statuses: outlined neutral + an icon, never a status colour. */
export const BADGE_CATEGORY = {
  ta: ['graduation', 'TA'], instructor: ['presentation', 'Instructor'], team: ['users', 'Team'],
  sponsored: ['building', 'Company Sponsored'], manual: ['userPlus', 'Manual'], members: ['users', 'Members'],
};

/** Project roles render as categories with the app's icons (Crown / Star / Shield); no role is amber. */
export const PROJECT_ROLES = {
  owner: ['crown', 'Owner'], product_owner: ['star', 'Product Owner'], scrum_master: ['shield', 'Scrum Master'],
  admin: ['key', 'Admin'], member: [null, 'Member'],
};

/**
 * Status / category / role pill. `projectRole` replaces the old `role` prop, which shadowed the ARIA attribute.
 * `size="sm"` (2026-10-23) is the 11px marker that sits in a heading row or a 32px menu row (the "New" marker).
 */
export function Badge({ children, tone = 'neutral', status, category, projectRole, icon, solid = false, size = 'md', className = '', ...rest }) {
  let kind = tone; let label = children; let glyph = icon; let cat = false; let roleCls = '';
  if (status && BADGE_STATUS[status]) {
    [kind] = BADGE_STATUS[status];
    if (label == null) label = BADGE_STATUS[status][1];
  } else if (projectRole) {
    const key = String(projectRole).trim().toLowerCase().replace(/[\s-]+/g, '_');
    const [ic, l] = PROJECT_ROLES[key] || [null, projectRole];
    cat = true; roleCls = `gt-badge--role-${key}`;
    if (glyph === undefined && ic) glyph = ICONS[ic];
    if (label == null) label = l;
  } else if (category) {
    const [ic, l] = BADGE_CATEGORY[category] || [null, category];
    cat = true;
    if (glyph === undefined && ic) glyph = ICONS[ic];
    if (label == null) label = l;
  }
  const cls = ['gt-badge', cat ? 'gt-badge--category' : `gt-badge--${kind}`, solid && !cat ? 'gt-badge--solid' : '', size === 'sm' ? 'gt-badge--sm' : '', roleCls, className].filter(Boolean).join(' ');
  return (
    <span className={cls} {...rest}>
      {glyph && <span className="gt-badge__icon" aria-hidden="true">{glyph}</span>}
      {label}
    </span>
  );
}

Badge.tones = TONES;
Badge.statuses = Object.keys(BADGE_STATUS);
Badge.categories = Object.keys(BADGE_CATEGORY);
Badge.roles = Object.keys(PROJECT_ROLES);
