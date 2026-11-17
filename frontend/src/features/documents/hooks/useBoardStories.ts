import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { ApiScrumStory } from '@/lib/api';

/** A story of the team's board, as the documents' story pickers and board links know it. */
export interface BoardStory {
  id: string;
  key: string;
  title: string;
  points: number | null;
  acceptance_criteria: string[];
  /** Its sprint, or null in the backlog. */
  sprintId: string | null;
  sprintName: string | null;
  /** At least one task, every task done: the documents' rule for a completed story. */
  completed: boolean;
}

const toBoardStory = (story: ApiScrumStory, sprintId: string | null, sprintName: string | null): BoardStory => ({
  id: story.id,
  key: story.key,
  title: story.title,
  points: story.points,
  acceptance_criteria: story.acceptance_criteria ?? [],
  sprintId,
  sprintName,
  completed: story.tasks.length > 0 && story.tasks.every((t) => t.status === 'done'),
});

/**
 * Every story of the project, sprint by sprint (by start) and then the backlog, each list in board
 * order. No route lists them all: the board read answers one sprint's stories and the backlog, so
 * this reads the board once, then once more for each other sprint, side by side.
 */
export async function readBoardStories(projectId: string): Promise<BoardStory[]> {
  const first = await api.getScrumBoard(projectId);
  const others = first.sprints.filter((s) => s.id !== first.sprint_id);
  const boards = await Promise.all(others.map((s) => api.getScrumBoard(projectId, s.id)));
  const storiesBySprint = new Map([first, ...boards].map((board) => [board.sprint_id, board.stories]));
  return [
    ...first.sprints.flatMap((sprint) => (storiesBySprint.get(sprint.id) ?? []).map((s) => toBoardStory(s, sprint.id, sprint.name))),
    ...first.backlog.map((s) => toBoardStory(s, null, null)),
  ];
}

export type BoardStoriesStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * The team's board stories for a document's editor, read once `enabled` turns on (an editor that
 * picks stories, for a team member) and kept for the page. `retry` reads them again after a failure.
 * `findMissing(ids)` reads the board afresh and answers which of `ids` it no longer holds.
 */
export function useBoardStories(projectId: string | undefined, enabled: boolean) {
  const [result, setResult] = useState<{ projectId: string; stories: BoardStory[] | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const seq = ++requestSeq.current;
    // A promise chain: react-hooks/set-state-in-effect accepts setState in its callbacks.
    readBoardStories(projectId)
      .then((stories) => {
        if (seq === requestSeq.current) setResult({ projectId, stories });
      })
      .catch(() => {
        if (seq === requestSeq.current) setResult({ projectId, stories: null });
      });
  }, [enabled, projectId, attempt]);

  const mine = result && result.projectId === projectId ? result : null;
  const status: BoardStoriesStatus = !enabled || !projectId
    ? 'idle'
    : !mine ? 'loading' : mine.stories ? 'ready' : 'error';
  const stories = useMemo(() => mine?.stories ?? [], [mine]);
  const byId = useMemo(() => new Map(stories.map((s) => [s.id, s])), [stories]);

  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  const findMissing = useCallback(async (ids: string[]): Promise<string[]> => {
    if (!projectId || ids.length === 0) return [];
    const fresh = await readBoardStories(projectId);
    requestSeq.current += 1; // an older read still in flight must not replace this one
    setResult({ projectId, stories: fresh });
    const known = new Set(fresh.map((s) => s.id));
    return ids.filter((id) => !known.has(id));
  }, [projectId]);

  return { status, stories, byId, retry, findMissing };
}
