import * as React from 'react';

export interface ProjectCardProps {
  name: string;
  /** Team label ("Team 1"). */
  team?: string;
  memberCount?: number;
  /** Status chip text. @default 'Active' */
  status?: string;
  /** @default 'success' */
  statusTone?: 'neutral' | 'success' | 'warning' | 'error' | 'info';
  /** 2-line clamped description. */
  description?: string;
  /** Shows the green "See All ↗" link. */
  onView?: () => void;
  onClick?: () => void;
  className?: string;
}

/**
 * Project tile for Browse/My Projects grids.
 * @startingPoint section="Domain" subtitle="Project tile with status, team & members" viewport="700x260"
 */
export function ProjectCard(props: ProjectCardProps): React.JSX.Element;
