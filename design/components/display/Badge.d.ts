import * as React from 'react';

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
  /** Final reviews (C2, 2026-10-20): the sign-ups switch, slot states, and the two staff gaps. */
  | 'signups.open' | 'signups.closed' | 'slot.free' | 'slot.yours' | 'slot.past' | 'review.no_review_ta' | 'review.no_product_owner'
  | 'live';

export type BadgeCategory = 'ta' | 'instructor' | 'team' | 'sponsored' | 'manual' | 'members';
export type ProjectRole = 'owner' | 'product_owner' | 'scrum_master' | 'admin' | 'member';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Label; defaults to the preset's label for `status`, `category` and `projectRole`. */
  children?: React.ReactNode;
  /** Raw colour, only when no status preset fits. @default 'neutral' */
  tone?: 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'gold' | 'merged';
  /** Status preset — the feature picks a status, the map picks the colour (see design_handoff_ui_alignment/NOTES.md). */
  status?: BadgeStatus;
  /** Category label (not a status): outlined neutral + icon. */
  category?: BadgeCategory;
  /** Project role (category look with Crown / Star / Shield / Key). Accepts the app's spaced values ('product owner'). Replaces `role`, which shadowed the ARIA attribute. */
  projectRole?: ProjectRole | string;
  /** Leading 12px icon; overrides the preset's. Pass null to drop it. */
  icon?: React.ReactNode;
  /** Solid fill (status tones only). @default false */
  solid?: boolean;
}

/** Status / category / role pill. */
export function Badge(props: BadgeProps): React.JSX.Element;
export const BADGE_STATUS: Record<BadgeStatus, [string, string]>;
export const BADGE_CATEGORY: Record<BadgeCategory, [string, string]>;
export const PROJECT_ROLES: Record<ProjectRole, [string | null, string]>;
