/** A story holds at most this many acceptance criteria (the API refuses more). */
export const CRITERIA_MAX = 20;
/** A criterion's length at most, once trimmed (the API refuses a longer one). */
export const CRITERION_MAX = 300;

/** The list a story saves from the editor's rows: each trimmed, the blank ones dropped. */
export function cleanCriteria(rows: string[]): string[] {
  return rows.map((row) => row.trim()).filter(Boolean);
}

/** Whether the rows can be saved as they are: no more criteria than a story holds, none too long. */
export function criteriaFit(rows: string[]): boolean {
  const criteria = cleanCriteria(rows);
  return criteria.length <= CRITERIA_MAX && criteria.every((c) => c.length <= CRITERION_MAX);
}

/** Whether two lists hold the same criteria in the same order. */
export function sameCriteria(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((c, i) => c === b[i]);
}
