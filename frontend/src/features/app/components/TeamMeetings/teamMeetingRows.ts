/**
 * The edge between the API and the team-meetings UI: the API's snake_case meeting rows become the
 * camelCase TeamMeeting the model and components read, and the form's payload becomes the request
 * body. lib/api stays a thin typed client; this is the only place the two shapes meet.
 */
import type { ApiProjectMeeting, ProjectMeetingPayload } from '@/lib/api';
import type { TeamMeeting, TeamMeetingPayload } from './teamMeetingsModel';

/** An API row as the UI's TeamMeeting. A creator whose profile is gone (null) is left out. */
export function toTeamMeeting(row: ApiProjectMeeting): TeamMeeting {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    zoomUrl: row.zoom_url,
    note: row.note,
    createdBy: row.created_by ?? undefined,
    updatedAt: row.updated_at,
  };
}

/** The form's validated payload as the body for POST or PATCH /api/projects/{id}/meetings. */
export function toProjectMeetingPayload(value: TeamMeetingPayload): ProjectMeetingPayload {
  return {
    title: value.title,
    starts_at: value.startsAt,
    duration_minutes: value.durationMinutes,
    location: value.location,
    zoom_url: value.zoomUrl,
    note: value.note,
  };
}
