import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiDocumentStory } from '@/lib/api';

export type ProjectStoriesStatus = 'idle' | 'loading' | 'ready' | 'error';

/** What an editor that picks stories reads: the board's stories, their state, and a way to read again. */
export interface ProjectStories {
  status: ProjectStoriesStatus;
  /** Every live story of the board, in board order (each sprint's, then the backlog's). */
  stories: ApiDocumentStory[];
  byId: ReadonlyMap<string, ApiDocumentStory>;
  retry: () => void;
}

/**
 * The team's board stories for a document's editor (`GET /api/projects/{id}/documents/stories`, which
 * records nothing, unlike the board's own read). Read once per project, the first time `enabled` turns
 * on (an editor that picks stories, for a team member), and kept for the page whatever `enabled` does
 * after. `retry` reads them again after a failure. `findMissing(ids)` reads them afresh and answers which
 * of `ids` the board no longer holds.
 */
export function useProjectStories(projectId: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ projectId: string; stories: ApiDocumentStory[] | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestSeq = useRef(0);
  const mine = result && result.projectId === projectId ? result : null;
  const have = Boolean(mine?.stories);

  useEffect(() => {
    if (!enabled || !projectId || have) return;
    const seq = ++requestSeq.current;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    api
      .getDocumentStories(projectId)
      .then(({ stories }) => {
        if (seq === requestSeq.current) setResult({ projectId, stories });
      })
      .catch(() => {
        if (seq === requestSeq.current) setResult({ projectId, stories: null });
      });
  }, [enabled, projectId, have, attempt]);

  const status: ProjectStoriesStatus = !projectId
    ? 'idle'
    : mine ? (mine.stories ? 'ready' : 'error') : enabled ? 'loading' : 'idle';
  const stories = useMemo(() => mine?.stories ?? [], [mine]);
  const byId = useMemo(() => new Map(stories.map((s) => [s.id, s])), [stories]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  const findMissing = useCallback(async (ids: string[]): Promise<string[]> => {
    if (!projectId || ids.length === 0) return [];
    const { stories: fresh } = await api.getDocumentStories(projectId);
    requestSeq.current += 1; // an older read still in flight must not replace this one
    setResult({ projectId, stories: fresh });
    const known = new Set(fresh.map((s) => s.id));
    return ids.filter((id) => !known.has(id));
  }, [projectId]);

  return { status, stories, byId, retry, findMissing };
}
