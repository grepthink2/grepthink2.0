// Intentional addition: EntityIcon — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export type SearchEntityType =
  | 'person' | 'team' | 'project' | 'task' | 'story' | 'conversation' | 'class' | 'assignment' | 'action';

export interface EntityIconProps {
  /** @default 'task' */
  type?: SearchEntityType;
  /** Person name/email — initials are derived from it. */
  name?: string;
  /** @default 'md' (28px); 'sm' = 22px */
  size?: 'sm' | 'md';
  className?: string;
}

export function EntityIcon(props: EntityIconProps): React.JSX.Element;
