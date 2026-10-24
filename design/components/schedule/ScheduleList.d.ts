// Intentional addition: ScheduleList — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ScheduleItemData, ScheduleKind, ScheduleLens } from './ScheduleModel';

export interface ScheduleListProps {
  /** compact = the Today's Schedule card body; agenda = the /app/schedule week view. @default 'compact' */
  variant?: 'compact' | 'agenda';
  items?: ScheduleItemData[];
  /** Pin the clock (tests, demos); otherwise ticks every 30s. */
  now?: Date;
  /** Viewer's IANA zone; defaults to the browser's. Times render in it. */
  zone?: string;
  /** @default 'America/Los_Angeles' — when it differs from `zone`, a "Times in … · campus is PT" note appears and each time's title carries the campus time. */
  schoolZone?: string;
  /** @default 'student' */
  lens?: ScheduleLens;
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'error';
  onRetry?: () => void;

  /** compact: rows before "+n more today". @default 5 */
  maxItems?: number;
  /** compact: "See week" / "+n more" target. @default '/app/schedule' */
  seeAllHref?: string;
  /** ICS subscription link for "Add to your calendar" (empty states). */
  calendarHref?: string;

  /** agenda: controlled week ('YYYY-MM-DD' of any day in the week). */
  weekAnchor?: string;
  onWeekChange?: (anchorKey: string) => void;
  /** agenda: class filter options (the select renders with 2+). */
  classes?: { id: string; label: string }[];
  classId?: string;
  onClassChange?: (classId: string) => void;
  /** agenda: active kind filters (empty = all). */
  kinds?: ScheduleKind[];
  onKindsChange?: (kinds: ScheduleKind[]) => void;
  /** agenda: render all 7 days even when empty. @default false (days with items + today) */
  showEmptyDays?: boolean;

  onJoin?: (item: ScheduleItemData) => void;
  onMarkAttendance?: (item: ScheduleItemData) => void;
  onSetTime?: (item: ScheduleItemData) => void;
  onOpen?: (item: ScheduleItemData) => void;
  /** Controlled expansion (agenda TA meetings → MeetingCard); uncontrolled by default. */
  expandedId?: string | null;
  onToggle?: (item: ScheduleItemData) => void;
  className?: string;
}

/**
 * Schedule list — Today's Schedule card body or the full agenda week.
 * @startingPoint section="Schedule" subtitle="Today's Schedule card + agenda week" viewport="1100x760"
 */
export function ScheduleList(props: ScheduleListProps): React.JSX.Element;
