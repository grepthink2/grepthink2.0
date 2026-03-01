import { supabase } from './supabaseClient';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export interface ApiClass {
  id: string;
  name: string;
  description?: string;
  course_code?: string;
  created_by: string;
  created_at: string;
  teacher_email?: string;
}

export interface ApiStudent {
  id: string;
  email: string;
  user_id: string;
  role: string;
}

export interface ApiProject {
  id: string;
  class_id: string;
  name: string;
  description?: string;
  created_by: string;
  created_at: string;
  creator_email?: string;
  team_size?: number;
  looking_for_roles?: string[];
  skills?: string[];
  /** Current user's role on this project (owner, admin, member, etc.), when authenticated. */
  user_role?: string | null;
}

export interface ApiProjectJoinRequest {
  request_id: string;
  user_id: string;
  email?: string;
  user_role?: string;
  requested_at?: string;
  status: string;
}

export interface ApiProjectMember {
  user_id: string;
  email?: string;
  user_role?: string;
  project_role: string;
  joined_at: string;
}

export interface CreateProjectPayload {
  class_id: string;
  name: string;
  description?: string;
  team_size: number;
  looking_for_roles?: string[];
  skills?: string[];
}

export interface CreateTsrPayload {
  evaluatee_id: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_notes: string;
}

export interface ApiTSR {
  evaluator_id?: string;
  evaluatee_id?: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_notes?: string;
  email?: string;
}

/**
 * Make an authenticated API request to the backend
 */
export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  // Get the current session token
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token available');
  }

  // Prepare headers
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers,
  };

  // Make the request
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle errors
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(errorData.detail || `Request failed with status ${response.status}`);
  }

  // Parse and return JSON
  return response.json();
}

/**
 * API client for backend endpoints
 */
export const api = {
  // Auth
  loginCheck: async () => {
    return apiRequest<{ message: string; user_id: string; role: string }>('/api/login-check');
  },

  // Classes
  createClass: async (data: { name: string; description?: string }) => {
    return apiRequest('/api/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getClasses: async () => {
    return apiRequest<{ classes: ApiClass[] }>('/api/classes');
  },

  getClass: async (classId: string) => {
    return apiRequest<{ class: ApiClass }>(`/api/classes/${classId}`);
  },

  // Student joins class by course code. Returns {message, class} with class details
  joinClass: async (courseCode: string) => {
    return apiRequest<{ message: string; class: ApiClass }>('/api/classes/join', {
      method: 'POST',
      body: JSON.stringify({ course_code: courseCode }),
    });
  },

  getClassStudents: async (classId: string) => {
    return apiRequest<{ students: ApiStudent[] }>(`/api/classes/${classId}/students`);
  },

  // Projects
  createClassProject: async (classId: string, data: { name: string; description?: string }) => {
    return apiRequest<{ message: string; project: ApiProject }>(`/api/classes/${classId}/projects`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getClassProjects: async (classId: string) => {
    return apiRequest<{ projects: ApiProject[] }>(`/api/classes/${classId}/projects`);
  },

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

  requestJoinProject: async (projectId: string) => {
    return apiRequest<{ message: string; request: { id: string; project_id: string; user_id: string }; project: ApiProject }>('/api/projects/request-join', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    });
  },

  getProjectJoinRequests: async (projectId: string) => {
    return apiRequest<{ requests: ApiProjectJoinRequest[] }>(`/api/projects/${projectId}/join-requests`);
  },

  getProjectMembers: async (projectId: string) => {
    return apiRequest<{ members: ApiProjectMember[] }>(`/api/projects/${projectId}/members`);
  },

  createProjectTsr: async (projectId: string, data: CreateTsrPayload) => {
    return apiRequest<{ TSR: ApiTSR }>(`/api/projects/${projectId}/create_tsr`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getProjectTsrs: async (projectId: string) => {
    return apiRequest<{ TSR: ApiTSR[] }>(`/api/projects/${projectId}/view_tsrs`);
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

  /** Create a project (full form: POST /api/projects) */
  createProject: async (data: CreateProjectPayload) => {
    return apiRequest<{ message: string; project: ApiProject }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Add a member to a project (instructor or authorized role). */
  addProjectMember: async (projectId: string, data: { user_id: string; role?: string }) => {
    return apiRequest<{ message: string }>(`/api/projects/${projectId}/members`, {
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
};
