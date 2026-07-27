import { supabase } from './supabaseClient';
import { assertWritableRequest } from './previewGuard';

/**
 * Read-tracking writes (mark-as-read) fire automatically as a side effect of
 * viewing a screen. In read-only preview we still block them, but silently —
 * surfacing a "changes disabled" toast for them would be noise, not signal.
 */
function isSilentWrite(endpoint: string): boolean {
  return /\/read(-all)?$/.test(endpoint);
}

// In dev, use relative paths so Vite proxy routes to the right backend (localhost or prod).
// In production builds, fall back to VITE_API_URL or same-origin.
const API_BASE_URL = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_URL || '');

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
  image_url?: string;
  status?: 'active' | 'complete';
  /** My Classes: live enrollment count from class_enrollments. */
  enrolled_count?: number;
}

/** Class-level role on a class_enrollments row. TAs keep global role 'student'. */
export type EnrollmentRole = 'student' | 'ta';

export interface ApiStudent {
  id: string;
  email: string;
  user_id?: string;
  role: string;
  /** Class-scoped role: 'student' or 'ta'. */
  enrollment_role?: EnrollmentRole;
  first_name?: string;
  last_name?: string;
  project_id?: string | null;
  project_name?: string | null;
}

/** A TA in a class, with the projects they oversee. */
export interface ApiClassTA {
  id: string;
  name: string;
  email: string | null;
  projects: { id: string; name: string | null }[];
}

// ----- TA meeting schedule + attendance (app/attendance backend) ------------

export type AttendanceStatus = 'present' | 'late' | 'absent' | 'unmarked';

export interface ApiAssignedTa {
  id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
}

export interface ApiTeamMeeting {
  project_id: string;
  project_name: string;
  meeting_day?: string | null;
  meeting_time?: string | null;
  zoom_url?: string | null;
  assigned_ta?: ApiAssignedTa | null;
  attendance_present: number;
  attendance_total: number;
}

export interface ApiTAMeetingSchedule {
  class_id: string;
  week_number: number;
  total_weeks: number;
  week_of?: string | null;
  /** Which meeting within the week this schedule's attendance reflects (1..meetings_per_week). */
  meeting_in_week: number;
  /** TA meetings per week for this class (1 = once weekly). */
  meetings_per_week: number;
  meeting_duration_minutes?: number | null;
  /** total_weeks * meetings_per_week. */
  total_meetings: number;
  teams: ApiTeamMeeting[];
}

/** A TA on the final-review schedule (Home TA, or the claimed Review TA). */
export interface ApiFinalReviewTa {
  user_id: string;
  name: string | null;
  email?: string | null;
  claimed_at?: string | null;
}

/** One team's row on the final-review schedule. */
export interface ApiFinalReviewTeam {
  project_id: string;
  name: string | null;
  /** ISO timestamptz of the team's review slot; null = unscheduled. */
  final_review_at: string | null;
  home_ta: ApiFinalReviewTa | null;
  /** The additional reviewer; null = open slot. */
  review_ta: ApiFinalReviewTa | null;
}

export interface ApiFinalReviewSchedule {
  class_id: string;
  /** The ONE shared Zoom room every final review happens in. */
  review_zoom_url: string | null;
  review_period_open: boolean;
  /** Teams where the current viewer is the Review TA. */
  my_review_count: number;
  teams: ApiFinalReviewTeam[];
}

/** Who entered a final-review score row: the team's Home TA (3 category
 * scores), its Review TA (one overall), or the instructor (one overall). */
export type FinalReviewScoreRole = 'home' | 'review' | 'instructor';

/** One student's saved scores for one scorer role (1.0–5.0, 0.1 steps). */
export interface ApiFinalReviewScoreRow {
  student_id: string;
  role: FinalReviewScoreRole;
  product: number | null;
  team: number | null;
  scrum: number | null;
  overall: number | null;
  notes: string | null;
  scored_by?: string | null;
  updated_at?: string | null;
}

/** The Review TA's structured notes worksheet for a team. */
export interface ApiFinalReviewNotes {
  content: Record<string, unknown>;
  template_version: number;
  updated_by?: string | null;
  updated_at?: string | null;
}

export interface ApiFinalReviewMember {
  user_id: string;
  name: string | null;
  email?: string | null;
}

export interface ApiFinalReviewDetail {
  project: { project_id: string; name: string | null; final_review_at: string | null };
  review_zoom_url: string | null;
  review_period_open: boolean;
  home_ta: ApiFinalReviewTa | null;
  review_ta: ApiFinalReviewTa | null;
  members: ApiFinalReviewMember[];
  scores: ApiFinalReviewScoreRow[];
  notes: ApiFinalReviewNotes | null;
  /** The viewer's relationship to THIS team (drives which columns are editable). */
  viewer_role: 'instructor' | 'home' | 'review' | 'ta';
}

/** Editable score fields for one student (role decides which apply). */
export interface FinalReviewScoreEntry {
  student_id: string;
  product?: number | null;
  team?: number | null;
  scrum?: number | null;
  overall?: number | null;
  notes?: string | null;
}

export interface ApiAttendanceEntry {
  person_id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
  status: AttendanceStatus;
}

export interface ApiTeamAttendance {
  project_id: string;
  week_number: number;
  meeting_in_week: number;
  entries: ApiAttendanceEntry[];
}

/** A class member with their class-TA designation flag (attendance feature). */
export interface ApiClassTa {
  user_id: string;
  name: string | null;
  email?: string | null;
  image_url?: string | null;
  is_ta: boolean;
}

/** A TA assigned to a specific project. */
export interface ApiProjectTA {
  user_id: string;
  name: string;
  email: string | null;
  assigned_at?: string;
}

export interface ApiRosterStudent {
  id: string;
  name: string;
  email: string;
  first_name?: string;
  last_name?: string;
  roster_email?: string;
  grepthink_email?: string;
  project?: string;
  class_status: 'enrolled' | 'waitlisted' | 'dropped' | 'not_on_roster' | 'manual';
  grepthink_status: 'registered' | 'not_registered';
  /** Class-scoped role: 'student' or 'ta' (only meaningful when registered). */
  enrollment_role?: EnrollmentRole;
  projects: string[];
  /** roster_entries.id — present only for manually added rows; used to delete them. */
  roster_entry_id?: string | null;
}

export interface ApiRosterTimelineStudent {
  id: string;
  name: string;
  email: string;
  class_status: ApiRosterStudent['class_status'];
  enrolled_at: string | null;
  team_joined_at: string | null;
  project_name: string | null;
  dropped_at: string | null;
}

export interface ApiRosterUploadResult {
  message: string;
  inserted_count: number;
  matched_count: number;
}

export interface ApiBulkInviteResult {
  results: { email: string; status: string }[];
  enrolled_count: number;
  invited_count: number;
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
  image_url?: string;
  /** Assigned product owner / scrum master (from API). */
  product_owner_name?: string | null;
  product_owner_email?: string | null;
  scrum_master_name?: string | null;
  scrum_master_email?: string | null;
  /** Aggregated team sentiment from TSRs: 'positive' | 'neutral' | 'negative'. */
  sentiment?: 'positive' | 'neutral' | 'negative' | null;
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
  message?: string | null;
  project_id?: string;
  project_name?: string;
  member_count?: number;
  sponsor_company?: string;
  course_label?: string;
  image_url?: string | null;
}

export interface ApiProjectPendingInvite {
  request_id: string;
  user_id: string;
  email?: string;
  invited_at?: string;
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
  edu_email?: string | null;
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
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
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
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
  email?: string;
  assignment_id?: string;
  created_at?: string;
}

/** TSR row returned by GET/PATCH /api/assignments/:id/tsrs */
export interface ApiAssignmentTsrEntry {
  tsr_id: string;
  evaluator_id: string;
  evaluatee_id: string;
  project_id?: string;
  evaluator_name?: string;
  evaluatee_name?: string;
  percent_contribution: number;
  positive_feedback: string;
  constructive_feedback?: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
}

export interface UpdateAssignmentTsrPayload {
  percent_contribution?: number;
  positive_feedback?: string;
  constructive_feedback?: string;
  scrum_master_tickets?: string;
  scrum_master_assessment?: string;
  scrum_master_notes?: string;
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
  /** Instructor list: any TSR row exists for this assignment */
  has_tsr_responses?: boolean;
  teams_submitted?: number;
  teams_total?: number;
  feedback_submitted?: number;
  feedback_total?: number;
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

export interface SubmitFeedbackPayload {
  q1_liked: string;
  q2_frustrating: string;
  q3_missing_feature: string;
  q4_bugs: string;
  q5_suggestions: string;
}

export interface ApiFeedbackSubmission {
  id: string;
  assignment_id: string;
  student_id: string;
  student_name?: string;
  q1_liked: string;
  q2_frustrating: string;
  q3_missing_feature: string;
  q4_bugs: string;
  q5_suggestions: string;
  created_at?: string;
  updated_at?: string;
}

export interface ApiFeedbackOverview {
  assignment: ApiAssignment;
  submissions: ApiFeedbackSubmission[];
  submitted_count: number;
  total_count: number;
  non_submitters: { id: string; name: string }[];
}

// ----- Messages ------------------------------------------------------------

export interface ApiMessageOtherUser {
  id: string;
  email: string | null;
  name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
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

export interface ApiNotification {
  id: string;
  type: 'join_request' | 'join_rejected' | 'message' | 'project_created' | 'complete_profile' | 'upload_roster' | 'member_removed';
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
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
  // Read-only preview: refuse mutating requests before they leave the browser.
  assertWritableRequest(options.method, isSilentWrite(endpoint));

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
 * Upload a file via multipart/form-data (no JSON Content-Type).
 */
export async function apiUpload<T = unknown>(
  endpoint: string,
  formData: FormData,
): Promise<T> {
  // Uploads are always writes (multipart POST) — block them in preview.
  assertWritableRequest('POST');

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  if (!token) {
    throw new Error('No authentication token available');
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(errorData.detail || `Upload failed with status ${response.status}`);
  }

  return response.json();
}

/** Build the ?week=&meeting= query for the TA-schedule endpoints. */
function scheduleQuery(week?: number, meeting?: number): string {
  const p = new URLSearchParams();
  if (week != null) p.set('week', String(week));
  // Send meeting only when explicitly chosen; omit it so the server defaults to
  // the current/next meeting for the week.
  if (meeting != null) p.set('meeting', String(meeting));
  const q = p.toString();
  return q ? `?${q}` : '';
}

/**
 * API client for backend endpoints
 */
export const api = {
  // Auth
  loginCheck: async () => {
    return apiRequest<{ message: string; user_id: string; role: string | null }>('/api/login-check');
  },

  checkEmail: async (email: string): Promise<{ available: boolean } | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/check-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  },

  /**
   * Create the profiles row for a newly-authenticated user.
   * The backend verifies that the JWT's ``sub`` matches ``userId`` in the
   * body, so the caller cannot provision a profile for someone else.
   */
  createUser: async (data: {
    userId: string;
    email: string;
    userType: 'student' | 'instructor';
    firstName?: string;
    lastName?: string;
    avatarUrl?: string;
  }) => {
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
    tsr_count?: number;
  }) => {
    return apiRequest<{ message: string; class: ApiClass }>('/api/classes', {
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

  updateClassStatus: async (classId: string, status: 'active' | 'complete') => {
    return apiRequest<{ message: string; class: ApiClass }>(`/api/classes/${classId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
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

  getClassRoster: async (classId: string) => {
    return apiRequest<{ students: ApiRosterStudent[]; uploaded_at: string | null }>(
      `/api/classes/${classId}/roster`,
    );
  },

  /** Enrollment, team-join, and drop timestamps (instructor only). */
  getClassRosterTimeline: async (classId: string) => {
    return apiRequest<{ students: ApiRosterTimelineStudent[] }>(
      `/api/classes/${classId}/roster/timeline`,
    );
  },

  uploadClassRoster: async (classId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload<ApiRosterUploadResult>(`/api/classes/${classId}/roster`, formData);
  },

  addManualRosterStudent: async (
    classId: string,
    data: { first_name: string; last_name: string; email: string },
  ) => {
    return apiRequest<{ message: string }>(`/api/classes/${classId}/roster/manual`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteManualRosterEntry: async (classId: string, entryId: string) => {
    return apiRequest<{ message: string; entry_id: string }>(
      `/api/classes/${classId}/roster/manual/${entryId}`,
      { method: 'DELETE' },
    );
  },

  inviteStudent: async (classId: string, studentEmail: string) => {
    return apiRequest<{ message: string; student_email: string }>(
      `/api/classes/${classId}/invite`,
      {
        method: 'POST',
        body: JSON.stringify({ student_email: studentEmail }),
      },
    );
  },

  removeStudentFromClass: async (classId: string, studentId: string) => {
    return apiRequest<{ message: string; student_id: string }>(
      `/api/classes/${classId}/students/${studentId}`,
      { method: 'DELETE' },
    );
  },

  // Student leaves a class they're enrolled in.
  leaveClass: async (classId: string) => {
    return apiRequest<{ message: string; class_id: string }>(
      `/api/classes/${classId}/leave`,
      { method: 'DELETE' },
    );
  },

  bulkInviteStudents: async (classId: string, emails: string[]) => {
    return apiRequest<ApiBulkInviteResult>(
      `/api/classes/${classId}/students/bulk-invite`,
      {
        method: 'POST',
        body: JSON.stringify({ emails }),
      },
    );
  },

  queueInvite: async (
    classId: string,
    emails: string[],
    customSubject?: string,
    customBody?: string,
    customBodyHtml?: string,
    cc?: string[],
    bcc?: string[],
  ) => {
    return apiRequest<{ job_id: string; send_at: string }>(
      `/api/classes/${classId}/invites/queue`,
      {
        method: 'POST',
        body: JSON.stringify({
          emails,
          ...(customSubject !== undefined && { custom_subject: customSubject }),
          ...(customBody !== undefined && { custom_body: customBody }),
          ...(customBodyHtml !== undefined && { custom_body_html: customBodyHtml }),
          ...(cc && cc.length > 0 && { cc }),
          ...(bcc && bcc.length > 0 && { bcc }),
        }),
      },
    );
  },

  cancelInvite: async (classId: string, jobId: string) => {
    return apiRequest<{ cancelled: boolean }>(
      `/api/classes/${classId}/invites/${jobId}`,
      { method: 'DELETE' },
    );
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

  /**
   * Projects + enrolled-student list for the Projects page in a single request.
   * Backed by one endpoint that reads each underlying table once, replacing the
   * two parallel getClassProjects + getClassStudents calls.
   */
  getClassProjectsOverview: async (classId: string) => {
    return apiRequest<{ projects: ApiProject[]; students: ApiStudent[] }>(
      `/api/classes/${classId}/projects-overview`,
    );
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

  /** Delete an assignment (instructor only — DELETE /api/assignments/:id) */
  deleteAssignment: async (assignmentId: string) => {
    return apiRequest<{ message: string }>(`/api/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  },

  /** Student's TSR submissions for an assignment (GET /api/assignments/:id/tsrs) */
  getMyAssignmentTsrs: async (assignmentId: string) => {
    return apiRequest<{ tsrs: ApiAssignmentTsrEntry[] }>(`/api/assignments/${assignmentId}/tsrs`);
  },

  /** Instructor: all TSR responses for an assignment (GET /api/assignments/:id/tsr-overview) */
  getAssignmentTsrOverview: async (assignmentId: string) => {
    return apiRequest<{
      assignment: ApiAssignment;
      projects: { id: string; name: string }[];
      entries: ApiAssignmentTsrEntry[];
      non_submitters_by_project: Record<string, { id: string; name: string }[]>;
    }>(`/api/assignments/${assignmentId}/tsr-overview`);
  },

  /** Update one TSR row linked to an assignment (PATCH /api/assignments/:id/tsrs/:tsrId) */
  updateAssignmentTsr: async (
    assignmentId: string,
    tsrId: string,
    data: UpdateAssignmentTsrPayload,
  ) => {
    return apiRequest<{ message: string; tsr: ApiAssignmentTsrEntry }>(
      `/api/assignments/${assignmentId}/tsrs/${tsrId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data),
      },
    );
  },

  /** Submit (or update) a student's feedback response (POST /api/assignments/:id/feedback) */
  submitFeedback: async (assignmentId: string, data: SubmitFeedbackPayload) => {
    return apiRequest<{ message: string; submission: ApiFeedbackSubmission }>(
      `/api/assignments/${assignmentId}/feedback`,
      { method: 'POST', body: JSON.stringify(data) },
    );
  },

  /** Student's own feedback submission (GET /api/assignments/:id/feedback/me) */
  getMyFeedback: async (assignmentId: string) => {
    return apiRequest<{ submission: ApiFeedbackSubmission | null }>(
      `/api/assignments/${assignmentId}/feedback/me`,
    );
  },

  /** Instructor overview of all feedback responses (GET /api/assignments/:id/feedback/overview) */
  getFeedbackOverview: async (assignmentId: string) => {
    return apiRequest<ApiFeedbackOverview>(
      `/api/assignments/${assignmentId}/feedback/overview`,
    );
  },

  // ----- Teaching Assistants (TAs) -----------------------------------------

  /** Instructor: list a class's TAs with the projects they oversee. */
  getClassTAs: async (classId: string) => {
    return apiRequest<{ tas: ApiClassTA[] }>(`/api/tas/classes/${classId}`);
  },

  /** Instructor: promote an enrolled student to TA. */
  promoteToTA: async (classId: string, userId: string) => {
    return apiRequest<{ message: string; user_id: string }>(
      `/api/tas/classes/${classId}/promote`,
      { method: 'POST', body: JSON.stringify({ user_id: userId }) },
    );
  },

  /** Instructor: demote a TA back to a regular student. */
  demoteTA: async (classId: string, userId: string) => {
    return apiRequest<{ message: string; user_id: string }>(
      `/api/tas/classes/${classId}/demote`,
      { method: 'POST', body: JSON.stringify({ user_id: userId }) },
    );
  },

  /** The current user's class-level role: 'instructor' | 'ta' | 'student' | null. */
  getMyEnrollmentRole: async (classId: string) => {
    return apiRequest<{ enrollment_role: 'instructor' | EnrollmentRole | null }>(
      `/api/tas/classes/${classId}/my-role`,
    );
  },

  // ----- TA meeting schedule + attendance (app/attendance backend) ----------

  /** Instructor: weekly schedule of every team's meeting slot + attendance. */
  getTAMeetingSchedule: async (classId: string, week?: number, meeting?: number) => {
    return apiRequest<ApiTAMeetingSchedule>(`/api/classes/${classId}/ta-schedule${scheduleQuery(week, meeting)}`);
  },

  /** TA: only the teams assigned to me in this class + week. */
  getMyAssignedTeams: async (classId: string, week?: number, meeting?: number) => {
    return apiRequest<ApiTAMeetingSchedule>(`/api/classes/${classId}/ta-schedule/mine${scheduleQuery(week, meeting)}`);
  },

  /** Student: my own team's meeting slot + my own attendance for the week. */
  getMyTeamSchedule: async (classId: string, week?: number, meeting?: number) => {
    return apiRequest<ApiTAMeetingSchedule>(`/api/classes/${classId}/ta-schedule/my-team${scheduleQuery(week, meeting)}`);
  },

  /** Roster + statuses for one team's check-in panel (week + meeting scoped). */
  getTeamAttendance: async (projectId: string, week: number, meeting = 1) => {
    return apiRequest<ApiTeamAttendance>(`/api/projects/${projectId}/attendance?week=${week}&meeting=${meeting}`);
  },

  /** Mark one person present/late/absent for a (project, week, meeting). */
  upsertAttendance: async (
    projectId: string,
    week: number,
    personId: string,
    status: 'present' | 'late' | 'absent',
    meetingInWeek = 1,
  ) => {
    return apiRequest<{ message: string; record: unknown }>(
      `/api/projects/${projectId}/attendance`,
      {
        method: 'PUT',
        body: JSON.stringify({ week_number: week, meeting_in_week: meetingInWeek, person_id: personId, status }),
      },
    );
  },

  /** Mark every team member present for a (project, week, meeting). */
  markAllPresent: async (projectId: string, week: number, meetingInWeek = 1) => {
    return apiRequest<{ message: string; records: unknown[] }>(
      `/api/projects/${projectId}/attendance/mark-all-present`,
      { method: 'POST', body: JSON.stringify({ week_number: week, meeting_in_week: meetingInWeek }) },
    );
  },

  /** Instructor: set how many TA meetings/week + per-meeting duration for a class. */
  setMeetingCadence: async (
    classId: string,
    data: { meetings_per_week?: number; meeting_duration_minutes?: number },
  ) => {
    return apiRequest<{ message: string; class: ApiClass }>(
      `/api/classes/${classId}/meeting-cadence`,
      { method: 'PATCH', body: JSON.stringify(data) },
    );
  },

  /** Set a team's weekly meeting slot (day/time/Zoom) for a given meeting-in-week. */
  updateProjectMeeting: async (
    projectId: string,
    data: { meeting_in_week?: number; zoom_url?: string | null; meeting_day?: string | null; meeting_time?: string | null },
  ) => {
    return apiRequest<{ message: string; meeting: { meeting_id: string; meeting_in_week: number; meeting_day: string | null; meeting_time: string | null; zoom_url: string | null } }>(
      `/api/projects/${projectId}/meeting`,
      { method: 'PATCH', body: JSON.stringify(data) },
    );
  },

  /** Instructor: enrolled students with their class-TA flag (attendance UI). */
  getClassTaRoster: async (classId: string) => {
    return apiRequest<{ tas: ApiClassTa[] }>(`/api/classes/${classId}/tas`);
  },

  /** Instructor: designate (isTa=true) or remove (isTa=false) a class TA. */
  setClassTA: async (classId: string, userId: string, isTa: boolean) => {
    return apiRequest<{ message: string; user_id: string; is_ta: boolean }>(
      `/api/classes/${classId}/tas`,
      { method: 'POST', body: JSON.stringify({ user_id: userId, is_ta: isTa }) },
    );
  },

  /** Instructor: assign (taId) or clear (null) the TA for a project. */
  assignProjectTA: async (projectId: string, taId: string | null) => {
    return apiRequest<{ message: string; project_id: string; assigned_ta_id: string | null }>(
      `/api/projects/${projectId}/assign-ta`,
      { method: 'POST', body: JSON.stringify({ ta_id: taId }) },
    );
  },

  /** TA: the projects they oversee plus the class's TSR assignments. */
  getTAReviewTargets: async (classId: string) => {
    return apiRequest<{
      projects: { id: string; name: string | null }[];
      assignments: ApiAssignment[];
    }>(`/api/tas/classes/${classId}/review-targets`);
  },

  /** TAs assigned to a project (instructor or any class member). */
  getProjectTAs: async (projectId: string) => {
    return apiRequest<{ tas: ApiProjectTA[] }>(`/api/tas/projects/${projectId}`);
  },

  // ----- Final Reviews (end-of-quarter review schedule) ---------------------

  /** Instructor/TA: the class's full final-review schedule + viewer's count. */
  getFinalReviewSchedule: async (classId: string) => {
    return apiRequest<ApiFinalReviewSchedule>(`/api/tas/classes/${classId}/final-reviews`);
  },

  /** Instructor: open or close the class's review sign-up window. */
  setReviewWindow: async (classId: string, open: boolean) => {
    return apiRequest<{ message: string; class_id: string; review_period_open: boolean }>(
      `/api/tas/classes/${classId}/review-window`,
      { method: 'POST', body: JSON.stringify({ open }) },
    );
  },

  /** Instructor: set (or clear, with null) the class's shared review Zoom room. */
  setReviewZoom: async (classId: string, zoomUrl: string | null) => {
    return apiRequest<{ message: string; class_id: string; review_zoom_url: string | null }>(
      `/api/tas/classes/${classId}/review-zoom`,
      { method: 'POST', body: JSON.stringify({ zoom_url: zoomUrl }) },
    );
  },

  /** Instructor: set (or clear, with null) a team's final-review slot (ISO time). */
  setFinalReviewTime: async (projectId: string, scheduledAt: string | null) => {
    return apiRequest<{ message: string; project_id: string; final_review_at: string | null }>(
      `/api/tas/projects/${projectId}/review-time`,
      { method: 'POST', body: JSON.stringify({ scheduled_at: scheduledAt }) },
    );
  },

  /** Claim a team's Review-TA slot: TA self-appoints (omit userId); instructor appoints anyone. */
  setReviewTA: async (projectId: string, userId?: string) => {
    return apiRequest<{ message: string; project_id: string; user_id: string }>(
      `/api/tas/projects/${projectId}/review-tas`,
      { method: 'POST', body: JSON.stringify({ user_id: userId ?? null }) },
    );
  },

  /** Release a team's Review-TA slot (the reviewer themselves, or the instructor). */
  releaseReviewTA: async (projectId: string, userId: string) => {
    return apiRequest<{ message: string; project_id: string; user_id: string }>(
      `/api/tas/projects/${projectId}/review-tas/${userId}`,
      { method: 'DELETE' },
    );
  },

  /** One team's full review workspace: members, all scores, notes (staff only). */
  getFinalReviewDetail: async (projectId: string) => {
    return apiRequest<ApiFinalReviewDetail>(`/api/tas/projects/${projectId}/final-review`);
  },

  /** Bulk-upsert one scorer role's rows (Home TA / Review TA / instructor). */
  saveFinalReviewScores: async (
    projectId: string,
    role: FinalReviewScoreRole,
    scores: FinalReviewScoreEntry[],
  ) => {
    return apiRequest<{ message: string; project_id: string; role: string; saved: number }>(
      `/api/tas/projects/${projectId}/final-review/scores`,
      { method: 'PUT', body: JSON.stringify({ role, scores }) },
    );
  },

  /** Replace the team's structured review-notes worksheet (Review TA / instructor). */
  saveFinalReviewNotes: async (
    projectId: string,
    content: Record<string, unknown>,
    templateVersion: number,
  ) => {
    return apiRequest<{ message: string; project_id: string; notes: ApiFinalReviewNotes }>(
      `/api/tas/projects/${projectId}/final-review/notes`,
      { method: 'PUT', body: JSON.stringify({ content, template_version: templateVersion }) },
    );
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

  // ----- Notifications -----------------------------------------------------

  getNotifications: async () => {
    return apiRequest<{ notifications: ApiNotification[]; unread_count: number }>(
      '/api/notifications',
    );
  },

  markNotificationRead: async (notificationId: string) => {
    return apiRequest<void>(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  },

  markAllNotificationsRead: async () => {
    return apiRequest<void>('/api/notifications/read-all', {
      method: 'POST',
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
