import type { ApiScrumBoard, ApiScrumMember, ApiScrumStory, ApiScrumTask } from '@/lib/api';

/**
 * Shared board fixtures. Every field of the API shapes is spelled out once
 * here, so a backend contract change breaks one file instead of five.
 */

export const makeTask = (over: Partial<ApiScrumTask> = {}): ApiScrumTask => ({
  id: 'a', story_id: 's1', key: 'T-1', title: 'Task', description_md: null,
  points: null, time_estimate: null, status: 'todo', reporter_id: 'u1',
  assignee_id: null, tags: [], pr_url: null, pr_provider: null, pr_state: null,
  moved_by: null, moved_by_name: null, moved_at: null, comment_count: 0, ...over,
});

export const makeStory = (over: Partial<ApiScrumStory> = {}): ApiScrumStory => ({
  id: 's1', sprint_id: 'sp1', key: 'US-1', title: 'Story', description_md: null,
  points: null, time_estimate: null, reporter_id: 'u1', assignee_id: null,
  archived_at: null, comment_count: 0, tasks: [], ...over,
});

export const makeMembers = (): ApiScrumMember[] => [
  { user_id: 'u1', name: 'Tony Wu', image_url: null, project_role: 'owner' },
];

export const makeBoard = (over: Partial<ApiScrumBoard> = {}): ApiScrumBoard => ({
  project: { id: 'p1', name: 'GrepThink', estimate_scale: 'fibonacci' },
  ai_enabled: false,
  sprints: [{ id: 'sp1', name: 'Sprint 1', starts_at: '2026-08-10', ends_at: '2026-08-23', status: 'active' }],
  sprint_id: 'sp1',
  stories: [makeStory({ points: 8, tasks: [makeTask()] })],
  backlog: [],
  burnup: { sprint: null, cumulative: { labels: [], scope: [], completed: [], subtitle: null } },
  members: makeMembers(),
  access: 'member',
  ...over,
});
