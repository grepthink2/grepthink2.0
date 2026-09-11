/** Fixed vocabularies shared by the board UI — mirrors backend/app/scrum/models.py. */

/** The 10 preset work tags, in canonical (design) order. */
export const TASK_TAGS = [
  'backend', 'frontend', 'ui/ux', 'infra', 'design',
  'research', 'bug', 'chore', 'optimization', 'docs',
] as const;
export type TaskTag = (typeof TASK_TAGS)[number];

/** Estimate scale -> the point values it offers (project-level setting, D3). */
export const ESTIMATE_SCALES = {
  linear: [1, 2, 3, 4, 5, 6],
  exponential: [1, 2, 4, 8, 16, 32],
  fibonacci: [1, 2, 3, 5, 8, 13],
} as const;
export type EstimateScale = keyof typeof ESTIMATE_SCALES;

export type BoardStatus = 'todo' | 'in_progress' | 'done';

/** The three fixed columns, left to right. */
export const BOARD_COLUMNS: { id: BoardStatus; label: string }[] = [
  { id: 'todo', label: 'TODO' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'done', label: 'Done' },
];

/** Human label for a status — same source as the column headers, so the task
 *  audit line and the board header can never disagree. */
export function statusLabel(status: BoardStatus): string {
  return BOARD_COLUMNS.find((c) => c.id === status)?.label ?? status;
}

/** `ui/ux` has no slash in its class name: .gt-tagbadge--uiux */
export function tagSlug(tag: string): string {
  return tag.toLowerCase().replace('/', '');
}
