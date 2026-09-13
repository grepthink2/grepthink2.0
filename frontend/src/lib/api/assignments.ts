/** Assignments, TSR review and feedback: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiAssignment,
  ApiAssignmentTsrEntry,
  ApiFeedbackOverview,
  ApiFeedbackSubmission,
  ApiMySubmissions,
  CreateAssignmentPayload,
  SubmitFeedbackPayload,
  UpdateAssignmentPayload,
  UpdateAssignmentTsrPayload,
} from './types';

export const assignmentsApi = {

  /** Get all assignments for a class (GET /api/assignments?class_id=...) */
  getAssignments: async (classId: string) => {
    return apiRequest<{ assignments: ApiAssignment[] }>(`/api/assignments?class_id=${classId}`);
  },

  /** Student: own TSR + feedback submissions for every assignment in a class, in one request. */
  getMySubmissions: async (classId: string) => {
    return apiRequest<ApiMySubmissions>(`/api/assignments/my-submissions?class_id=${classId}`);
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
};
