// Intentional addition: ReviewWorkspaceHeader — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { ApiPerson } from './FinalReviewsModel';
export interface ReviewWorkspaceHeaderProps {
  team: { project_id: string; name: string | null } | null;
  /** instructor · home (You're the Home TA) · review (You're the Review TA) · ta (Read-only). @default 'ta' */
  viewerRole?: 'instructor' | 'home' | 'review' | 'ta';
  /** The team's slot start, or null ("No slot yet"). */
  startsAt?: string | null;
  homeTa?: ApiPerson | null;
  reviewTa?: ApiPerson | null;
  zoomUrl?: string | null;
  now?: Date;
  zone?: string;
  schoolZone?: string;
  /** @default '/app/final-reviews' */
  backHref?: string;
  onBack?: (e: React.MouseEvent) => void;
  onJoin?: () => void;
  className?: string;
}
/** The scoring workspace header: back, team, role, time with campus time, Home TA, Review TA, Zoom (Join inside the window for the Review TA and the instructor; never the Home TA). */
export function ReviewWorkspaceHeader(props: ReviewWorkspaceHeaderProps): React.JSX.Element;
