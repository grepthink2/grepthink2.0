// Intentional addition: NewDot — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface NewDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 2px ring in the surface behind the dot (`--gt-new-dot-ring`, default `--gt-surface`) — over an avatar or an icon's corner. @default false */
  ring?: boolean;
  className?: string;
}

/** The 8px blue "something new to read" dot. Decorative (`aria-hidden`): the host's control is described by a visually hidden "New release notes". Never the red UnreadBadge. */
export function NewDot(props: NewDotProps): React.JSX.Element;
