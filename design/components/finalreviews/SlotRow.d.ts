import * as React from 'react';
import type { ApiReviewSlot, BoardContext, SlotView, SlotActionId } from './FinalReviewsModel';
export interface SlotRowProps {
  slot: ApiReviewSlot;
  /** The board context (lens, clock, sign-ups, my_team, viewer, staff team index, Zoom room). */
  context: BoardContext;
  zone?: string;
  schoolZone?: string;
  /** Every button and menu item calls it: (action, slot, view). 'join' and 'open_review' are links; the handler may route. */
  onAction?: (action: SlotActionId, slot: ApiReviewSlot, view: SlotView, event?: React.SyntheticEvent) => void;
  /** The in-flight action on this board, shown as a busy button. */
  busy?: { slotId: string; action: SlotActionId } | null;
  /** Where Open review goes (/app/final-reviews/:projectId). */
  reviewHref?: (team: { project_id: string; name: string }) => string;
  /** @default 'li' */
  as?: 'li' | 'div';
  className?: string;
}
/** One slot: time (+ campus time) · team or Free · reviewers (staff / own team) · the lens's actions, with the reason as text where one isn't offered. */
export function SlotRow(props: SlotRowProps): React.JSX.Element;
