import * as React from 'react';

export interface StageCardProps {
  /** Degrees, keep within −3…+3. @default 0 */
  tilt?: number;
  /** Float amplitude in px (negative = up). Keep within ±8–10. @default -9 */
  floatY?: number;
  /** Float loop duration in seconds (8–10). @default 9 */
  floatDur?: number;
  floatDelay?: number;
  /** Reveal order within the stage (80ms stagger). @default 0 */
  order?: number;
  /** Pill-shaped chip shell. @default false */
  pill?: boolean;
  /** No float. @default false */
  still?: boolean;
  /** In-flow instead of absolute (galleries). @default false */
  inline?: boolean;
  /** The single card kept below 768px (untilted, still). @default false */
  mobile?: boolean;
  /** Hidden between 768 and 1079px. @default false */
  tabletHide?: boolean;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  /** Absolute placement: left/right/top/bottom/width. */
  style?: React.CSSProperties;
  className?: string;
}

export interface StageProps {
  /** 'live' = green tint + dot grid; 'preview' = outlined flat backdrop with a tag. @default 'live' */
  variant?: 'live' | 'preview';
  /** Mirror the tint for stage-left bands. @default false */
  mirror?: boolean;
  /** Pause floats (band off-screen). @default false */
  paused?: boolean;
  /** @default 'PREVIEW' */
  tag?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** Floating card shell for spotlight stages. */
export function StageCard(props: StageCardProps): React.JSX.Element;
/** Stage backdrop (live or preview) holding StageCards. */
export function Stage(props: StageProps): React.JSX.Element;
