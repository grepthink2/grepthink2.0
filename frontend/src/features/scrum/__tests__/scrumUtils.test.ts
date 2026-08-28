import { describe, expect, it } from 'vitest';
import { storyRollup, columnPoints, tasksIn, collectTasks } from '../utils/rollups';
import { prLabel, prState } from '../utils/prLabel';
import { relativeTime } from '../utils/relativeTime';
import { tagSlug, ESTIMATE_SCALES, TASK_TAGS, BOARD_COLUMNS } from '../config/scrumTags';
import { buildMemberMap, personOf } from '../scrumTypes';
import type { ApiScrumStory, ApiScrumTask } from '@/lib/api';

const task = (over: Partial<ApiScrumTask>): ApiScrumTask => ({
  id: 't1', story_id: 's1', key: 'T-1', title: 'Task', description_md: null,
  points: null, time_estimate: null, status: 'todo', reporter_id: 'u1',
  assignee_id: null, tags: [], pr_url: null, pr_provider: null, pr_state: null,
  moved_by: null, moved_by_name: null, moved_at: null, comment_count: 0, ...over,
});

const story = (over: Partial<ApiScrumStory>): ApiScrumStory => ({
  id: 's1', sprint_id: 'sp1', key: 'US-1', title: 'Story', description_md: null,
  points: null, time_estimate: null, reporter_id: 'u1', assignee_id: null,
  archived_at: null, comment_count: 0, tasks: [], ...over,
});

describe('storyRollup', () => {
  it('derives task/point progress from children', () => {
    const s = story({
      points: 8,
      tasks: [
        task({ id: 'a', status: 'done', points: 3 }),
        task({ id: 'b', status: 'done', points: 2 }),
        task({ id: 'c', status: 'todo', points: 5 }),
        task({ id: 'd', status: 'in_progress', points: null }),
      ],
    });
    expect(storyRollup(s)).toEqual({
      tasksDone: 2, tasksTotal: 4, pointsDone: 5, points: 8, percent: 50,
    });
  });

  it('is safe for a story with no tasks or no estimate', () => {
    expect(storyRollup(story({}))).toEqual({
      tasksDone: 0, tasksTotal: 0, pointsDone: 0, points: 0, percent: 0,
    });
  });
});

describe('column helpers', () => {
  const tasks = [
    task({ id: 'a', status: 'todo', points: 3 }),
    task({ id: 'b', status: 'done', points: 5 }),
    task({ id: 'c', status: 'todo', points: null }),
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
      story({ id: 's1', tasks: [task({ id: 'a' })] }),
      story({ id: 's2', tasks: [task({ id: 'b' })] }),
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
