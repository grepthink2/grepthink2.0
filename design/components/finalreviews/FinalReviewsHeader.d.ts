// Intentional addition: ZoomRoomField, FinalReviewsHeader — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { FinalReviewLens } from './FinalReviewsModel';
export interface FinalReviewsHeaderProps {
  lens: FinalReviewLens;
  signupsOpen?: boolean;
  /** FinalReviewsModel.boardCounts(). */
  counts?: { slots: number; booked: number; free: number; unbooked: number; noReviewTa: number };
  /** TA: teams where the viewer is the Review TA (my_review_count). */
  myReviewCount?: number;
  /** Staff only. */
  zoomUrl?: string | null;
  /** A complete class: read-only, no switch, no posting. @default false */
  complete?: boolean;
  /** @default 'ready' */
  status?: 'ready' | 'loading';
  /** 'signups' | 'zoom' while that request runs. */
  busy?: 'signups' | 'zoom' | null;
  onPostSlots?: () => void;
  /** Called with the next state; the page confirms a close (ConfirmDialog) before calling the API. */
  onToggleSignups?: (open: boolean) => void;
  /** null clears the room. May return a promise; a rejection keeps the editor open with an error. */
  onSaveZoom?: (url: string | null) => void | Promise<unknown>;
  className?: string;
}
export interface ZoomRoomFieldProps {
  zoomUrl?: string | null;
  /** Instructor: Set / Edit / Clear. */
  canEdit?: boolean;
  onSave?: (url: string | null) => void | Promise<unknown>;
  saving?: boolean;
  /** Galleries: start in the editor. */
  defaultEditing?: boolean;
  className?: string;
}
/** Sign-ups state, counts, the TA's review count, the shared Zoom room and the instructor's controls. */
export function FinalReviewsHeader(props: FinalReviewsHeaderProps): React.JSX.Element;
/** The class's shared Zoom room: a link for TAs, inline set / edit / clear for the instructor. */
export function ZoomRoomField(props: ZoomRoomFieldProps): React.JSX.Element;
