import * as React from 'react';

export type EstimateScale = 'linear' | 'exponential' | 'fibonacci';

/** Scale → allowed point values (linear 1–6, exponential 1–32, fibonacci 1–13). */
export const ESTIMATE_SCALES: Record<EstimateScale, number[]>;

export interface ScalePickerProps {
  /** @default 'fibonacci' */
  value?: EstimateScale;
  onChange?: (scale: EstimateScale) => void;
  className?: string;
}

export interface PointPickerProps {
  /** Which scale's values to offer. @default 'fibonacci' */
  scale?: EstimateScale;
  /** Selected point value. */
  value?: number;
  onChange?: (points: number) => void;
  className?: string;
}

/** Project-level estimate-scale setting (linear / exponential / fibonacci). */
export function ScalePicker(props: ScalePickerProps): React.JSX.Element;
/** Chip row of the active scale's point values. */
export function PointPicker(props: PointPickerProps): React.JSX.Element;
