import { Building2, Crown, GraduationCap, Key, Presentation, Shield, Star, UserPlus, Users, type LucideIcon } from 'lucide-react';

/** A badge's raw colour. Features pick a `status` instead whenever one fits. */
export type BadgeTone = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'gold' | 'merged';

export type BadgeStatus =
  | 'assignment.active' | 'assignment.draft' | 'assignment.closed' | 'assignment.not_started' | 'assignment.in_progress'
  | 'assignment.submitted' | 'assignment.due_soon' | 'assignment.opens_later' | 'assignment.missed'
  | 'class.active' | 'class.complete'
  | 'project.open' | 'project.closed' | 'project.member'
  | 'sprint.active' | 'sprint.planned' | 'sprint.completed'
  | 'task.todo' | 'task.in_progress' | 'task.done' | 'task.blocked'
  | 'pr.open' | 'pr.merged' | 'pr.closed' | 'pr.draft'
  | 'attendance.present' | 'attendance.late' | 'attendance.absent' | 'attendance.unmarked'
  | 'meeting.weekly' | 'meeting.no_zoom'
  | 'roster.enrolled' | 'roster.waitlisted' | 'roster.dropped' | 'roster.not_on_roster' | 'roster.registered' | 'roster.not_registered'
  | 'request.incoming' | 'request.invitation' | 'request.pending' | 'request.denied'
  | 'health.excellent' | 'health.warning' | 'health.poor'
  | 'sentiment.positive' | 'sentiment.neutral' | 'sentiment.negative'
  /** Final reviews: the sign-ups switch, slot states, and the two staff gaps. */
  | 'signups.open' | 'signups.closed' | 'slot.free' | 'slot.yours' | 'slot.past' | 'review.no_review_ta' | 'review.no_product_owner'
  | 'live';

export type BadgeCategory = 'ta' | 'instructor' | 'team' | 'sponsored' | 'manual' | 'members';

/** The role keys. `project_members.role` stores them spaced ('product owner'); toProjectRoleKey maps them. */
export type ProjectRole = 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';

/**
 * The status colour rule: green = done or positive · blue = in progress or informational · amber =
 * needs attention soon · red = a problem · grey = not started or inactive. Pull requests keep
 * GitHub's colours (Merged purple is the documented exception). Each key gives its tone and its
 * default label, ported from design/components/display/Badge.jsx (the table is in
 * design/design_handoff_ui_alignment/NOTES.md). A feature names the status, never a colour:
 * `<Badge status="task.blocked" />`.
 */
export const BADGE_STATUS: Record<BadgeStatus, readonly [tone: BadgeTone, label: string]> = {
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
};

/**
 * Category labels are not statuses (conversation type, "Company Sponsored", Manual, member counts):
 * outlined neutral with an icon, never a status colour. Each gives its icon and default label; the
 * design's inline icons are their lucide equivalents here.
 */
export const BADGE_CATEGORY: Record<BadgeCategory, readonly [icon: LucideIcon, label: string]> = {
  ta: [GraduationCap, 'TA'], instructor: [Presentation, 'Instructor'], team: [Users, 'Team'],
  sponsored: [Building2, 'Company Sponsored'], manual: [UserPlus, 'Manual'], members: [Users, 'Members'],
};

/** Project roles render in the category look with the app's role icons; Member has none, and no role is amber. */
export const PROJECT_ROLES: Record<ProjectRole, readonly [icon: LucideIcon | null, label: string]> = {
  owner: [Crown, 'Owner'], product_owner: [Star, 'Product Owner'], scrum_master: [Shield, 'Scrum Master'],
  admin: [Key, 'Admin'], member: [null, 'Member'],
};

/** A role as a key: trimmed, lower-cased, spaces and hyphens joined by one underscore ('Product Owner' → 'product_owner'). */
export function roleKey(role: string): string {
  return role.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** The preset key for a stored `project_members.role` ('product owner' → 'product_owner'), or undefined when none fits. */
export function toProjectRoleKey(role: string | null | undefined): ProjectRole | undefined {
  if (!role) return undefined;
  const key = roleKey(role);
  return Object.hasOwn(PROJECT_ROLES, key) ? (key as ProjectRole) : undefined;
}
