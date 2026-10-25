// Intentional addition: WhatsNewModal — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { Release } from './ReleasesModel';

/** The brief's contract (§8), unchanged. */
export interface WhatsNewModalProps {
  open: boolean;
  onClose: () => void;
  /** 'dark' on the landing page, 'light' in the app. @default 'light' */
  tone?: 'dark' | 'light';
  /** Newest first. */
  releases: Release[];
  /** Shown as the subtitle: "Version 0.91.0". */
  currentVersion: string;
  /** Entries newer than this carry "New"; null (a first visit) marks only the newest. Pass the value the modal opened with. */
  lastSeen: string | null;
  status: 'loading' | 'ready' | 'failed';
  /** The failed state's "Reload" button. @default reloads the page */
  onReload?: () => void;
  /** false renders in place (galleries). @default true */
  portal?: boolean;
  className?: string;
}

/** The release notes in the kit's Modal (md, no footer): "What's new" · "Version x.y.z" · the feed. */
export function WhatsNewModal(props: WhatsNewModalProps): React.JSX.Element | null;
