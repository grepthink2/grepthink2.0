// Intentional addition: EmptyState, NoClassSelected, Skeleton — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface EmptyStateProps {
  /** Icon in the round well (page: 64px tinted; card: 36px sunken). Not shown for quiet / error. */
  icon?: React.ReactNode;
  /** Visible heading text (never forwarded as the HTML title attribute). */
  title: React.ReactNode;
  description?: React.ReactNode;
  /** CTA button(s). */
  action?: React.ReactNode;
  /** page · card (inside a card or table) · quiet (left-aligned text) · error (quiet + Try again, `role="status"`). @default 'page' */
  variant?: 'page' | 'card' | 'quiet' | 'error';
  /** Tighter page padding. @default false */
  compact?: boolean;
  /** Heading level from the context. @default 'h3' */
  titleAs?: 'h1' | 'h2' | 'h3' | 'h4' | 'p';
  /** Adds the "Try again" link (error variant). */
  onRetry?: () => void;
  /** @default 'Try again' */
  retryLabel?: string;
  className?: string;
}

export interface NoClassSelectedProps {
  /** Opens the class selector; renders the "Choose a class" button. */
  onSelectClass?: () => void;
  /** @default 'page' */
  variant?: 'page' | 'card';
  /** @default 'h2' */
  titleAs?: 'h1' | 'h2' | 'h3';
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
/** The one "No class selected" state for the 14 class-scoped pages. */
export function NoClassSelected(props: NoClassSelectedProps): React.JSX.Element;
/** Shimmering loading placeholder (mirrors the app's skeleton-block mixin). */
export function Skeleton(props: SkeletonProps): React.JSX.Element;
