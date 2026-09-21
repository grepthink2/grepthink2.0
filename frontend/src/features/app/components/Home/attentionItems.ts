import type { ApiClassAttention } from '@/lib/api';

export type AttentionType = 'roster_missing' | 'unmatched';

export interface AttentionItem {
  id: string;
  classId: string;
  className: string;
  type: AttentionType;
  message: string;
}

/**
 * Instructor-home alerts for the given classes, in their order: no official
 * roster uploaded yet, and students registered on GrepThink who are not on the
 * roster. Classes without a summary produce no alerts.
 */
export function buildAttentionItems(
  classes: { id: string; name: string }[],
  summaries: ApiClassAttention[],
): AttentionItem[] {
  const byClass = new Map(summaries.map((s) => [s.class_id, s]));
  const items: AttentionItem[] = [];
  for (const cls of classes) {
    const summary = byClass.get(cls.id);
    if (!summary) continue;
    if (!summary.roster_uploaded_at) {
      items.push({
        id: `${cls.id}:roster_missing`,
        classId: cls.id,
        className: cls.name,
        type: 'roster_missing',
        message: 'No official roster uploaded yet',
      });
    }
    const count = summary.not_on_roster;
    if (count > 0) {
      items.push({
        id: `${cls.id}:unmatched`,
        classId: cls.id,
        className: cls.name,
        type: 'unmatched',
        message: `${count} student${count === 1 ? '' : 's'} registered but not on the roster`,
      });
    }
  }
  return items;
}
