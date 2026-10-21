import * as React from 'react';
import type { ApiMyTeam, ApiReviewSlot } from './FinalReviewsModel';
export interface TeamReviewProps {
  /** 'page': the top of the board · 'card': the body of the project page's "Final review" card. @default 'page' */
  variant?: 'page' | 'card';
  /** my_team from the slots read (null: on no team / the instructor's preview). */
  myTeam?: ApiMyTeam | null;
  slots?: ApiReviewSlot[];
  signupsOpen?: boolean;
  complete?: boolean;
  now?: Date;
  zone?: string;
  schoolZone?: string;
  /** @default 'ready' */
  status?: 'ready' | 'loading' | 'error';
  /** Page: Product Owner's "Choose a slot" (filters the board to free slots). */
  onChooseSlot?: () => void;
  /** Page: "Change slot" (the free rows offer Move here). */
  onChangeSlot?: () => void;
  /** "Release" — the page confirms. */
  onRelease?: () => void;
  onJoin?: () => void;
  onRetry?: () => void;
  /** Card: where Choose / Change slot lead (the board, filtered to free slots). */
  boardHref?: string;
  /** 'release' while it runs. */
  busy?: 'release' | null;
  /** @default 'h2' (page) / 'h3' (card) */
  headingLevel?: 'h2' | 'h3' | 'h4';
  className?: string;
}
/** "Your team's review": every state of the student's own booking, on the board and on the project page; names the Review TA as who the team presents to. */
export function TeamReview(props: TeamReviewProps): React.JSX.Element;
