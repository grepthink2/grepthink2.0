import * as React from 'react';

export interface MatchTextProps {
  text: string;
  /** Substring to emphasize; empty renders plain text. */
  query?: string;
  className?: string;
}

export function MatchText(props: MatchTextProps): React.JSX.Element;
