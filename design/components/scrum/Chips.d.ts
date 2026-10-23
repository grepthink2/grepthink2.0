// Intentional addition: Chips, PointsChip, EstimateChip, PRLinkChip, UserPair — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface PointsChipProps {
  /** Point value from the active scale. */
  points: number | string;
  /** @default 'md' */
  size?: 'sm' | 'md';
  /** Tooltip. @default 'Story points' */
  title?: string;
  className?: string;
}

export interface EstimateChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Human estimate ("6h", "2d"). */
  estimate: string;
}

export interface PRLinkChipProps {
  /** Short ref ("PR #42", "!17"). */
  label: string;
  url: string;
  /** @default 'open' */
  state?: 'open' | 'merged' | 'closed' | 'draft';
  /** Icon/tooltip wording only. @default 'github' */
  provider?: 'github' | 'gitlab';
  className?: string;
}

export interface UserPairProps {
  /** Who filed it. */
  reporter: string;
  /** Who owns it. */
  assignee: string;
  /** Avatar size. @default 'xs' */
  size?: 'xs' | 'sm';
  className?: string;
}

/** Story-point chip. */
export function PointsChip(props: PointsChipProps): React.JSX.Element;
/** Time-estimate chip. */
export function EstimateChip(props: EstimateChipProps): React.JSX.Element;
/** Linked PR/MR chip (GitHub or git.ucsc.edu GitLab). */
export function PRLinkChip(props: PRLinkChipProps): React.JSX.Element;
/** Reporter → assignee avatar pair. */
export function UserPair(props: UserPairProps): React.JSX.Element;
/** The four chips under one name, for the bundle (design-only, like ModKey): the file is `Chips.jsx` after the codebase's `features/scrum/components/Chips.tsx`. */
export const Chips: { PointsChip: typeof PointsChip; EstimateChip: typeof EstimateChip; PRLinkChip: typeof PRLinkChip; UserPair: typeof UserPair };
