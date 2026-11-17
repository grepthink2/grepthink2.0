import type { ApiClassDocument } from '@/lib/api';

/** A team's documents as the staff badge counts them: the ones it has made, and the ones handed in. */
export interface HandIns {
  handedIn: number;
  total: number;
}

/**
 * Each team's count from the class's list of documents (one row per document a team has made), by
 * its project id. A final document saved again since still counts as handed in.
 */
export function handInsByTeam(documents: ApiClassDocument[]): Map<string, HandIns> {
  const counts = new Map<string, HandIns>();
  for (const doc of documents) {
    const team = counts.get(doc.project_id) ?? { handedIn: 0, total: 0 };
    counts.set(doc.project_id, {
      handedIn: team.handedIn + (doc.status === 'final' ? 1 : 0),
      total: team.total + 1,
    });
  }
  return counts;
}
