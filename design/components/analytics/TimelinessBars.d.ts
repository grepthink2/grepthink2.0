import * as React from 'react';

export type TimelinessBucket = 'early' | 'on_time' | 'late' | 'missing' | 'not_due';

export interface TimelinessRow {
  key: string;
  /** Class name, assignment name, or "Smaller groups (n)". */
  label: string;
  /** ISO datetime — present on assignment rows. */
  dueAt?: string;
  expected: number;
  buckets: { key: TimelinessBucket; label?: string; value: number }[];
  editedLate?: number;
  /** Whole row not due yet — gray track + italic due date; excluded from the rate. */
  notDueYet?: boolean;
  /** k-anonymity fold — italic, unlinked, ⓘ. */
  folded?: boolean;
  /** Links the row to the assignment / class. */
  href?: string;
}

export interface TimelinessBarsProps {
  rows: TimelinessRow[];
  /** @default ['early','on_time','late','missing','not_due'] */
  bucketOrder?: TimelinessBucket[];
  /** @default 'chart' */
  view?: 'chart' | 'table';
  /** Rows shown before "Show all (n)". @default 12 */
  maxRows?: number;
  /** 14px bars; defaults to true when rows > 12. */
  dense?: boolean;
  onRowClick?: (row: TimelinessRow) => void;
  className?: string;
}

/** 100%-stacked submission buckets per class or per assignment, status palette + icon legend. */
export function TimelinessBars(props: TimelinessBarsProps): React.JSX.Element;

export const TIMELINESS_BUCKETS: Record<TimelinessBucket, { label: string; icon: string }>;
