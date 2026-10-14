import * as React from 'react';

export interface BreakdownColumn {
  key: string;
  label: string;
  /** 'int' and 'pct' right-align with tabular figures; 'pct' adds a 3px meter. */
  format: 'text' | 'int' | 'pct';
  sortable?: boolean;
}

export interface BreakdownRow {
  id: string;
  name: string;
  /** 'folded' = k-anonymity fold, always last, italic, unlinked. */
  kind: 'row' | 'folded';
  teams?: number;
  students?: number;
  members?: number;
  team_messages: number;
  stories: number;
  tasks: number;
  points_done_rate: number | null;
  /** Arrive with timeliness (sub-project C). */
  on_time_rate?: number | null;
  missing?: number;
  href?: string;
}

export interface BreakdownSort {
  key: string;
  dir: 'asc' | 'desc';
}

export interface BreakdownTableProps {
  /** @default BREAKDOWN_COLUMNS (per class). Use TEAM_BREAKDOWN_COLUMNS with a class filter; append TIMELINESS_COLUMNS once timeliness ships. */
  columns?: BreakdownColumn[];
  rows: BreakdownRow[];
  sort?: BreakdownSort;
  onSort?: (sort: BreakdownSort) => void;
  /** "View" as a link — class rows drill into that class, team rows open the team's scrum board. */
  getRowHref?: (row: BreakdownRow) => string | undefined;
  /** "View" as a button (in-page drill-down). Takes precedence over getRowHref. */
  onRowView?: (row: BreakdownRow) => void;
  /** 20px rows; defaults to true when rows > 12. */
  dense?: boolean;
  /** Rows before "Show all (n)". @default 12 */
  maxRows?: number;
  className?: string;
}

/** `.gt-table--breakdown` — sticky header, inline meters, folded privacy row, View links. */
export function BreakdownTable(props: BreakdownTableProps): React.JSX.Element;

export const BREAKDOWN_COLUMNS: BreakdownColumn[];
export const TEAM_BREAKDOWN_COLUMNS: BreakdownColumn[];
export const TIMELINESS_COLUMNS: BreakdownColumn[];
