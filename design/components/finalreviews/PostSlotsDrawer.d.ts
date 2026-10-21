import * as React from 'react';
import type { ApiReviewSlot, PostingDraft } from './FinalReviewsModel';
export interface PostSlotsDrawerProps {
  open?: boolean;
  onClose?: () => void;
  /** POST /api/tas/classes/{class_id}/review-slots { starts_at } → { created }. May return a promise; a rejection keeps the list and shows its message. */
  onPost?: (payload: { starts_at: string[] }, draft: PostingDraft) => void | Promise<unknown>;
  /** The class's slots — times that already have one are marked and skipped by the server. */
  existing?: ApiReviewSlot[];
  now?: Date;
  /** The viewer's zone (for the "for you" equivalents). */
  zone?: string;
  /** The campus zone the times are typed on. */
  schoolZone?: string;
  /** Galleries: a prefilled list. */
  defaultEntries?: { date: string; time: string }[];
  defaultDay?: string;
  /** @default true */
  portal?: boolean;
  /** @default 480 */
  width?: number;
}
/** Post slots: days and hourly starts typed on the campus clock, the list it will post with its flags; overlapping starts are refused; at most 200 per post. */
export function PostSlotsDrawer(props: PostSlotsDrawerProps): React.JSX.Element | null;
