// Intentional addition: SlotTime — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';
export interface SlotTimeProps {
  /** ISO instant. */
  startsAt: string;
  /** @default 60 */
  minutes?: number;
  /** The viewer's zone. */
  zone?: string;
  /** The class's school zone (institutions.timezone). @default 'America/Los_Angeles' */
  schoolZone?: string;
  /** Prefix the day ("Monday, Dec 7 · …"). @default false */
  withDay?: boolean;
  /** @default 'long' */
  dayFormat?: 'long' | 'short';
  /** Append "· 1 h" as <time datetime="PT1H">. @default false */
  withDuration?: boolean;
  /** 'stack' puts the campus line under the time; 'inline' beside it. @default 'stack' */
  layout?: 'stack' | 'inline';
  className?: string;
}
/** A slot's time in the viewer's zone with the campus time visible beside it when the zones differ. */
export function SlotTime(props: SlotTimeProps): React.JSX.Element;
