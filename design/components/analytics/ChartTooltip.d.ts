// Intentional addition: ChartFormat, ChartTooltip — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface ChartTooltipRow {
  key?: string;
  label: string;
  value: string | number;
  /** Series identity class keying the row ("gt-series--1", "gt-status--done"). */
  seriesClass?: string;
}

export interface ChartTooltipProps {
  /** Pixel offset inside the `.gt-plot` container. */
  x?: number;
  y?: number;
  title?: string;
  rows?: ChartTooltipRow[];
  /** Muted one-liner under the rows (e.g. "Due Oct 12 · 9 edited late"). */
  note?: string;
  /** @default 'above' */
  placement?: 'above' | 'below' | 'right';
  className?: string;
}

/** `.gt-chart-tip` — white, 1px border, radius 7, hover shadow. Text only; never gates data. */
export function ChartTooltip(props: ChartTooltipProps): React.JSX.Element;

/** Hover/focus tooltip state for one chart. */
export function useChartTip(): {
  tip: (ChartTooltipProps & { [k: string]: unknown }) | null;
  show: (x: number, y: number, title: string, rows: ChartTooltipRow[], extra?: Record<string, unknown>) => void;
  hide: () => void;
};

/** Measures a container's width (ResizeObserver). */
export function useMeasure(initial?: number): [React.RefObject<HTMLDivElement>, number];
/** 1284 → "1,284", 12900 → "12.9K", 1300000 → "1.3M". */
export function fmtCompact(n: number | null | undefined): string;
/** 0.82 → "82%". */
export function fmtPct(r: number | null | undefined, digits?: number): string;
/** 0.18 → "+18%". */
export function fmtDelta(r: number | null | undefined): string | null;
/** "2026-09-07" → "Sep 7" (or "Sep 7, 2026"). */
export function fmtWeek(iso: string, withYear?: boolean): string;
/** "Sep 8 – Oct 7" · "Dec 25, 2025 – Jan 5, 2026" across years. */
export function fmtRange(from: string, to: string): string;
/** Nice axis ceiling + ticks. */
export function niceScale(max: number, count?: number): [number, number[]];

/** The formatters as one object on the bundle namespace. */
export const ChartFormat: {
  compact: typeof fmtCompact; pct: typeof fmtPct; delta: typeof fmtDelta;
  week: typeof fmtWeek; range: typeof fmtRange; niceScale: typeof niceScale;
};
