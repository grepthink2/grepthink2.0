// Intentional addition: ReleaseEntry — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
import type { Release } from './ReleasesModel';

export interface ReleaseEntryProps {
  release: Release;
  /** Newer than the version this browser last saw → the "New" marker beside the date. @default false */
  isNew?: boolean;
  /** The date heading's element; the group labels are one level down. @default 'h3' */
  titleAs?: 'h2' | 'h3' | 'h4' | 'h5';
  className?: string;
}

/** One release: date heading, version, the "New" marker, then New · Improved · Fixed, each a label over its list. */
export function ReleaseEntry(props: ReleaseEntryProps): React.JSX.Element;
