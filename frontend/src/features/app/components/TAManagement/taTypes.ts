import type { ApiTeamMeeting, AttendanceStatus } from '@/lib/api';

export type { AttendanceStatus };

/** UI-facing shape of one team's weekly meeting row. */
export interface TeamMeetingItem {
  projectId: string;
  teamName: string;
  meetingDay: string | null;
  meetingTime: string | null;
  zoomUrl: string | null;
  assignedTa: { id: string; name: string; email?: string | null } | null;
  present: number;
  total: number;
}

/** One student's row inside the inline check-in roster. */
export interface AttendanceRow {
  personId: string;
  name: string;
  email?: string | null;
  status: AttendanceStatus;
}

export function toTeamMeetingItem(t: ApiTeamMeeting): TeamMeetingItem {
  return {
    projectId: t.project_id,
    teamName: t.project_name,
    meetingDay: t.meeting_day ?? null,
    meetingTime: t.meeting_time ?? null,
    zoomUrl: t.zoom_url ?? null,
    assignedTa: t.assigned_ta
      ? { id: t.assigned_ta.id, name: t.assigned_ta.name ?? 'TA', email: t.assigned_ta.email }
      : null,
    present: t.attendance_present ?? 0,
    total: t.attendance_total ?? 0,
  };
}

/** "Wednesday · 2:00–2:30 PM" — or just whichever part exists, or null. */
export function formatMeeting(day?: string | null, time?: string | null): string | null {
  const d = day ? day.charAt(0).toUpperCase() + day.slice(1) : null;
  if (d && time) return `${d} · ${time}`;
  return d || time || null;
}

export const ATTENDANCE_OPTIONS: { value: 'present' | 'late' | 'absent'; label: string }[] = [
  { value: 'present', label: 'Present' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
];

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  unmarked: 'Not marked',
};

export const WEEKDAYS = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;
