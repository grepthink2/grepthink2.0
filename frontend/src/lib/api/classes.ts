/** Classes, rosters and class invites: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest, apiUpload } from './client';
import type {
  ApiBulkInviteResult,
  ApiClass,
  ApiClassAttention,
  ApiClassSprintSchedule,
  ApiProject,
  ApiRosterStudent,
  ApiRosterTimelineStudent,
  ApiRosterUploadResult,
  ApiSprintFrequency,
  ApiStudent,
  ApiTurnInStats,
} from './types';

export const classesApi = {

  // Classes
  /**
   * Create a class with its sprint schedule (an instructor account), from which every team made in
   * it gets its sprints; answers the class created. A schedule that starts before `start_date` or
   * over a year after it, or runs past `end_date`, is refused with a 422 whose detail says which.
   */
  createClass: async (data: {
    name: string;
    description?: string;
    term: string;
    start_date: string;
    /** The last day of classes, before finals: a YYYY-MM-DD day from `start_date` to 370 days after it. */
    end_date: string;
    tsr_count?: number;
    institution_id?: string;
    /** The class's "Tasks - External" link; omit for none. */
    external_tasks_url?: string;
    /** How many sprints every team gets, 1–20. */
    sprint_count: number;
    sprint_frequency: ApiSprintFrequency;
    /** The first sprint's first day (YYYY-MM-DD); `start_date` when omitted. */
    sprints_start_on?: string;
  }): Promise<ApiClass> => {
    const res = await apiRequest<ApiClass | { message: string; class: ApiClass }>('/api/classes', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // An older backend answers {message, class}.
    return 'class' in res ? res.class : res;
  },

  getClasses: async () => {
    return apiRequest<{ classes: ApiClass[] }>('/api/classes');
  },

  updateClassStatus: async (classId: string, status: 'active' | 'complete') => {
    return apiRequest<{ message: string; class: ApiClass }>(`/api/classes/${classId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Set or change (a full http(s) link) or remove (null) the class's "Tasks - External" link
  // (class instructor only). Returns {message, class} with the updated class.
  updateClassExternalTasksUrl: async (classId: string, externalTasksUrl: string | null) => {
    return apiRequest<{ message: string; class: ApiClass }>(`/api/classes/${classId}/external-tasks-url`, {
      method: 'PATCH',
      body: JSON.stringify({ external_tasks_url: externalTasksUrl }),
    });
  },

  /**
   * Set or change the class's last day of classes, before finals (a YYYY-MM-DD day from the class's
   * first week of term to 370 days after it; class instructor only). A day that would hide a week with
   * attendance, or that falls before the class's last sprint ends, is refused with a 409 whose detail
   * says what to do. Answers the updated class.
   */
  updateClassEndDate: async (classId: string, endDate: string): Promise<ApiClass> => {
    const res = await apiRequest<ApiClass | { message: string; class: ApiClass }>(
      `/api/classes/${classId}/end-date`,
      { method: 'PATCH', body: JSON.stringify({ end_date: endDate }) },
    );
    // An older backend answers {message, class}.
    return 'class' in res ? res.class : res;
  },

  /**
   * Set or change the class's sprint schedule (class instructor only), and every team's "Sprint 1"
   * … "Sprint N" follow it: the missing ones are made, the ones whose name or dates differ are
   * rewritten, and the ones past the count are deleted. A schedule that does not fit the class's
   * dates is refused with a 422, and one that would delete a sprint a team has a story in with a
   * 409, each with a detail that says why; both are checked before anything is written. Answers the
   * updated class, its number of teams, and the sprints created, updated and deleted across them.
   */
  updateClassSprints: async (classId: string, body: ApiClassSprintSchedule) => {
    return apiRequest<{ class: ApiClass; teams: number; created: number; updated: number; deleted: number }>(
      `/api/classes/${classId}/sprints`,
      { method: 'PATCH', body: JSON.stringify(body) },
    );
  },

  // Join a class by course code (any account that has picked a role; the class instructor cannot
  // join their own class). Returns {message, class} with class details
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

  /** Instructor home: roster alerts for every class the caller created, in one request. */
  getClassesAttentionSummary: async () => {
    return apiRequest<{ classes: ApiClassAttention[] }>('/api/classes/attention-summary');
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
};
