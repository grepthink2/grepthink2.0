// Intentional addition: SlotActionDialog — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ApiReviewSlot, TeamRecord } from './FinalReviewsModel';
export interface SlotActionDialogProps {
  open?: boolean;
  kind: 'place_team' | 'place_on_slot' | 'move_team' | 'review_ta';
  /** place_team: the free slot the team goes onto. */
  slot?: ApiReviewSlot | null;
  /** place_on_slot / move_team / review_ta: the team (with slot_id, starts_at, home_ta, review_ta). */
  team?: TeamRecord | null;
  /** Every slot in the class (free choices, booked teams). */
  slots?: ApiReviewSlot[];
  /** Teams without a slot (place_team lists them first). */
  unbooked?: TeamRecord[];
  teamsById?: Record<string, TeamRecord>;
  /** GET /api/tas/classes/{class_id} → tas. */
  tas?: { id: string; name: string }[];
  /** Review TA load per TA id, shown in the options ("· reviews 2"). */
  reviewCounts?: Record<string, number>;
  now?: Date;
  zone?: string;
  schoolZone?: string;
  defaultValue?: string;
  /** May return a promise: busy while pending; a rejection's message shows inside. Close on success yourself. */
  onConfirm?: (value: { slotId?: string; projectId?: string; userId?: string | null }) => void | Promise<unknown>;
  onCancel?: () => void;
  /** @default true */
  portal?: boolean;
}
/** The instructor's choose-and-confirm dialog: place a team, place on a slot, move, appoint / replace / remove the Review TA. */
export function SlotActionDialog(props: SlotActionDialogProps): React.JSX.Element | null;
