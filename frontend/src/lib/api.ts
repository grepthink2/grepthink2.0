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
  term?: string;
  start_date?: string;
  year?: number;
}

export interface ApiStudent {
  id: string;
  email: string;
  user_id?: string;
  role: string;
  first_name?: string;
  last_name?: string;
  project_id?: string | null;
  project_name?: string | null;
}

export interface ApiProfile {
  id: string;
  email: string;
  role: string;
  first_name?: string;
  last_name?: string;
  linkedin?: string;
  github?: string;
  image_url?: string;
  edu_email?: string;
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
  /** Current user's role on this project (from API). */
  user_role?: string | null;
  member_count?: number;
  // Sponsor information
  sponsor_name?: string;
  sponsor_company?: string;
  sponsor_email?: string;
  sponsor_website?: string;
  sponsor_description?: string;
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
  first_name?: string;
  last_name?: string;
  linkedin?: string;
  github?: string;
  image_url?: string;
}

export interface CreateProjectPayload {
  class_id: string;
  name: string;
  description?: string;
  team_size: number;
  looking_for_roles?: string[];
  skills?: string[];
  // Sponsor information
  sponsor_name?: string;
  sponsor_company?: string;
  sponsor_email?: string;
  sponsor_website?: string;
  sponsor_description?: string;
}

export interface CreateTsrPayload {
  evaluatee_id: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_notes: string;
  week?: number;
  assignment_id?: string;
}

export interface ApiTSR {
  id?: string;
  evaluator_id?: string;
  evaluatee_id?: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback: string;
  scrum_master_notes?: string;
  email?: string;
  assignment_id?: string;
  created_at?: string;
}

export interface ApiAssignment {
  id: string;
  /** Backend uses capital T for this column */
  Title: string;
  open_date: string;
  close_date: string;
  status: 'draft' | 'publish';
  class_id: string;
  assignment_type?: string;
  created_at?: string;
}

export interface ApiTurnInStats {
  rate: number;
  teamsSubmitted: { count: number; total: number };
  partialSubmissions: { count: number; total: number };
  currentAssignment?: string | null;
  closeDate?: string | null;
}

export interface CreateAssignmentPayload {
  class_id: string;
  title: string;
  open_date: string;
  close_date: string;
  status?: 'draft' | 'publish';
  assignment_type?: string;
}

export interface UpdateAssignmentPayload {
  title?: string;
  open_date?: string;
  close_date?: string;
  status?: 'draft' | 'publish';
  assignment_type?: string;
}

// ----- Messages ------------------------------------------------------------

export interface ApiMessageOtherUser {
  id: string;
  email: string | null;
  name: string | null;
}

export interface ApiMessagePreview {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiMessage {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface ApiConversationSummary {
  id: string;
  other_user: ApiMessageOtherUser;
  last_message: ApiMessagePreview | null;
  unread_count: number;
  other_user_last_read_at: string | null;
  can_send: boolean;
  last_message_at: string | null;
}

// ----- Staffing / Interest form -------------------------------------------

export interface ApiStaffingPeer {
  user_id: string;
  name: string | null;
  email: string | null;
}

export interface ApiStaffingRankedProject {
  id?: string;
  user_id?: string;
  class_id?: string;
  project_id: string;
  project_name: string | null;
  interest_value: number;
  interest_reason: string | null;
}

export interface ApiStaffingSubmission {
  user_id: string;
  class_id: string;
  taking_115c: boolean | null;
  previous_project_name: string | null;
  previous_project_link: string | null;
  notes: string | null;
  submitted_at: string | null;
  ranked_projects: ApiStaffingRankedProject[];
  work_with: ApiStaffingPeer[];
  dont_work_with: ApiStaffingPeer[];
}

export interface SubmitInterestFormPayload {
  taking_115c?: boolean | null;
  previous_project_name?: string | null;
  previous_project_link?: string | null;
  notes?: string | null;
  ranked_projects: Array<{
    project_id: string;
    interest_value: number;
    interest_reason?: string | null;
  }>;
  work_with: string[];
  dont_work_with: string[];
  submitted?: boolean;
}

export interface ApiStaffingProjectRank {
  project_id: string;
  project_name: string | null;
  breadth: number;
  depth: number;
  strength: number;
  num_staff: number;
  team_size: number;
  availability: number;
  breadth_rank: number;
  depth_rank: number;
  strength_rank: number;
  sum_of_ranks: number;
  total_rank: number;
}

export interface ApiStaffingAssignmentRow {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  assigned_project_id: string | null;
  assigned_project_name: string | null;
  role: string | null;
}

export interface ApiStaffingStudentAssignedProject {
  project_id: string;
  project_name: string | null;
  role: string | null;
}

export interface ApiStaffingStudent {
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  submitted_at: string | null;
  taking_115c: boolean | null;
  previous_project_name: string | null;
  previous_project_link: string | null;
  notes: string | null;
  preferences: Array<{
    project_id: string;
    project_name: string | null;
    interest_value: number;
    interest_reason: string | null;
  }>;
  work_with: ApiStaffingPeer[];
  dont_work_with: ApiStaffingPeer[];
  assigned_project: ApiStaffingStudentAssignedProject | null;
}

export interface ApiStaffingPlacement {
  user_id: string;
  project_id: string;
  project_name: string | null;
  interest_value: number;
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

  // 204 No Content / empty body — return undefined cast to T.
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
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
    return apiRequest<{ message: string; user_id: string; role: string | null }>('/api/login-check');
  },

  /**
   * Create the profiles row for a newly-authenticated user.
   * The backend verifies that the JWT's ``sub`` matches ``userId`` in the
   * body, so the caller cannot provision a profile for someone else.
   */
  createUser: async (data: { userId: string; email: string; userType: 'student' | 'instructor' }) => {
    return apiRequest<{ message: string; email: string; role: string }>('/api/create-user', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Classes
  createClass: async (data: {
    name: string;
    description?: string;
    term: string;
    start_date: string;
  }) => {
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

  getClassTurnInStats: async (classId: string) => {
    return apiRequest<{ turn_in: ApiTurnInStats }>(`/api/classes/${classId}/turn-in-stats`);
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

  /** Create a project (full form: POST /api/projects) */
  createProject: async (data: CreateProjectPayload) => {
    return apiRequest<{ message: string; project: ApiProject }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Test-only: create a project bypassing instructor check (POST /api/projects/test-create) */
  testCreateProject: async (data: CreateProjectPayload) => {
    return apiRequest<{ message: string; project: ApiProject }>('/api/projects/test-create', {
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

  /** Update a project's name, description, and/or team size (PATCH /api/projects/:id). */
  updateProject: async (projectId: string, data: { name?: string; description?: string; team_size?: number }) => {
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

  /** Assign the 'admin' role to a member (POST /api/projects/:id/assign-admin). */
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

  /** Get all assignments for a class (GET /api/assignments?class_id=...) */
  getAssignments: async (classId: string) => {
    return apiRequest<{ assignments: ApiAssignment[] }>(`/api/assignments?class_id=${classId}`);
  },

  /** Create an assignment (instructor only — POST /api/assignments) */
  createAssignment: async (data: CreateAssignmentPayload) => {
    return apiRequest<{ message: string; assignment: ApiAssignment }>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /** Edit an assignment (instructor only — PATCH /api/assignments/:id) */
  updateAssignment: async (assignmentId: string, data: UpdateAssignmentPayload) => {
    return apiRequest<{ message: string; assignment: ApiAssignment }>(`/api/assignments/${assignmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  // ----- Messages ----------------------------------------------------------

  /** Inbox: caller's conversations sorted by latest activity. */
  getConversations: async () => {
    return apiRequest<{ conversations: ApiConversationSummary[] }>('/api/messages/conversations');
  },

  /** Send a message — creates the conversation on first send to this user. */
  sendMessage: async (toUserId: string, body: string) => {
    return apiRequest<{ conversation_id: string; message: ApiMessage }>('/api/messages', {
      method: 'POST',
      body: JSON.stringify({ to_user_id: toUserId, body }),
    });
  },

  /** Latest 50 messages in a conversation (newest first). */
  getMessages: async (conversationId: string) => {
    return apiRequest<{ messages: ApiMessage[] }>(`/api/messages/conversations/${conversationId}/messages`);
  },

  /** Mark conversation as read through now(). 204 on success. */
  markConversationRead: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}/read`, {
      method: 'POST',
    });
  },

  /** Hide a conversation from the caller's inbox (idempotent). 204 on success.
   *  Other party's view is unaffected. Conversation reappears for caller if
   *  the other party sends a new message after this delete. */
  deleteConversation: async (conversationId: string) => {
    return apiRequest<void>(`/api/messages/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  },

  // ----- Staffing / Interest form ----------------------------------------

  /** Current user's full interest-form payload for the class. */
  getMyInterestSubmission: async (classId: string) => {
    return apiRequest<{ submission: ApiStaffingSubmission }>(
      `/api/staffing/${classId}/my-submission`,
    );
  },

  /** Current user's ranked-project rows for the class (highest first). */
  getMyInterests: async (classId: string) => {
    return apiRequest<{ interests: ApiStaffingRankedProject[] }>(
      `/api/staffing/${classId}/my-interests`,
    );
  },

  /**
   * Atomic full-form submit. Replaces the user's interest_form rows and
   * team_preferences for the class and upserts the background fields.
   */
  submitInterestForm: async (classId: string, data: SubmitInterestFormPayload) => {
    return apiRequest<{ message: string; submission: ApiStaffingSubmission }>(
      `/api/staffing/${classId}/submission`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    );
  },

  /** Per-project breadth/depth/strength + ranks (instructor). */
  getStaffingProjectRank: async (classId: string) => {
    return apiRequest<{ projects: ApiStaffingProjectRank[] }>(
      `/api/staffing/${classId}/project-rank`,
    );
  },

  /** Full per-student payload for the Assign UI (instructor). */
  getStaffingStudents: async (classId: string) => {
    return apiRequest<{ students: ApiStaffingStudent[] }>(
      `/api/staffing/${classId}/students`,
    );
  },

  /** All students + their current project assignment (instructor). */
  getStaffingAssignments: async (classId: string) => {
    return apiRequest<{ assignments: ApiStaffingAssignmentRow[] }>(
      `/api/staffing/${classId}/assignments`,
    );
  },

  /** Manually assign a student to a project (instructor). */
  staffingAssign: async (classId: string, userId: string, projectId: string) => {
    return apiRequest<{
      message: string;
      user_id: string;
      project_id: string;
      previous_project_ids?: string[];
    }>(`/api/staffing/${classId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, project_id: projectId }),
    });
  },

  /** Remove a student from their project assignment in this class. */
  staffingUnassign: async (classId: string, userId: string) => {
    return apiRequest<{ message: string; user_id: string }>(
      `/api/staffing/${classId}/unassign`,
      {
        method: 'POST',
        body: JSON.stringify({ user_id: userId }),
      },
    );
  },

  /** Greedy least-options-first auto-assign for unassigned students. */
  staffingAutoAssign: async (classId: string) => {
    return apiRequest<{ placements: ApiStaffingPlacement[] }>(
      `/api/staffing/${classId}/auto-assign`,
      { method: 'POST' },
    );
  },
};
