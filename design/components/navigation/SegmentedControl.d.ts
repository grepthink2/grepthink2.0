import * as React from 'react';

export interface SegmentedOption {
  value: string;
  /** Visible label. For an icon-only option pass `ariaLabel` and an empty label. */
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Small tertiary count after the label (the search scopes' counts). */
  count?: number;
  /** Accessible name when the label is icon-only. */
  ariaLabel?: string;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  /** Names the radio group ("View", "Unit"). */
  ariaLabel: string;
  /** md 30px options, sm 24px (44 on phones). @default 'md' */
  size?: 'sm' | 'md';
  /** Stretch options across the container (always on under 768px). @default false */
  fullWidth?: boolean;
  className?: string;
}

/** Segmented control: switch the view or unit of the same content. */
export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
