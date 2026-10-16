import type { ApiScrumStory } from '@/lib/api';

/**
 * The board's backlog rule (the backend's `_in_backlog`): a story with no sprint, or one that
 * carries the legacy `archived_at` flag, whatever sprint it still names. The client never
 * writes that flag; the server clears it on the story's next sprint move.
 */
export function isBacklogStory(s: Pick<ApiScrumStory, 'sprint_id' | 'archived_at'>): boolean {
  return s.sprint_id == null || s.archived_at != null;
}
