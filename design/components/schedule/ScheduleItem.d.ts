// Intentional addition: ScheduleIcon, ScheduleItem — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ScheduleItemData, ScheduleLens } from './ScheduleModel';

export interface ScheduleIconProps {
  /** video · clipboard-check · users · book-open · door-open · flag · clock · calendar-days · calendar-plus · chevron-left/right/down · map-pin · refresh-cw · circle-alert · globe · arrow-right */
  name: string;
  /** @default 16 */
  size?: number;
  className?: string;
}
/** Lucide-shaped inline icon (24 viewBox, stroke 2). Production uses lucide-react. */
export function ScheduleIcon(props: ScheduleIconProps): React.JSX.Element;

export interface ScheduleItemProps {
  item: ScheduleItemData;
  /** compact = Today's Schedule card row; agenda = week-view row with actions column. @default 'agenda' */
  variant?: 'compact' | 'agenda';
  /** Only changes which actions render (Mark attendance / Set time for staff). @default 'student' */
  lens?: ScheduleLens;
  /** Clock used for status + the Join window; defaults to new Date(). */
  now?: Date;
  /** Viewer's IANA zone (times render in it). @default 'America/Los_Angeles' */
  zone?: string;
  /** The school's zone — used for the hover title when it differs. @default 'America/Los_Angeles' */
  schoolZone?: string;
  /** Put the school-zone time in each <time>'s title. */
  showSchoolTime?: boolean;
  /** Items this one overlaps with (from ScheduleModel.findOverlaps) — renders the "Overlaps" pill. */
  overlaps?: ScheduleItemData[];
  /** Override the default (agenda TA meetings expand into a MeetingCard). */
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: (item: ScheduleItemData) => void;
  onJoin?: (item: ScheduleItemData) => void;
  onMarkAttendance?: (item: ScheduleItemData) => void;
  onSetTime?: (item: ScheduleItemData) => void;
  /** Deadline titles with `href` call this instead of navigating. */
  onOpen?: (item: ScheduleItemData) => void;
  className?: string;
}

/** One schedule row (an <li>): time cell · kind tile · title / context / people · actions; expands into MeetingCard. */
export function ScheduleItem(props: ScheduleItemProps): React.JSX.Element;
