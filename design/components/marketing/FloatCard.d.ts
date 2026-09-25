import * as React from 'react';

export interface FloatCardProps {
  /** Which hero mock to render. @default 'team' */
  kind?: 'team' | 'tasks' | 'tsr' | 'roster';
  title?: string;
  meta?: string;
  /** team: avatars. Colors default to AVATAR_COLORS. */
  team?: { initials: string; color?: string }[];
  roles?: string[];
  /** tasks: progress rows. */
  milestones?: { name: string; pct: number }[];
  /** tsr: ring numbers. @default 8 / 12 */
  submitted?: number;
  total?: number;
  caption?: string;
  /** roster: rows. */
  teams?: { label: string; count: number; color?: string }[];
  /** Drop the absolute hero placement (galleries). @default false */
  inline?: boolean;
  /** Disable the float animation. @default false */
  still?: boolean;
  className?: string;
}

export interface FloatingCardsProps {
  still?: boolean;
}

/** One decorative floating product mock for the hero. */
export function FloatCard(props: FloatCardProps): React.JSX.Element;
/** The hero's four-card arrangement (team, tasks, tsr, roster). */
export function FloatingCards(props: FloatingCardsProps): React.JSX.Element;
