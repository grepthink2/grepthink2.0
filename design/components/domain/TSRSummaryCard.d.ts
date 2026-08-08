import * as React from 'react';

export interface TSRSummaryRow {
  name: string;
  /** Percent contribution reported for this teammate. */
  percent: number | string;
}

export interface TSRSummaryCardProps {
  /** Who submitted the report. */
  submitter: string;
  /** Sprint label ("Sprint 3"). */
  sprint?: string;
  submittedAt?: string;
  /** @default 'submitted' */
  status?: 'submitted' | 'late' | 'missing';
  /** Per-teammate contribution rows. */
  rows?: TSRSummaryRow[];
  /** Shows "View full report". */
  onOpen?: () => void;
  className?: string;
}

export function TSRSummaryCard(props: TSRSummaryCardProps): React.JSX.Element;
