import * as React from 'react';
import type { ScheduleItemData, SchedulePerson } from '../schedule/ScheduleModel';
import type { TeamMeeting, TeamMeetingPayload } from './TeamMeetingsModel';

export interface TeamMeetingsListProps {
  /** manage = Edit Project → Meetings tab (Product Owner); card = the project-page "Team meetings" card body. @default 'manage' */
  variant?: 'manage' | 'card';
  meetings?: TeamMeeting[];
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'error';
  /** Pin the clock (tests, demos); otherwise ticks every 30s. */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. All times render in it. */
  zone?: string;
  /** @default 'America/Los_Angeles' — when it differs, "Times in … · campus is PT" appears once and each time's title carries the campus time. */
  schoolZone?: string;
  /** Product Owner: Add / Edit / Delete (manage) or the quiet "Add one" line when empty (card). @default false */
  canManage?: boolean;
  /** Team label for the ScheduleItem context line (card). */
  teamName?: string;
  /** createdBy id → person, for the organizer avatar (card). */
  people?: Record<string, SchedulePerson>;

  /** Resolve on success, reject on failure — the list shows the inline error and keeps the draft. */
  onCreate?: (value: TeamMeetingPayload) => Promise<unknown> | void;
  onUpdate?: (id: string, value: TeamMeetingPayload) => Promise<unknown> | void;
  onDelete?: (id: string) => Promise<unknown> | void;
  onRetry?: () => void;
  /** card: "Add one" — open the Edit Project modal on the Meetings tab. */
  onManage?: () => void;
  onJoin?: (item: ScheduleItemData) => void;
  /** card: "+n more · See all in Schedule" target. @default '/app/schedule' */
  scheduleHref?: string;
  /** card: upcoming rows before "+n more". @default 5 */
  maxUpcoming?: number;

  /** Initial uncontrolled state (demos / tests). */
  defaultEditingId?: 'new' | string | null;
  defaultConfirmId?: string | null;
  defaultPastOpen?: boolean;
  className?: string;
}

/** A team's one-off meetings — the Meetings tab list or the project-page card body. */
export function TeamMeetingsList(props: TeamMeetingsListProps): React.JSX.Element | null;
