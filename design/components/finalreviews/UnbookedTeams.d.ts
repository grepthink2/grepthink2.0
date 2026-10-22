// Intentional addition: UnbookedTeams — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { TeamRecord, FinalReviewLens } from './FinalReviewsModel';
export interface UnbookedTeamsProps {
  /** FinalReviewsModel.unbookedTeams(data, teamsById). */
  teams: TeamRecord[];
  /** 'instructor' adds Place on a slot… and the Review TA menu. @default 'ta' */
  lens?: FinalReviewLens;
  complete?: boolean;
  onAction?: (action: 'place_on_slot' | 'review_ta', team: TeamRecord) => void;
  busy?: { teamId: string } | null;
  /** @default 'h2' */
  headingLevel?: 'h2' | 'h3';
  className?: string;
}
/** Staff: the teams without a slot, with Product Owner (or "No Product Owner"), Home TA and any appointed Review TA. */
export function UnbookedTeams(props: UnbookedTeamsProps): React.JSX.Element;
