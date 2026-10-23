// Intentional addition: ChartCard — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import { AnalyticsIconName } from './ChartLegend';

export type ChartCardState = 'loading' | 'refetching' | 'ready' | 'empty' | 'error';

export interface ChartCardDefinition {
  /** @default 'How this is counted' */
  title?: string;
  body: React.ReactNode;
  learnMoreHref?: string;
}

export interface ChartCardEmpty {
  icon?: AnalyticsIconName;
  title: string;
  hint?: string;
}

export interface ChartCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode;
  /** One-line, sentence case. */
  subtitle?: React.ReactNode;
  /** "How this is counted" — the kit's InfoPopover (string = body only). */
  definition?: string | ChartCardDefinition;
  /** Adds the LIVE pill — the card ignores the range. @default false */
  live?: boolean;
  /** Header tools: UnitToggle, the kit's Checkbox (compare), Button `pressed` (Table toggle) and `outline` (Refresh, Export CSV). */
  actions?: React.ReactNode;
  /** @default 'ready' */
  state?: ChartCardState;
  /** The empty state's copy — rendered as the kit's EmptyState, `variant="card"`. */
  emptyMessage?: ChartCardEmpty;
  /** @default 'This card could not load.' */
  errorMessage?: string;
  onRetry?: () => void;
  footnote?: React.ReactNode;
  /** Hero figure (32/600) above the plot — one per page. */
  hero?: React.ReactNode;
  heroMeta?: React.ReactNode;
  /** Spans both grid columns (`.gt-chart-card--wide`). @default false */
  wide?: boolean;
  /** @default 4 */
  skeletonRows?: number;
  children?: React.ReactNode;
}

/**
 * Container for every analytics chart; owns the loading / refetching / empty / error chrome.
 * @startingPoint section="Analytics" subtitle="Chart card with header tools and all five states" viewport="700x320"
 */
export function ChartCard(props: ChartCardProps): React.JSX.Element;
