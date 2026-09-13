/** Staffing (assigning students to projects): endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiStaffingAssignmentRow,
  ApiStaffingPlacement,
  ApiStaffingProjectRank,
  ApiStaffingStudent,
} from './types';

export const staffingApi = {

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
