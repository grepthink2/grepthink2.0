import { describe, expect, it } from 'vitest';
import type { ApiBoardStatus, ApiScrumTask } from '@/lib/api';
import { isBacklogStory } from '../utils/backlog';
import { blockedMessage, blockers, isBlocked } from '../utils/dependencies';
import { parseHours } from '../utils/estimateHours';
import { storyRollup, storyHours, columnPoints, tasksIn, collectTasks } from '../utils/rollups';
import { prLabel, prState } from '../utils/prLabel';
import { relativeTime } from '../utils/relativeTime';
import { newSprintDraft, percentDone, sprintDates, STATUS_LABELS } from '../utils/sprints';
import { tagSlug, ESTIMATE_SCALES, TASK_TAGS, BOARD_COLUMNS } from '../config/scrumTags';
import { buildMemberMap, personOf } from '../scrumTypes';
import { makeRef, makeStory, makeTask } from './fixtures';

describe('dependencies', () => {
  const dep = (key: string, status: ApiBoardStatus) => makeRef({ id: key, key, status });
  const unfinished = [dep('GT-12', 'in_progress')];

  it('blockers are the dependencies that are not done', () => {
    const task = makeTask({
      depends_on: [dep('GT-11', 'done'), dep('GT-12', 'in_progress'), dep('GT-13', 'todo')],
    });
    expect(blockers(task).map((d) => d.key)).toEqual(['GT-12', 'GT-13']);
  });

  it('blocks a task in To do with an unfinished dependency', () => {
    expect(isBlocked(makeTask({ status: 'todo', depends_on: unfinished }))).toBe(true);
  });

  it('frees it once every dependency is done', () => {
    expect(isBlocked(makeTask({ status: 'todo', depends_on: [dep('GT-12', 'done')] }))).toBe(false);
  });

  it('never blocks a task already under way', () => {
    expect(isBlocked(makeTask({ status: 'in_progress', depends_on: unfinished }))).toBe(false);
  });

  it('reads a task from an older backend (no depends_on) as unblocked', () => {
    const legacy: ApiScrumTask = { ...makeTask(), depends_on: undefined };
    expect(blockers(legacy)).toEqual([]);
    expect(isBlocked(legacy)).toBe(false);
  });

  it.each([
    [['GT-12'], 'GT-15 is blocked by GT-12'],
    [['GT-12', 'GT-13'], 'GT-15 is blocked by GT-12 and GT-13'],
    [['GT-12', 'GT-13', 'GT-14'], 'GT-15 is blocked by GT-12, GT-13 and GT-14'],
  ])('names the blockers %j, and not the finished ones', (keys, message) => {
    const task = makeTask({
      key: 'GT-15',
      depends_on: [dep('GT-9', 'done'), ...keys.map((k) => dep(k, 'todo'))],
    });
    expect(blockedMessage(task)).toBe(message);
  });
});

describe('storyRollup', () => {
  it('derives task/point progress from children', () => {
    const s = makeStory({
      points: 8,
      tasks: [
        makeTask({ id: 'a', status: 'done', points: 3 }),
        makeTask({ id: 'b', status: 'done', points: 2 }),
        makeTask({ id: 'c', status: 'todo', points: 5 }),
        makeTask({ id: 'd', status: 'in_progress', points: null }),
      ],
    });
    expect(storyRollup(s)).toEqual({
      tasksDone: 2, tasksTotal: 4, pointsDone: 5, points: 8, percent: 50,
    });
  });

  it('is safe for a story with no tasks or no estimate', () => {
    expect(storyRollup(makeStory())).toEqual({
      tasksDone: 0, tasksTotal: 0, pointsDone: 0, points: 0, percent: 0,
    });
  });
});

describe('storyHours', () => {
  it('is null with no tasks and with tasks that have no hours', () => {
    expect(storyHours(makeStory({ tasks: [] }))).toBeNull();
    expect(storyHours(makeStory({ tasks: [makeTask()] }))).toBeNull();
  });

  it('sums the tasks that have hours', () => {
    const tasks = [makeTask({ id: 'a', estimate_hours: 3 }), makeTask({ id: 'b', estimate_hours: 2 })];
    expect(storyHours(makeStory({ tasks }))).toBe(5);
  });

  it('counts a task without hours as 0 when another has some', () => {
    const tasks = [makeTask({ id: 'a', estimate_hours: 3 }), makeTask({ id: 'b', estimate_hours: null })];
    expect(storyHours(makeStory({ tasks }))).toBe(3);
  });
});

describe('parseHours', () => {
  it.each([
    ['', false, { hours: null, invalid: false }],
    ['4', false, { hours: 4, invalid: false }],
    ['1', false, { hours: 1, invalid: false }],
    ['15', false, { hours: 15, invalid: false }],
    ['0', false, { hours: null, invalid: true }],
    ['16', false, { hours: null, invalid: true }],
    ['2.5', false, { hours: null, invalid: true }],
    ['1e1', false, { hours: null, invalid: true }],
    ['4h', false, { hours: null, invalid: true }],
    // Firefox and Safari report "4h" in a number box as '' with validity.badInput.
    ['', true, { hours: null, invalid: true }],
    ['4', true, { hours: null, invalid: true }],
  ])('reads %j (badInput %s)', (value, badInput, expected) => {
    expect(parseHours(value, badInput)).toEqual(expected);
  });
});

describe('isBacklogStory', () => {
  it('puts a story with no sprint in the backlog', () => {
    expect(isBacklogStory(makeStory({ sprint_id: null }))).toBe(true);
  });
  it('keeps a sprint story out of the backlog', () => {
    expect(isBacklogStory(makeStory({ sprint_id: 'sp1' }))).toBe(false);
  });
  it('puts a legacy archived story in the backlog, whatever sprint it still names', () => {
    expect(isBacklogStory(makeStory({ sprint_id: 'sp1', archived_at: '2026-09-01T00:00:00Z' }))).toBe(true);
  });
});

describe('column helpers', () => {
  const tasks = [
    makeTask({ id: 'a', status: 'todo', points: 3 }),
    makeTask({ id: 'b', status: 'done', points: 5 }),
    makeTask({ id: 'c', status: 'todo', points: null }),
  ];
  it('sums points per column, treating null as 0', () => {
    expect(columnPoints(tasks, 'todo')).toBe(3);
    expect(columnPoints(tasks, 'done')).toBe(5);
    expect(columnPoints(tasks, 'in_progress')).toBe(0);
  });
  it('filters by status', () => {
    expect(tasksIn(tasks, 'todo').map((t) => t.id)).toEqual(['a', 'c']);
  });
  it('collects across stories and narrows to one story', () => {
    const stories = [
      makeStory({ id: 's1', tasks: [makeTask({ id: 'a' })] }),
      makeStory({ id: 's2', tasks: [makeTask({ id: 'b' })] }),
    ];
    expect(collectTasks(stories).map((t) => t.id)).toEqual(['a', 'b']);
    expect(collectTasks(stories, 's2').map((t) => t.id)).toEqual(['b']);
  });
});

describe('prLabel / prState', () => {
  it('labels GitHub pulls and GitLab merge requests', () => {
    expect(prLabel('https://github.com/o/r/pull/42', 'github')).toBe('PR #42');
    expect(prLabel('https://git.ucsc.edu/g/p/-/merge_requests/17', 'gitlab')).toBe('!17');
  });
  it('returns null without a url and degrades on an unparseable one', () => {
    expect(prLabel(null, null)).toBeNull();
    expect(prLabel('https://github.com/o/r', 'github')).toBe('PR');
    expect(prLabel('https://git.ucsc.edu/g/p', 'gitlab')).toBe('MR');
  });
  it('maps only real states, everything else gray', () => {
    expect(prState('merged')).toBe('merged');
    expect(prState('open')).toBe('open');
    expect(prState('closed')).toBe('closed');
    expect(prState(null)).toBe('draft');
    expect(prState('weird')).toBe('draft');
  });
});

describe('sprint helpers', () => {
  it('rounds the share done to a whole percent, and is 0 with nothing to count', () => {
    expect(percentDone(0, 0)).toBe(0);
    expect(percentDone(1, 4)).toBe(25);
    expect(percentDone(2, 3)).toBe(67);
  });
  it("prints a sprint's dates as month and day", () => {
    expect(sprintDates({ starts_at: '2026-09-07', ends_at: '2026-09-20' })).toBe('Sep 7 – Sep 20');
  });
  it('labels the three sprint statuses', () => {
    expect(STATUS_LABELS).toEqual({ active: 'Active', planned: 'Planned', completed: 'Completed' });
  });
  it("starts a project's first sprint today and runs it two weeks", () => {
    expect(newSprintDraft([], new Date(2026, 9, 24, 15, 30))).toEqual({
      name: 'Sprint 1', starts_at: '2026-10-24', ends_at: '2026-11-06',
    });
  });
  it('starts the next sprint the day after the last one ends, when that is still ahead', () => {
    const sprints = [{ ends_at: '2026-10-11' }, { ends_at: '2026-10-25' }];
    expect(newSprintDraft(sprints, new Date(2026, 9, 24))).toEqual({
      name: 'Sprint 3', starts_at: '2026-10-26', ends_at: '2026-11-08',
    });
  });
  it('starts today when every sprint so far has ended', () => {
    expect(newSprintDraft([{ ends_at: '2026-09-20' }], new Date(2026, 9, 24)).starts_at).toBe('2026-10-24');
  });
});

describe('relativeTime', () => {
  it('is empty for missing/invalid timestamps', () => {
    expect(relativeTime(null)).toBe('');
    expect(relativeTime('not-a-date')).toBe('');
  });
  it('renders an ago suffix', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(relativeTime(twoHoursAgo)).toMatch(/ago$/);
  });
});

describe('config vocabularies', () => {
  it('slugifies ui/ux for the BEM modifier', () => {
    expect(tagSlug('ui/ux')).toBe('uiux');
    expect(tagSlug('backend')).toBe('backend');
  });
  it('matches the backend vocabularies', () => {
    expect(TASK_TAGS).toHaveLength(10);
    expect(ESTIMATE_SCALES.fibonacci).toEqual([1, 2, 3, 5, 8, 13]);
    expect(ESTIMATE_SCALES.linear).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ESTIMATE_SCALES.exponential).toEqual([1, 2, 4, 8, 16, 32]);
    expect(BOARD_COLUMNS.map((c) => c.id)).toEqual(['todo', 'in_progress', 'done']);
  });
});

describe('member resolution', () => {
  const map = buildMemberMap([
    { user_id: 'u1', name: 'Tony Wu', image_url: null, project_role: 'owner' },
  ]);
  it('resolves known members', () => {
    expect(personOf(map, 'u1').name).toBe('Tony Wu');
  });
  it('degrades for unassigned and unknown ids', () => {
    expect(personOf(map, null).name).toBe('Unassigned');
    expect(personOf(map, 'ghost').name).toBe('Unknown');
  });
});
