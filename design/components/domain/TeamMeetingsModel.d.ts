// Intentional addition: TEAM_MEETING_TITLE_MAX, TEAM_MEETING_NOTE_MAX, TEAM_MEETING_DEFAULT_DURATION, TEAM_MEETING_DURATIONS, TeamMeetingsModel — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ScheduleItemData, SchedulePerson } from '../schedule/ScheduleModel';

/** One team meeting as the API stores it (times are ISO instants). */
export interface TeamMeeting {
  id: string;
  projectId: string;
  title: string;
  /** ISO 8601 instant (UTC). */
  startsAt: string;
  /** 15-minute steps; 60 by default. */
  durationMinutes: number;
  /** A room ("E2 room 180"); null when online-only. */
  location?: string | null;
  /** Full https URL; rendered as "Zoom" and as the Join action inside the 10-minute window. */
  zoomUrl?: string | null;
  /** ≤ 500 chars, one line in lists. */
  note?: string | null;
  /** User id of the Product Owner who created it (or the person object when the API joins it). */
  createdBy?: string | SchedulePerson;
  updatedAt?: string;
}

/** What the form edits — date/time are read on the viewer's clock. */
export interface TeamMeetingDraft {
  title: string;
  /** 'YYYY-MM-DD' */
  date: string;
  /** 'HH:MM' (24h) */
  time: string;
  durationMinutes: number;
  location: string;
  zoomUrl: string;
  note: string;
}

/** What `onCreate` / `onUpdate` receive. */
export interface TeamMeetingPayload {
  title: string;
  startsAt: string;
  durationMinutes: number;
  location: string | null;
  zoomUrl: string | null;
  note: string | null;
}

export interface TeamMeetingValidation {
  valid: boolean;
  errors: Partial<Record<'title' | 'date' | 'time' | 'zoomUrl' | 'note', string>>;
  value: TeamMeetingPayload | null;
}

export const TEAM_MEETING_TITLE_MAX: 80;
export const TEAM_MEETING_NOTE_MAX: 500;
export const TEAM_MEETING_DEFAULT_DURATION: 60;
/** 15, 30, 45 … 120, 150, 180, 240 */
export const TEAM_MEETING_DURATIONS: number[];

export function fmtMinutes(mins: number): string;
export function isoMinutes(mins: number): string;
export function endsAtOf(m: Pick<TeamMeeting, 'startsAt' | 'durationMinutes'>): string;
export function isLive(m: TeamMeeting, now?: Date): boolean;
export function isPast(m: TeamMeeting, now?: Date): boolean;
export function splitMeetings(meetings: TeamMeeting[], now?: Date): { upcoming: TeamMeeting[]; past: TeamMeeting[] };
export function toScheduleItem(m: TeamMeeting, ctx?: { teamName?: string; people?: Record<string, SchedulePerson>; href?: string }): ScheduleItemData;
export function zonedToInstant(date: string, time: string, zone?: string): Date;
export function instantToZoned(when: string | Date, zone?: string): { date: string; time: string };
export function campusTimeOf(date: string, time: string, zone: string, schoolZone?: string): string | null;
export function fmtMeetingWhen(m: TeamMeeting, zone?: string, now?: Date): { day: string; start: string; end: string; range: string };
export function draftFrom(m: TeamMeeting | null, zone?: string): TeamMeetingDraft;
export function isHttpUrl(s: string): boolean;
export function validateTeamMeeting(draft: TeamMeetingDraft, opts?: { now?: Date; zone?: string; creating?: boolean }): TeamMeetingValidation;
export function showTeamMeetingsCard(meetings: TeamMeeting[], opts?: { canManage?: boolean; status?: 'ready' | 'loading' | 'error' }): boolean;

/** Everything above as one object (what the dev loader and the kit import). */
export const TeamMeetingsModel: {
  TEAM_MEETING_TITLE_MAX: 80; TEAM_MEETING_NOTE_MAX: 500; TEAM_MEETING_DEFAULT_DURATION: 60; TEAM_MEETING_DURATIONS: number[];
  fmtMinutes: typeof fmtMinutes; isoMinutes: typeof isoMinutes; endsAtOf: typeof endsAtOf; isLive: typeof isLive; isPast: typeof isPast;
  splitMeetings: typeof splitMeetings; toScheduleItem: typeof toScheduleItem; zonedToInstant: typeof zonedToInstant; instantToZoned: typeof instantToZoned;
  campusTimeOf: typeof campusTimeOf; fmtMeetingWhen: typeof fmtMeetingWhen; draftFrom: typeof draftFrom; isHttpUrl: typeof isHttpUrl;
  validateTeamMeeting: typeof validateTeamMeeting; showTeamMeetingsCard: typeof showTeamMeetingsCard;
};
