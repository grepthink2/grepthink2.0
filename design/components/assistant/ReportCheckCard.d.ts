import * as React from 'react';

export interface ReportCheckRow {
  /** 'match' = reports agree with closed work; 'review' = worth a look. @default 'match' */
  kind?: 'match' | 'review';
  /** Neutral, factual text — e.g. "Alex: reports 35%, closed 1 of 6 tasks". */
  text: React.ReactNode;
  onReview?: () => void;
}

export interface ReportCheckCardProps {
  /** @default 'Week 5' */
  week?: string;
  project?: string;
  rows: ReportCheckRow[];
  /** @default 'app' */
  surface?: 'app' | 'landing';
  className?: string;
  /** Placement styles (stage positioning). */
  style?: React.CSSProperties;
}

/** Staff-only comparison of weekly status reports with closed work. */
export function ReportCheckCard(props: ReportCheckCardProps): React.JSX.Element;
