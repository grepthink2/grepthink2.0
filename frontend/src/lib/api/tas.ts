/** TAs, team meetings, attendance and final reviews: endpoint methods spread into the `api` object in lib/api.ts. */
import { apiRequest } from './client';
import type {
  ApiAssignment,
  ApiClass,
  ApiClassTA,
  ApiClassTa,
  ApiFinalReviewDetail,
  ApiFinalReviewNotes,
  ApiFinalReviewSchedule,
  ApiProjectTA,
  ApiTAMeetingSchedule,
  ApiTeamAttendance,
  EnrollmentRole,
  FinalReviewScoreEntry,
  FinalReviewScoreRole,
} from './types';

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

export const tasApi = {

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
};
