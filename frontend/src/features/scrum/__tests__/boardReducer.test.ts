import { describe, expect, it } from 'vitest';
import type { ApiBoardStatus } from '@/lib/api';
import {
  applyOptimisticMove, applyPrStates, applyStoryPatch, applyTaskPatch,
  confirmMove, findStory, findTask, mapTask, mergeTaskResponse, rollbackMove, syncRefStatus,
} from '../utils/boardReducer';
import { makeRef, makeStory, makeTask } from './fixtures';

const story = (id: string, tasks: ReturnType<typeof makeTask>[]) =>
  makeStory({ id, key: `US-${id}`, tasks });


const stories = () => [
  story('s1', [makeTask({ id: 'a' }), makeTask({ id: 'b', status: 'done' })]),
  story('s2', [makeTask({ id: 'c', story_id: 's2' })]),
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
    const serverTask = makeTask({ id: 'a', status: 'done', moved_by_name: 'Tony W.', moved_at: '2026-08-28T12:00:00Z' });
    const after = confirmMove(moved, 'a', serverTask);
    expect(after[0].tasks[0]).toEqual(serverTask);
  });

  it('confirm keeps the optimistic mover when the server row omits one', () => {
    const moved = applyOptimisticMove(stories(), 'a', 'done', 'Tony Wu');
    const serverTask = makeTask({ id: 'a', status: 'done', moved_by_name: null });
    const after = confirmMove(moved, 'a', serverTask);
    expect(after[0].tasks[0].moved_by_name).toBe('Tony Wu'); // not blanked to Unknown
    expect(after[0].tasks[0].status).toBe('done');           // everything else is the server's
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

describe('dependency refs', () => {
  const refTo = (id: string, status: ApiBoardStatus = 'todo') => makeRef({ id, key: `T-${id}`, status });
  /** m depends on x (so x blocks m), and y depends on m. z, in a third story, names only x. */
  const chain = () => [
    story('s1', [
      makeTask({ id: 'x', status: 'done', blocks: [refTo('m')] }),
      makeTask({ id: 'm', depends_on: [refTo('x', 'done')], blocks: [refTo('y')] }),
    ]),
    story('s2', [makeTask({ id: 'y', story_id: 's2', depends_on: [refTo('m')] })]),
    story('s3', [makeTask({ id: 'z', story_id: 's3', depends_on: [refTo('x', 'done')] })]),
  ];

  it('syncRefStatus rewrites a moved task’s status in every ref that names it', () => {
    const before = chain();
    const after = syncRefStatus(before, 'm', 'done');
    expect(after[0].tasks[0].blocks![0].status).toBe('done');       // a dependency's blocks
    expect(after[1].tasks[0].depends_on![0].status).toBe('done');   // a dependent's depends_on
    // m's own refs name other tasks; a story naming nothing that moved keeps its identity.
    expect(after[0].tasks[1]).toBe(before[0].tasks[1]);
    expect(after[2]).toBe(before[2]);
    expect(before[1].tasks[0].depends_on![0].status).toBe('todo'); // input untouched
  });

  it('syncRefStatus leaves tasks from an older backend (no lists) alone', () => {
    const before = [story('s1', [{ ...makeTask({ id: 'a' }), depends_on: undefined, blocks: undefined }])];
    expect(syncRefStatus(before, 'b', 'done')[0]).toBe(before[0]);
  });

  it('mergeTaskResponse keeps depends_on, blocks and comment_count from the board’s task', () => {
    const boardTask = makeTask({ id: 'm', comment_count: 4, depends_on: [refTo('x')], blocks: [refTo('y')] });
    // A single-task response: no dependency rows in hand, no comment count.
    const response = makeTask({ id: 'm', title: 'Renamed', comment_count: 0, depends_on: [], blocks: [] });
    const merged = mergeTaskResponse(boardTask, response);
    expect(merged.title).toBe('Renamed');
    expect(merged.comment_count).toBe(4);
    expect(merged.depends_on).toBe(boardTask.depends_on);
    expect(merged.blocks).toBe(boardTask.blocks);
  });

  it('mergeTaskResponse takes moved_by_name from the response when it has one, else the board’s', () => {
    const boardTask = makeTask({ id: 'm', moved_by_name: 'Tony Wu' });
    expect(mergeTaskResponse(boardTask, makeTask({ id: 'm', moved_by_name: 'Tony W.' })).moved_by_name)
      .toBe('Tony W.');
    expect(mergeTaskResponse(boardTask, makeTask({ id: 'm', moved_by_name: null })).moved_by_name)
      .toBe('Tony Wu');
  });

  it('confirm keeps the board’s lists and comment count under the server row', () => {
    const before = [story('s1', [makeTask({ id: 'm', comment_count: 2, depends_on: [refTo('x', 'done')] })])];
    const moved = applyOptimisticMove(before, 'm', 'done', 'Tony Wu');
    const after = confirmMove(moved, 'm', makeTask({ id: 'm', status: 'done', moved_by_name: 'Tony W.' }));
    expect(after[0].tasks[0]).toMatchObject({ status: 'done', moved_by_name: 'Tony W.', comment_count: 2 });
    expect(after[0].tasks[0].depends_on).toEqual([refTo('x', 'done')]);
  });
});

describe('applyPrStates', () => {
  it('patches only the listed tasks', () => {
    const before = [story('s1', [makeTask({ id: 'a', pr_state: null }), makeTask({ id: 'b', pr_state: 'open' })])];
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

describe('field patches (F16)', () => {
  it('merges story fields without touching its tasks or siblings', () => {
    const before = stories();
    const after = applyStoryPatch(before, 's1', { points: 13 });
    expect(after[0].points).toBe(13);
    expect(after[0].tasks).toBe(before[0].tasks);   // children preserved
    expect(after[1]).toBe(before[1]);
  });

  it('merges task fields in place', () => {
    const before = stories();
    const after = applyTaskPatch(before, 'a', { title: 'Renamed', points: 5 });
    expect(after[0].tasks[0]).toMatchObject({ title: 'Renamed', points: 5 });
    expect(before[0].tasks[0].title).toBe('Task');  // input untouched
  });

  it('finds a story by id, or null', () => {
    expect(findStory(stories(), 's2')?.id).toBe('s2');
    expect(findStory(stories(), 'ghost')).toBeNull();
  });
});
