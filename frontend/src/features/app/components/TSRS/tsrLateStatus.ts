import type { ApiAssignmentTsrEntry } from '@/lib/api';

/** The TSR times a reviewer's late mark reads. */
export type TsrTimes = Pick<ApiAssignmentTsrEntry, 'submitted_at' | 'updated_at'>;

/** An ISO time as milliseconds; null when missing or unreadable. */
function instant(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * The late mark (a Badge status) a reviewer sees on a TSR entry: 'tsr.late' when it was first
 * submitted at or after the deadline (the server closes on-time submissions at that instant), else
 * 'tsr.edited_late' when it was saved again at or after the deadline, else null. Any save counts: a
 * staff correction after the deadline also earns the mark, since the payload does not say who wrote
 * last. Null too when the deadline or the submission time is not known: a missing time never makes
 * an entry late.
 */
export function tsrLateStatus(
  entry: TsrTimes,
  dueAt: string | null | undefined,
): 'tsr.late' | 'tsr.edited_late' | null {
  const due = instant(dueAt);
  const submitted = instant(entry.submitted_at);
  if (due === null || submitted === null) return null;
  if (submitted >= due) return 'tsr.late';
  const updated = instant(entry.updated_at);
  return updated !== null && updated >= due ? 'tsr.edited_late' : null;
}
