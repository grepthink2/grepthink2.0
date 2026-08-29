import type { ApiScrumStory, ApiScrumTask } from '@/lib/api';
import type { BoardStatus } from '../config/scrumTags';

/** Story rollup shown under a StoryCard — always derived, never stored (spec Part 1). */
export interface StoryRollup {
  tasksDone: number;
  tasksTotal: number;
  /** Points of DONE child tasks. */
  pointsDone: number;
  /** The story's own estimate, used as the rollup denominator. */
  points: number;
  /** 0-100, drives the progress bar width. */
  percent: number;
}

export function storyRollup(story: ApiScrumStory): StoryRollup {
  const tasks = story.tasks ?? [];
  const tasksTotal = tasks.length;
  const tasksDone = tasks.filter((t) => t.status === 'done').length;
  const pointsDone = tasks.reduce((sum, t) => (t.status === 'done' ? sum + (t.points ?? 0) : sum), 0);
  const percent = tasksTotal ? Math.round((tasksDone / tasksTotal) * 100) : 0;
  return { tasksDone, tasksTotal, pointsDone, points: story.points ?? 0, percent };
}

/** Point total for one board column header ("n pts"). */
export function columnPoints(tasks: ApiScrumTask[], status: BoardStatus): number {
  return tasks.reduce((sum, t) => (t.status === status ? sum + (t.points ?? 0) : sum), 0);
}

export function tasksIn(tasks: ApiScrumTask[], status: BoardStatus): ApiScrumTask[] {
  return tasks.filter((t) => t.status === status);
}

/** Every task across the sprint's stories, optionally narrowed to one story (L1 filter). */
export function collectTasks(stories: ApiScrumStory[], storyId?: string | null): ApiScrumTask[] {
  const scoped = storyId ? stories.filter((s) => s.id === storyId) : stories;
  return scoped.flatMap((s) => s.tasks ?? []);
}

/**
 * Points on a story not yet carved into tasks — what the task editor suggests
 * next (F14). Floored at 0: once children exceed the parent estimate there is
 * nothing left to suggest, and a negative number would read as a penalty.
 * Returns null when the story carries no estimate, so callers can stay quiet
 * rather than claim "0 pts unassigned".
 */
export function remainingStoryPoints(story: ApiScrumStory): number | null {
  if (story.points == null) return null;
  const assigned = (story.tasks ?? []).reduce((sum, t) => sum + (t.points ?? 0), 0);
  return Math.max(0, story.points - assigned);
}
