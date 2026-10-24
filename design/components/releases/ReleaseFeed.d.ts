// Intentional addition: ReleaseFeed — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { Release } from './ReleasesModel';

export interface ReleaseFeedProps {
  /** Newest first. */
  releases?: Release[];
  /** Entries newer than this carry "New"; null (a first visit) marks only the newest. The host passes the value it opened with. */
  lastSeen?: string | null;
  /** @default 'ready' */
  status?: 'loading' | 'ready' | 'failed';
  /** The failed state's "Reload" button. @default reloads the page */
  onReload?: () => void;
  /** 'dark' inside a `Modal tone="dark"`. @default 'light' */
  tone?: 'light' | 'dark';
  /** The entries' heading element (h3 under the modal's h2). @default 'h3' */
  titleAs?: 'h2' | 'h3' | 'h4' | 'h5';
  className?: string;
}

/** The release list with its "New" markers, or the loading / failed / empty state. */
export function ReleaseFeed(props: ReleaseFeedProps): React.JSX.Element;
