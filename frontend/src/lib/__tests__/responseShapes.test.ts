import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ApiAssignmentTsrEntry,
  ApiClass,
  ApiProject,
  ApiScrumBoard,
  ApiScrumComment,
  ApiScrumSprint,
  ApiScrumTask,
} from '../api/types';

// These calls are checked at the `apiRequest` seam. Each answers its resource whichever shape
// the backend sends: the resource itself, or { message, <resource> } from a backend deployed
// before this client (the two deploy separately).
const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('../api/client', () => ({ apiRequest }));

import { assignmentsApi } from '../api/assignments';
import { classesApi } from '../api/classes';
import { projectsApi } from '../api/projects';
import { scrumApi } from '../api/scrum';

const TASK: ApiScrumTask = {
  id: 't1',
  story_id: 's1',
  key: 'GT-1',
  title: 'Search',
  description_md: null,
  points: 3,
  estimate_hours: null,
  status: 'done',
  reporter_id: 'u1',
  assignee_id: null,
  tags: [],
  pr_url: null,
  pr_provider: null,
  pr_state: null,
  moved_by: 'u1',
  moved_by_name: 'Tony Wu',
  moved_at: '2026-10-21T12:00:00Z',
  comment_count: 0,
  depends_on: [],
  blocks: [],
};
const COMMENT: ApiScrumComment = {
  id: 'c1',
  author_id: 'u1',
  author_name: 'Tony Wu',
  body_md: 'Looks good',
  created_at: '2026-10-21T12:00:00Z',
};
const SPRINT: ApiScrumSprint = {
  id: 'sp1',
  name: 'Sprint 1',
  starts_at: '2026-10-19',
  ends_at: '2026-11-01',
  status: 'active',
};
const CLASS: ApiClass = {
  id: 'c1',
  name: 'CSE 115A',
  description: 'Fall term',
  course_code: 'FREE0001',
  created_by: 'u1',
  created_at: '2026-10-23T12:00:00Z',
  term: 'Fall',
  start_date: '2026-09-21',
  end_date: '2026-12-04',
  year: 2026,
  image_url: 'https://cdn.example/class-banner.svg',
  status: 'active',
  sprint_count: 5,
  sprint_frequency: 'biweekly',
  sprints_start_on: '2026-09-21',
};
/** Sprint 1's board, its burnup in hours: one of its two tasks has no points. */
const BOARD: ApiScrumBoard = {
  project: { id: 'p1', name: 'Trailhead', estimate_scale: 'fibonacci' },
  ai_enabled: false,
  sprints: [{
    ...SPRINT,
    progress: { tasks_done: 1, tasks_total: 2, points_done: 3, points_total: 3, hours_done: 4, hours_total: 9 },
  }],
  sprint_id: 'sp1',
  stories: [],
  backlog: [],
  burnup: {
    unit: 'hours',
    units_available: ['hours'],
    tasks_without_points: 1,
    sprint: { labels: ['Oct 19', 'Oct 20'], scope: [9, 9], completed: [0, 4], subtitle: null },
    cumulative: { labels: ['Sprint 1'], scope: [9], completed: [4], subtitle: null },
  },
  members: [],
  access: 'member',
  task_index: [],
};
const PROJECT: ApiProject = {
  id: 'p1',
  class_id: 'c1',
  name: 'Trailhead',
  description: 'Bike sharing',
  created_by: 'u1',
  created_at: '2026-10-23T12:00:00Z',
  team_size: 4,
};
const ENTRY: ApiAssignmentTsrEntry = {
  tsr_id: 'tsr1',
  evaluator_id: 'u1',
  evaluatee_id: 'u2',
  evaluator_name: 'Tony Wu',
  evaluatee_name: 'Ana Xu',
  percent_contribution: 50,
  positive_feedback: 'Steady work',
};

beforeEach(() => {
  apiRequest.mockReset();
});

describe('moveScrumTask', () => {
  it.each([
    ['the task itself', TASK],
    ['{ message, task }', { message: 'Task moved successfully', task: TASK }],
  ])('answers the task when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    await expect(scrumApi.moveScrumTask('t1', 'done')).resolves.toEqual(TASK);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/scrum/tasks/t1/move');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ to_status: 'done' });
  });
});

describe('createScrumComment', () => {
  it.each([
    ['the comment itself', COMMENT],
    ['{ message, comment }', { message: 'Comment added successfully', comment: COMMENT }],
  ])('answers the comment when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    await expect(scrumApi.createScrumComment('tasks', 't1', 'Looks good')).resolves.toEqual(COMMENT);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/scrum/tasks/t1/comments');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ body_md: 'Looks good' });
  });
});

describe('createSprint', () => {
  it.each([
    ['the sprint itself', SPRINT],
    ['{ message, sprint }', { message: 'Sprint created successfully', sprint: SPRINT }],
  ])('answers the sprint when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    const fields = { name: 'Sprint 1', starts_at: '2026-10-19', ends_at: '2026-11-01' };
    await expect(scrumApi.createSprint('p1', fields)).resolves.toEqual(SPRINT);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/projects/p1/scrum/sprints');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(fields);
  });
});

describe('updateSprint', () => {
  it.each([
    ['the sprint itself', SPRINT],
    ['{ message, sprint }', { message: 'Sprint updated successfully', sprint: SPRINT }],
  ])('answers the sprint when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    await expect(scrumApi.updateSprint('sp1', { name: 'Sprint 1' })).resolves.toEqual(SPRINT);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/scrum/sprints/sp1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ name: 'Sprint 1' });
  });
});

describe('getScrumBoard', () => {
  it('answers the board as the backend sends it, its burnup in the unit asked for', async () => {
    apiRequest.mockResolvedValue(BOARD);
    await expect(scrumApi.getScrumBoard('p1', 'sp1', 'hours')).resolves.toEqual(BOARD);
    expect(apiRequest).toHaveBeenCalledWith('/api/projects/p1/scrum/board?sprint_id=sp1&unit=hours');
  });
});

describe('createClass', () => {
  it.each([
    ['the class itself', CLASS],
    ['{ message, class }', { message: 'Class created successfully', class: CLASS }],
  ])('answers the class when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    const fields: Parameters<typeof classesApi.createClass>[0] = {
      name: 'CSE 115A',
      term: 'Fall',
      start_date: '2026-09-21',
      end_date: '2026-12-04',
      sprint_count: 5,
      sprint_frequency: 'biweekly',
    };
    await expect(classesApi.createClass(fields)).resolves.toEqual(CLASS);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/classes');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(fields);
  });
});

describe('updateClassEndDate', () => {
  it.each([
    ['the class itself', CLASS],
    ['{ message, class }', { message: 'Last day of classes updated', class: CLASS }],
  ])('answers the class when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    await expect(classesApi.updateClassEndDate('c1', '2026-12-04')).resolves.toEqual(CLASS);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/classes/c1/end-date');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ end_date: '2026-12-04' });
  });
});

describe('createProject', () => {
  it.each([
    ['the project itself', PROJECT],
    ['{ message, project }', { message: 'Project created successfully', project: PROJECT }],
  ])('answers the project when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    const fields = { class_id: 'c1', name: 'Trailhead', description: 'Bike sharing', team_size: 4 };
    await expect(projectsApi.createProject(fields)).resolves.toEqual(PROJECT);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/projects');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(fields);
  });
});

describe('updateAssignmentTsr', () => {
  it.each([
    ['the entry itself', ENTRY],
    ['{ message, tsr }', { message: 'TSR updated successfully', tsr: ENTRY }],
  ])('answers the entry when the backend sends %s', async (_shape, body) => {
    apiRequest.mockResolvedValue(body);
    await expect(
      assignmentsApi.updateAssignmentTsr('a1', 'tsr1', { positive_feedback: 'Steady work' }),
    ).resolves.toEqual(ENTRY);
    const [path, init] = apiRequest.mock.calls[0];
    expect(path).toBe('/api/assignments/a1/tsrs/tsr1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ positive_feedback: 'Steady work' });
  });
});
