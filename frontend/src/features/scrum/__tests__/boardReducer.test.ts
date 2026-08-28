import { describe, expect, it } from 'vitest';
import {
  applyOptimisticMove, applyPrStates, confirmMove, findTask, mapTask, rollbackMove,
} from '../utils/boardReducer';
import type { ApiScrumStory, ApiScrumTask } from '@/lib/api';

const task = (over: Partial<ApiScrumTask>): ApiScrumTask => ({
  id: 't1', story_id: 's1', key: 'T-1', title: 'Task', description_md: null,
  points: null, time_estimate: null, status: 'todo', reporter_id: 'u1',
  assignee_id: null, tags: [], pr_url: null, pr_provider: null, pr_state: null,
  moved_by: null, moved_by_name: null, moved_at: null, comment_count: 0, ...over,
});
const story = (id: string, tasks: ApiScrumTask[]): ApiScrumStory => ({
  id, sprint_id: 'sp1', key: `US-${id}`, title: 'Story', description_md: null,
  points: null, time_estimate: null, reporter_id: 'u1', assignee_id: null,
  archived_at: null, comment_count: 0, tasks,
});

const stories = () => [
  story('s1', [task({ id: 'a' }), task({ id: 'b', status: 'done' })]),
  story('s2', [task({ id: 'c', story_id: 's2' })]),
];

describe('findTask / mapTask', () => {
  it('finds a task in any story', () => {
    expect(findTask(stories(), 'c')?.id).toBe('c');
    expect(findTask(stories(), 'ghost')).toBeNull();
  });

  it('rebuilds only the story that owns the task', () => {
    const before = stories();
    const after = mapTask(before, 'a', (t) => ({ ...t, title: 'edited' }));
    expect(after[0]).not.toBe(before[0]);       // owning story is new
    expect(after[1]).toBe(before[1]);           // untouched story keeps identity
    expect(after[0].tasks[0].title).toBe('edited');
    expect(after[0].tasks[1]).toBe(before[0].tasks[1]); // sibling task untouched
  });

  it('is a no-op for an unknown id', () => {
    const before = stories();
    const after = mapTask(before, 'ghost', (t) => ({ ...t, title: 'x' }));
    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
  });
});

describe('optimistic move lifecycle', () => {
  it('applies status and a provisional audit line without mutating the input', () => {
    const before = stories();
    const after = applyOptimisticMove(before, 'a', 'in_progress', 'Tony Wu', '2026-08-28T00:00:00Z');
    expect(after[0].tasks[0]).toMatchObject({
      status: 'in_progress', moved_by_name: 'Tony Wu', moved_at: '2026-08-28T00:00:00Z',
    });
    expect(before[0].tasks[0].status).toBe('todo'); // original untouched
  });

  it('confirm replaces the task with the server row', () => {
    const moved = applyOptimisticMove(stories(), 'a', 'done', 'Tony Wu');
    const serverTask = task({ id: 'a', status: 'done', moved_by_name: 'Tony W.', moved_at: '2026-08-28T12:00:00Z' });
    const after = confirmMove(moved, 'a', serverTask);
    expect(after[0].tasks[0]).toBe(serverTask);
  });

  it('rollback restores the pre-move snapshot exactly', () => {
    const before = stories();
    const snapshot = findTask(before, 'a')!;
    const moved = applyOptimisticMove(before, 'a', 'done', 'Tony Wu');
    expect(moved[0].tasks[0].status).toBe('done');
    const rolled = rollbackMove(moved, snapshot);
    expect(rolled[0].tasks[0]).toEqual(snapshot);
  });
});

describe('applyPrStates', () => {
  it('patches only the listed tasks', () => {
    const before = [story('s1', [task({ id: 'a', pr_state: null }), task({ id: 'b', pr_state: 'open' })])];
    const after = applyPrStates(before, { a: 'merged' });
    expect(after[0].tasks[0].pr_state).toBe('merged');
    expect(after[0].tasks[1].pr_state).toBe('open');
  });

  it('returns the same array when there is nothing to patch', () => {
    const before = stories();
    expect(applyPrStates(before, {})).toBe(before);
    expect(applyPrStates(before, { ghost: 'open' })[0]).toBe(before[0]);
  });
});
