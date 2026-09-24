import type { FeedbackEntry, TeamMember } from './tsrsTypes';

/** A team-feedback answer: `<memberId>-contribution` or `<memberId>-improvement`. */
export type FeedbackFieldKey = `${string}-contribution` | `${string}-improvement`;

/**
 * The answers still blank (whitespace counts as blank), in member order: each
 * member's contribution, then their improvement. The Team Feedback tab highlights
 * these; the TSR form uses the same rule to mark the step complete.
 */
export function emptyFeedbackFields(
  members: TeamMember[],
  feedback: Record<string, FeedbackEntry>,
): FeedbackFieldKey[] {
  const empty: FeedbackFieldKey[] = [];
  for (const { id } of members) {
    if (!(feedback[id]?.contribution ?? '').trim()) empty.push(`${id}-contribution`);
    if (!(feedback[id]?.improvement ?? '').trim()) empty.push(`${id}-improvement`);
  }
  return empty;
}

/** True when every member has both team-feedback answers filled in. */
export function isTeamFeedbackComplete(
  members: TeamMember[],
  feedback: Record<string, FeedbackEntry>,
): boolean {
  return emptyFeedbackFields(members, feedback).length === 0;
}
