// Intentional addition: SCHOOL_ZONE, JOIN_WINDOW_MS, COUNTDOWN_DAYS, SCHEDULE_KINDS, ScheduleModel — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
export type ScheduleKind = 'ta_meeting' | 'final_review' | 'meeting' | 'lecture' | 'office_hours' | 'deadline' | 'sprint';
export type ScheduleStatus = 'upcoming' | 'live' | 'past' | 'cancelled' | 'tbd';
export type ScheduleLens = 'student' | 'ta' | 'instructor';
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'unmarked';

export interface SchedulePerson {
  id?: string;
  name: string;
  /** Optional photo; initials otherwise. */
  avatarUrl?: string;
  /** "TA", "Instructor", "Scrum Master" — shown after the name. */
  role?: string;
  /** Render as "You" (the viewer hosts / reviews). */
  you?: boolean;
}

export interface ScheduleReviewer extends SchedulePerson {
  /** Final-review role: the team's Home TA or the claimed Review TA. */
  slot: 'home' | 'review';
}

/** One schedule item — the data contract (design_handoff_schedule/README.md §Data contract). */
export interface ScheduleItemData {
  id: string;
  kind: ScheduleKind;
  /** Headline: the kind for recurring structure ("TA meeting", "Lecture", "Office hours", "Final review"), the given title for one-off meetings, "TSR 4 due" for deadlines, the sprint name for sprint edges. */
  title: string;
  /** ISO 8601 instant (UTC). For all-day items and sprint edges: midnight in the school zone. */
  startsAt: string;
  /** ISO 8601 instant; null for deadlines (a point in time) and all-day items. */
  endsAt?: string | null;
  allDay?: boolean;
  classLabel?: string;
  classId?: string;
  teamName?: string;
  projectId?: string;
  /** Room, or a short place label; omitted when the item is on Zoom. */
  location?: string;
  zoomUrl?: string | null;
  /** TA for TA meetings, organizer for one-off meetings, host for office hours. */
  host?: SchedulePerson;
  /** Final review: both reviewers (Home TA + Review TA). */
  reviewers?: ScheduleReviewer[];
  /** "Weekly · Tue" */
  recurrenceLabel?: string;
  /** "Meeting 2 of 2 this week" when `meetingsPerWeek` > 1. */
  meetingIndex?: number;
  meetingsPerWeek?: number;
  /** Student lens: the viewer's own status for a past TA meeting. Staff lens: the team tally. */
  attendance?: AttendanceStatus | { present: number; total: number };
  /** Attendee names for the expanded MeetingCard. */
  attendees?: string[];
  /** Only `cancelled` and `tbd` are authoritative here; `upcoming | live | past` are derived from the clock. */
  status?: ScheduleStatus;
  cancelReason?: string;
  /** One-off meetings: optional note. */
  note?: string;
  /** 'team' | 'class' — one-off meeting scope. */
  scope?: 'team' | 'class';
  /** Sprint edge (kind 'sprint'): rendered as the day's rule, never as a row. */
  sprint?: { name: string; edge: 'start' | 'end' };
  /** Deadlines: where the title links. */
  href?: string;
}

export interface ScheduleKindMeta { kind: ScheduleKind; label: string; icon: string | null; tone: string | null; filterLabel: string | null; }
export interface ScheduleDayGroup { key: string; isToday: boolean; dividers: ScheduleItemData[]; items: ScheduleItemData[]; }

export const SCHOOL_ZONE: string;
export const JOIN_WINDOW_MS: number;
export const COUNTDOWN_DAYS: number;
export const SCHEDULE_KINDS: ScheduleKindMeta[];
export function kindMeta(kind: string): ScheduleKindMeta;

export function dayKey(when: string | Date, zone?: string): string;
export function keyToDate(key: string): Date;
export function shiftKey(key: string, days: number): string;
export function weekKeys(anchorKey: string): string[];

export function statusOf(item: ScheduleItemData, now?: Date, zone?: string): ScheduleStatus;
export function isJoinable(item: ScheduleItemData, now?: Date): boolean;
export function countdown(item: ScheduleItemData, now?: Date, zone?: string): string | null;

export function sortItems(items: ScheduleItemData[], zone?: string): ScheduleItemData[];
export function groupByDay(items: ScheduleItemData[], opts?: { zone?: string; now?: Date }): ScheduleDayGroup[];
export function findOverlaps(items: ScheduleItemData[]): Map<string, ScheduleItemData[]>;
export function nowIndex(dayItems: ScheduleItemData[], now?: Date): number;
export function nextUp(items: ScheduleItemData[], now?: Date): ScheduleItemData | null;
export function todayOrPeek(items: ScheduleItemData[], now?: Date, zone?: string): { mode: 'today' | 'peek' | 'none'; day: ScheduleDayGroup | null; todayDividers?: ScheduleItemData[] };

export function fmtTime(when: string | Date, zone?: string): string;
export function fmtTimeRange(item: ScheduleItemData, zone?: string): string;
export function fmtDuration(item: ScheduleItemData): string | null;
export function isoDuration(item: ScheduleItemData): string | null;
export function fmtDayLabel(key: string, now?: Date, zone?: string): { title: string; date: string; isToday: boolean };
export function fmtWeekLabel(keys: string[], now?: Date, zone?: string): { title: string | null; range: string };
export function zoneLabel(zone: string, when?: Date): string;
export function zoneDiffers(zoneA: string, zoneB: string, when?: Date): boolean;
export function viewerZone(): string;
export function useNow(ms?: number, fixed?: Date): Date;

export const ScheduleModel: {
  kinds: ScheduleKindMeta[]; kindMeta: typeof kindMeta; dayKey: typeof dayKey; shiftKey: typeof shiftKey; weekKeys: typeof weekKeys;
  statusOf: typeof statusOf; isJoinable: typeof isJoinable; countdown: typeof countdown; sortItems: typeof sortItems; groupByDay: typeof groupByDay;
  findOverlaps: typeof findOverlaps; nowIndex: typeof nowIndex; nextUp: typeof nextUp; todayOrPeek: typeof todayOrPeek;
  fmtTime: typeof fmtTime; fmtTimeRange: typeof fmtTimeRange; fmtDuration: typeof fmtDuration; isoDuration: typeof isoDuration;
  fmtDayLabel: typeof fmtDayLabel; fmtWeekLabel: typeof fmtWeekLabel; zoneLabel: typeof zoneLabel; zoneDiffers: typeof zoneDiffers; viewerZone: typeof viewerZone;
  SCHOOL_ZONE: string; JOIN_WINDOW_MS: number; COUNTDOWN_DAYS: number;
};
