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
  ApiScrumSprint,
  ApiScrumStory,
  ApiScrumTask,
  ApiUpdateStoryBody,
  ApiUpdateTaskBody,
} from './types';

export const scrumApi = {

  // ----- Scrum board (app/scrum backend) ----------------------------------

  getScrumBoard: async (projectId: string, sprintId?: string) => {
    const query = sprintId ? `?sprint_id=${sprintId}` : '';
    return apiRequest<ApiScrumBoard>(`/api/projects/${projectId}/scrum/board${query}`);
  },

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
    body: Partial<Pick<ApiScrumSprint, 'name' | 'starts_at' | 'ends_at' | 'status'>>,
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

  moveScrumTask: async (taskId: string, toStatus: ApiBoardStatus) => {
    return apiRequest<{ message: string; task: ApiScrumTask }>(
      `/api/scrum/tasks/${taskId}/move`,
      { method: 'POST', body: JSON.stringify({ to_status: toStatus }) },
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
};
