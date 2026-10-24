// Intentional addition: SlotBoard — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ApiReviewSlots, ApiFinalReviewSchedule, FinalReviewLens, SlotActionId, ApiReviewSlot, SlotView, DayGroup } from './FinalReviewsModel';
export interface SlotBoardProps {
  /** GET /api/tas/classes/{class_id}/review-slots (every lens). */
  data: ApiReviewSlots | null;
  /** GET /api/tas/classes/{class_id}/final-reviews (staff only): reviewers of every team; pre-slots review times. */
  schedule?: ApiFinalReviewSchedule | null;
  lens: FinalReviewLens;
  now?: Date;
  /** The viewer's zone; days group by it. */
  zone?: string;
  schoolZone?: string;
  viewerId?: string | null;
  /** A class marked complete: read-only. @default false */
  complete?: boolean;
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'refetching' | 'error';
  /** Controlled filter ('all' | 'free' | 'mine' | 'no_review_ta'). */
  filter?: string;
  /** @default 'all' */
  defaultFilter?: string;
  onFilterChange?: (filter: string) => void;
  /** A refused request, said above the board (409 / 403): "That slot was just taken…". */
  alert?: React.ReactNode;
  /** Buttons under the alert (`Button size="sm" variant="outline"`): a refused sign-up's "Sign up for Tue, Dec 8 · 10:00 AM". */
  alertActions?: React.ReactNode;
  onDismissAlert?: () => void;
  busy?: { slotId: string; action: SlotActionId } | null;
  onAction?: (action: SlotActionId, slot: ApiReviewSlot, view: SlotView) => void;
  /** Instructor: the day header's Menu ('delete_day' — every free slot that day). */
  onDayAction?: (action: 'delete_day', day: DayGroup) => void;
  onRetry?: () => void;
  /** Instructor's empty state: opens Post slots. */
  onPostSlots?: () => void;
  reviewHref?: (team: { project_id: string; name: string }) => string;
  /** Past days start open. @default false */
  defaultPastOpen?: boolean;
  className?: string;
}
/** Every slot in the class by day, one component for every lens; long-board navigation, states and history built in. */
export function SlotBoard(props: SlotBoardProps): React.JSX.Element;
