// Intentional addition: MatchText — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface MatchTextProps {
  text: string;
  /** Substring to emphasize; empty renders plain text. */
  query?: string;
  className?: string;
}

export function MatchText(props: MatchTextProps): React.JSX.Element;
