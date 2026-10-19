import * as React from 'react';

export interface ScheduleDayHeaderProps {
  /** 'YYYY-MM-DD' — derives "Today / Tomorrow / Thursday" + the date. */
  dayKey?: string;
  now?: Date;
  /** @default 'America/Los_Angeles' */
  zone?: string;
  /** Custom heading instead of the derived one (e.g. "Next"). */
  title?: React.ReactNode;
  date?: React.ReactNode;
  /** Forces the today treatment (green title). */
  isToday?: boolean;
  /** Right-aligned muted text. */
  aside?: React.ReactNode;
  /** id for aria-labelledby on the day's list. */
  id?: string;
  /** Heading element. @default 'h3' */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
}

/** Day heading; sticky at the top of the agenda's scroll. */
export function ScheduleDayHeader(props: ScheduleDayHeaderProps): React.JSX.Element;
