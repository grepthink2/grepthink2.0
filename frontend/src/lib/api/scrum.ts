/** Scrum board: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiAiDraft,
  ApiBoardStatus,
  ApiCreateStoryBody,
  ApiCreateTaskBody,
  ApiEstimateScale,
  ApiScrumBoard,
  ApiScrumComment,
  ApiScrumRepo,
  ApiScrumSprint,
  ApiScrumStory,
  ApiScrumSummary,
  ApiScrumTask,
  ApiTaskRef,
  ApiUpdateSprintBody,
  ApiUpdateStoryBody,
  ApiUpdateTaskBody,
} from './types';

export const scrumApi = {

  // ----- Scrum board (app/scrum backend) ----------------------------------

  getScrumBoard: async (projectId: string, sprintId?: string) => {
    const query = sprintId ? `?sprint_id=${sprintId}` : '';
    return apiRequest<ApiScrumBoard>(`/api/projects/${projectId}/scrum/board${query}`);
  },

  /** The sprint card's counts. Unlike the board, it records no board view. */
  getScrumSummary: async (projectId: string) =>
    apiRequest<ApiScrumSummary>(`/api/projects/${projectId}/scrum/summary`),

  updateScrumSettings: async (projectId: string, estimateScale: ApiEstimateScale) => {
    return apiRequest<void>(`/api/projects/${projectId}/scrum/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ estimate_scale: estimateScale }),
    });
  },

  createSprint: async (
    projectId: string,
    body: { name: string; starts_at: string; ends_at: string },
  ) => {
    return apiRequest<{ message: string; sprint: ApiScrumSprint }>(
      `/api/projects/${projectId}/scrum/sprints`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  updateSprint: async (
    sprintId: string,
    body: ApiUpdateSprintBody,
  ) => {
    return apiRequest<{ message: string; sprint: ApiScrumSprint }>(
      `/api/scrum/sprints/${sprintId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  },

  createStory: async (projectId: string, body: ApiCreateStoryBody) => {
    return apiRequest<{ message: string; story: ApiScrumStory }>(
      `/api/projects/${projectId}/scrum/stories`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  updateStory: async (storyId: string, body: ApiUpdateStoryBody) => {
    return apiRequest<{ message: string; story: ApiScrumStory }>(
      `/api/scrum/stories/${storyId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  },

  /** A backlog story and its tasks; 409 for a story in a sprint (move it to the backlog first). */
  deleteScrumStory: async (storyId: string) => {
    return apiRequest<void>(`/api/scrum/stories/${storyId}`, { method: 'DELETE' });
  },

  createScrumTask: async (storyId: string, body: ApiCreateTaskBody) => {
    return apiRequest<{ message: string; task: ApiScrumTask }>(
      `/api/scrum/stories/${storyId}/tasks`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  updateScrumTask: async (taskId: string, body: ApiUpdateTaskBody) => {
    return apiRequest<{ message: string; task: ApiScrumTask }>(
      `/api/scrum/tasks/${taskId}`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  },

  deleteScrumTask: async (taskId: string) => {
    return apiRequest<void>(`/api/scrum/tasks/${taskId}`, { method: 'DELETE' });
  },

  /** 409 with code `task_blocked` for a task in To do that depends on a task not yet done. */
  moveScrumTask: async (taskId: string, toStatus: ApiBoardStatus) => {
    return apiRequest<{ message: string; task: ApiScrumTask }>(
      `/api/scrum/tasks/${taskId}/move`,
      { method: 'POST', body: JSON.stringify({ to_status: toStatus }) },
    );
  },

  /** Make a task depend on another task of its project; answers with the task's dependencies. */
  addTaskDependency: async (taskId: string, dependsOnTaskId: string) => {
    return apiRequest<{ message: string; depends_on: ApiTaskRef[] }>(
      `/api/scrum/tasks/${taskId}/dependencies`,
      { method: 'POST', body: JSON.stringify({ depends_on_task_id: dependsOnTaskId }) },
    );
  },

  removeTaskDependency: async (taskId: string, dependsOnTaskId: string) => {
    return apiRequest<void>(
      `/api/scrum/tasks/${taskId}/dependencies/${dependsOnTaskId}`,
      { method: 'DELETE' },
    );
  },

  getScrumComments: async (parent: 'stories' | 'tasks', id: string) => {
    return apiRequest<{ comments: ApiScrumComment[] }>(`/api/scrum/${parent}/${id}/comments`);
  },

  createScrumComment: async (parent: 'stories' | 'tasks', id: string, bodyMd: string) => {
    return apiRequest<{ message: string; comment: ApiScrumComment }>(
      `/api/scrum/${parent}/${id}/comments`,
      { method: 'POST', body: JSON.stringify({ body_md: bodyMd }) },
    );
  },

  refreshScrumPrStates: async (projectId: string) => {
    return apiRequest<{ updated: Record<string, string> }>(
      `/api/projects/${projectId}/scrum/pr-refresh`,
      { method: 'POST' },
    );
  },

  aiDraftScrum: async (
    projectId: string,
    body: { kind: 'story' | 'tasks'; prompt: string; story_id?: string },
  ) => {
    return apiRequest<{ draft: ApiAiDraft }>(
      `/api/projects/${projectId}/scrum/ai-draft`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  getScrumRepos: async (projectId: string) => {
    return apiRequest<{ repos: ApiScrumRepo[] }>(`/api/projects/${projectId}/scrum/repos`);
  },

  addScrumRepo: async (projectId: string, body: { repo_url: string; access_token?: string }) => {
    return apiRequest<{ message: string; repo: ApiScrumRepo }>(
      `/api/projects/${projectId}/scrum/repos`,
      { method: 'POST', body: JSON.stringify(body) },
    );
  },

  deleteScrumRepo: async (repoId: string) => {
    return apiRequest<void>(`/api/scrum/repos/${repoId}`, { method: 'DELETE' });
  },
};
