import * as React from 'react';

export interface TSREntry {
  /** Teammate name. */
  name: string;
  /** Role label shown under the name. */
  role?: string;
  /** Percent contribution 0–100. */
  percent: number | string;
  positive?: string;
  constructive?: string;
}

export interface TSRFormProps {
  entries: TSREntry[];
  onChange?: (entries: TSREntry[]) => void;
  /** Adds the scrum-master notes block. @default false */
  showScrumNotes?: boolean;
  scrumNotes?: string;
  onScrumNotesChange?: (notes: string) => void;
  /** Warn while percents don't sum to 100. @default true */
  totalWarning?: boolean;
  className?: string;
}

export function TSRForm(props: TSRFormProps): React.JSX.Element;
