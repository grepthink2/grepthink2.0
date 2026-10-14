import * as React from 'react';

export type RangePreset = '7d' | '30d' | '90d' | 'class' | 'all' | 'custom';

export interface AnalyticsRange {
  preset: RangePreset;
  /** ISO date, inclusive — required for 'custom'. */
  from?: string;
  to?: string;
}

export interface AnalyticsFilterValue {
  institutionId?: string;
  /** '' = all classes of the institution. */
  classId: string;
  range: AnalyticsRange;
}

export interface AnalyticsFilterRowProps {
  /** Shown as a Select only when more than one. */
  institutions?: { id: string; name: string }[];
  institutionId?: string;
  /** Label includes the term: "CSE 115A · Fall 2026". */
  classes?: { id: string; label: string }[];
  classId?: string;
  range: AnalyticsRange;
  /** Receives the whole filter value; persist it in the URL. */
  onChange: (value: AnalyticsFilterValue) => void;
  /** First load only. @default false */
  disabled?: boolean;
  /** Reference "today" for presets (tests / fixtures). */
  today?: Date;
  className?: string;
}

/** The single filter row above everything it scopes. */
export function AnalyticsFilterRow(props: AnalyticsFilterRowProps): React.JSX.Element;

export const RANGE_PRESETS: { value: RangePreset; label: string }[];
