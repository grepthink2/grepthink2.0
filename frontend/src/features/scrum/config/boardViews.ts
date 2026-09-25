/** The three full-width sub-views (L2). Tab state lives in `?view=`. */
export const BOARD_VIEWS = ['board', 'backlog', 'burnup'] as const;
export type BoardView = (typeof BOARD_VIEWS)[number];
