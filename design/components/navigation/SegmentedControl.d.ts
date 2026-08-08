import * as React from 'react';

export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps {
  options: SegmentedOption[];
  value: string;
  onChange?: (value: string) => void;
  /** @default 'md' */
  size?: 'sm' | 'md';
  className?: string;
}

export function SegmentedControl(props: SegmentedControlProps): React.JSX.Element;
