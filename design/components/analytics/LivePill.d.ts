import * as React from 'react';

export interface LivePillProps {
  /** @default 'Live' */
  label?: string;
  /** Hover explanation. */
  title?: string;
  className?: string;
}

/** 10px/600 uppercase "LIVE" with a 6px green dot on the soft green ground. Static — no animation. */
export function LivePill(props: LivePillProps): React.JSX.Element;
