/** The full-width sub-views (L2), the team's documents among them. Tab state lives in `?view=`. */
export const BOARD_VIEWS = ['board', 'backlog', 'burnup', 'documents'] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];
