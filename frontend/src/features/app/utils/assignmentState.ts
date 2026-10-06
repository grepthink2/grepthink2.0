import {
  assignmentClosesAt,
  assignmentDeadline,
  assignmentOpensAt,
  type AssignmentDates,
} from '@/lib/dateUtils';
import type {
  StudentAssignmentAction,
  StudentAssignmentStatus,
} from '../components/Assignments/StudentAssignmentsTable';

export interface AssignmentState {
  status: StudentAssignmentStatus;
  action: StudentAssignmentAction;
  /** Set while submissions are accepted after the deadline (the late window's end). */
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
  if (!canStart) return { status, action: 'closed', lateUntil };
  if (isSubmitted) return { status: 'submitted', action: 'edit_submission', lateUntil };
  return { status: 'not_started', action: 'start', lateUntil };
}
