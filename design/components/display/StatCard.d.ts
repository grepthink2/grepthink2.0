import * as React from 'react';

export interface StatCardDelta {
  /** Change as a ratio (0.18 → "+18%"); null hides the delta. */
  value: number | null;
  /** Comparison label ("vs the 7 days before"). */
  vsLabel?: string;
  /** Whether an increase is good (green). @default true */
  goodWhenUp?: boolean;
}

export interface StatCardInfo {
  /** @default the card's label */
  title?: string;
  body: React.ReactNode;
  learnMoreHref?: string;
}

export interface StatCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'> {
  label: string;
  /** Number or preformatted string; null / undefined renders "—". */
  value: number | string | null | undefined;
  /** Muted line under the value (why a value is "—", what it counts). */
  hint?: React.ReactNode;
  /** 16px icon in the tinted 30px chip. */
  icon?: React.ReactNode;
  /** @default 'primary' */
  accent?: 'primary' | 'blue' | 'purple' | 'amber';
  /** 'raw' as given · 'compact' 12.9K / 1.3M · 'percent' 0.82 → 82%. @default 'raw' */
  format?: 'raw' | 'compact' | 'percent';
  delta?: StatCardDelta;
  /** 2–12 weekly points (complete weeks only); fewer than 2 draws nothing. */
  trend?: number[];
  /** ⓘ InfoPopover beside the label — the keyboard-reachable explanation that replaces the Dashboard's hover-only tooltip. */
  info?: StatCardInfo;
  /** The source failed: "—" + "Could not load". @default false */
  failed?: boolean;
  /** Skeleton value, `aria-busy`. @default false */
  loading?: boolean;
  /** Analytics tile density (14px padding, h2 value) — what StatTile renders. @default false */
  compact?: boolean;
  /** Makes the card a stretched button named "{label}: {value}". */
  onClick?: () => void;
}

/** Metric card for the Dashboard and Analytics. */
export function StatCard(props: StatCardProps): React.JSX.Element;
