import {
  assignmentClosesAt,
  assignmentDeadline,
  assignmentOpensAt,
  formatInstant,
  type AssignmentDates,
} from '@/lib/dateUtils';
import type {
  StudentAssignmentAction,
  StudentAssignmentStatus,
} from '../components/Assignments/StudentAssignmentsTable';

export interface AssignmentState {
  status: StudentAssignmentStatus;
  action: StudentAssignmentAction;
  /** The late window's end, while this student may still submit after the deadline. */
  lateUntil: Date | null;
}

/**
 * What a student may do with an assignment right now. Open from the start of the open day until
 * the late window when there is one, else the deadline (`due_at`; the Pacific day rule for older
 * backends). Mirrors the server's `_require_window_open`, which is the one that decides.
 */
export function resolveAssignmentState(
  a: AssignmentDates,
  now: Date,
  isSubmitted: boolean,
  canStart: boolean,
  zone = 'America/Los_Angeles',
): AssignmentState {
  const status: StudentAssignmentStatus = isSubmitted ? 'submitted' : 'not_started';
  const opens = assignmentOpensAt(a, zone);
  const deadline = assignmentDeadline(a);
  const closes = assignmentClosesAt(a);
  const lateUntil = deadline && closes && closes > deadline && now >= deadline ? closes : null;

  if (opens && now < opens) return { status, action: 'opens_later', lateUntil: null };
  if (closes && now >= closes) return { status, action: 'closed', lateUntil: null };
  if (!canStart) return { status, action: 'closed', lateUntil: null };
  if (isSubmitted) return { status: 'submitted', action: 'edit_submission', lateUntil };
  return { status: 'not_started', action: 'start', lateUntil };
}

/** The window's bounds as an assignment form receives them; any of them may be unknown. */
export interface SubmissionWindow {
  /** YYYY-MM-DD */
  openDate?: string | null;
  dueAt?: string | null;
  acceptUntil?: string | null;
}

/**
 * Why a form cannot be submitted right now — "This assignment is closed" or "This assignment
 * opens <date>" — or null while it is open, by `resolveAssignmentState`. A bound that is not known
 * keeps the window open, so a caller that passes none keeps working.
 */
export function submissionWindowNotice(
  w: SubmissionWindow,
  now: Date,
  zone?: string,
): string | null {
  const dates: AssignmentDates = {
    open_date: w.openDate ?? '',
    // No calendar fallback: without due_at the window has no end, as on the server.
    close_date: '',
    due_at: w.dueAt ?? null,
    accept_until: w.acceptUntil ?? null,
  };
  const { action } = resolveAssignmentState(dates, now, false, true, zone);
  if (action === 'closed') return 'This assignment is closed';
  const opens = action === 'opens_later' ? assignmentOpensAt(dates, zone) : null;
  return opens ? `This assignment opens ${formatInstant(opens)}` : null;
}
