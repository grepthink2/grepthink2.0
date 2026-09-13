/** Projects, membership, join requests and project TSRs: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import { supabase } from '../supabaseClient';
import type {
  ApiIncomingJoinRequest,
  ApiProject,
  ApiProjectJoinRequest,
  ApiProjectMember,
  ApiProjectPendingInvite,
  ApiTSR,
  CreateProjectPayload,
  CreateTsrPayload,
} from './types';

export const projectsApi = {

  getProject: async (projectId: string) => {
    return apiRequest<{ project: ApiProject }>(`/api/projects/${projectId}`);
  },

  getProjects: async (classId?: string) => {
    const searchParams = new URLSearchParams();
    if (classId) {
      searchParams.set('class_id', classId);
    }
    const query = searchParams.toString();
    return apiRequest<{ projects: ApiProject[] }>(`/api/projects${query ? `?${query}` : ''}`);
  },

  requestJoinProject: async (projectId: string, message?: string) => {
    const trimmed = message?.trim();
    return apiRequest<{ message: string; request: { id: string; project_id: string; user_id: string }; project: ApiProject }>('/api/projects/request-join', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, message: trimmed ? trimmed : null }),
    });
  },

  getProjectJoinRequests: async (projectId: string) => {
    return apiRequest<{ requests: ApiProjectJoinRequest[] }>(`/api/projects/${projectId}/join-requests`);
  },

  /** Pending join requests on every team the caller reviews in a class, in one request. */
  getIncomingJoinRequests: async (classId: string) => {
    return apiRequest<{ requests: ApiIncomingJoinRequest[] }>(
      `/api/projects/incoming-join-requests?class_id=${encodeURIComponent(classId)}`,
    );
  },

  getPendingTeamInvites: async (classId: string) => {
    return apiRequest<{ requests: ApiProjectJoinRequest[] }>(
      `/api/projects/pending-invites?class_id=${encodeURIComponent(classId)}`,
    );
  },

  getMyJoinRequests: async (classId: string) => {
    return apiRequest<{ requests: ApiProjectJoinRequest[] }>(
      `/api/projects/my-join-requests?class_id=${encodeURIComponent(classId)}`,
    );
  },

  getProjectMembers: async (projectId: string) => {
    return apiRequest<{ members: ApiProjectMember[] }>(`/api/projects/${projectId}/members`);
  },

  createProjectTsr: async (projectId: string, data: CreateTsrPayload) => {
    return apiRequest<{ tsr: ApiTSR }>(`/api/tsrs`, {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        project_id: projectId,
        week: data.week ?? 1,
      }),
    });
  },

  getProjectTsrs: async (projectId: string) => {
    return apiRequest<{ tsrs: ApiTSR[] }>(`/api/tsrs/${projectId}`);
  },

  acceptProjectJoinRequest: async (requestId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No authenticated user available');
    }
    return apiRequest<{ message: string; user_id: string }>('/api/projects/accept-request', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, user_id: user.id }),
    });
  },

  rejectProjectJoinRequest: async (requestId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('No authenticated user available');
    }
    return apiRequest<{ message: string; user_id: string }>('/api/projects/reject-request', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId, user_id: user.id }),
    });
  },

  dismissJoinRequest: async (requestId: string) => {
    return apiRequest<{ message: string; request_id: string }>('/api/projects/dismiss-request', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    });
  },

  cancelJoinRequest: async (requestId: string) => {
    return apiRequest<{ message: string; request_id: string }>('/api/projects/cancel-request', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    });
  },

  cancelTeamInvite: async (requestId: string) => {
    return apiRequest<{ message: string; request_id: string }>('/api/projects/cancel-invite', {
      method: 'POST',
      body: JSON.stringify({ request_id: requestId }),
    });
  },

  getProjectPendingInvites: async (projectId: string) => {
    return apiRequest<{ invites: ApiProjectPendingInvite[] }>(`/api/projects/${projectId}/pending-invites`);
  },

  /** Create a project (full form: POST /api/projects) */
  createProject: async (data: CreateProjectPayload) => {
    return apiRequest<{ message: string; project: ApiProject }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Add a member to a project (instructor or authorized role). */
  addProjectMember: async (projectId: string, data: { user_id: string; role?: string }) => {
    return apiRequest<{ message: string; request?: { id: string } }>(`/api/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Remove a member from a project (instructor or authorized role). */
  removeProjectMember: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    });
  },

  /** Update a project's name, description, and/or team size (PATCH /api/projects/:id). */
  updateProject: async (projectId: string, data: {
    name?: string;
    description?: string;
    team_size?: number;
    image_url?: string | null;
  }) => {
    return apiRequest<{ message: string; project: ApiProject }>(`/api/projects/${projectId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Delete a project (DELETE /api/projects/:id). */
  deleteProject: async (projectId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}`, {
      method: 'DELETE',
    });
  },

  /** Assign the 'product owner' Scrum role to a member (POST /api/projects/:id/assign-product-owner). */
  assignProductOwner: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/assign-product-owner`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /** Assign the 'scrum master' role to a member (POST /api/projects/:id/assign-scrum-master). */
  assignScrumMaster: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/assign-scrum-master`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /** Assign the 'admin' role to a member (instructor or class TA only). */
  assignAdmin: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/assign-admin`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /** Demote the product owner back to member (POST /api/projects/:id/remove-product-owner). */
  removeProductOwner: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/remove-product-owner`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /** Demote the scrum master back to member (POST /api/projects/:id/remove-scrum-master). */
  removeScrumMaster: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/remove-scrum-master`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /** Demote an admin back to member (POST /api/projects/:id/remove-admin). */
  removeAdmin: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/remove-admin`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },
};
