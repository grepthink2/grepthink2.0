import * as React from 'react';

export interface AnnouncementPillProps {
  /** Announcement text, e.g. "Scrum boards and team channels". */
  children: React.ReactNode;
  /** Anchor to the feature band. @default '#scrum-board' */
  href?: string;
  /** @default 'NEW' */
  badge?: string;
  /** Full accessible name, e.g. "New: scrum boards and team channels. Jump to the scrum board section". */
  ariaLabel?: string;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  className?: string;
}

export function AnnouncementPill(props: AnnouncementPillProps): React.JSX.Element;
