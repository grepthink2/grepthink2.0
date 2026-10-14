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
  /** "How this is counted" popover content (string = body only). */
  definition?: string | ChartCardDefinition;
  /** Adds the LIVE pill — the card ignores the range. @default false */
  live?: boolean;
  /** Header tools: UnitToggle, compare toggle, Table toggle, Export. */
  actions?: React.ReactNode;
  /** @default 'ready' */
  state?: ChartCardState;
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

export interface ChartCardToolProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: AnalyticsIconName;
  label: React.ReactNode;
  /** Renders the toggled state (aria-pressed). Omit for plain actions like Export. */
  pressed?: boolean;
}

/** 28px header tool button (Table toggle, Export CSV). */
export function ChartCardTool(props: ChartCardToolProps): React.JSX.Element;

export interface ChartCardCheckProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

/** Header checkbox ("Compare with previous range"). */
export function ChartCardCheck(props: ChartCardCheckProps): React.JSX.Element;
