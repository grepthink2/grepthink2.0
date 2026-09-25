import * as React from 'react';

export interface EmptyStateProps {
  /** Icon rendered in the round tinted well. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CTA button(s). */
  action?: React.ReactNode;
  /** Tighter paddings for in-table use. @default false */
  compact?: boolean;
  className?: string;
}

export interface SkeletonProps {
  /** @default '100%' */
  width?: number | string;
  /** @default 14 */
  height?: number | string;
  radius?: number | string;
  /** @default false */
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function EmptyState(props: EmptyStateProps): React.JSX.Element;
/** Shimmering loading placeholder (mirrors the app's skeleton-block mixin). */
export function Skeleton(props: SkeletonProps): React.JSX.Element;
