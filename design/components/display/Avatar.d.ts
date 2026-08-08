import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLElement> {
  /** Full name or email — initials and color are derived from it. */
  name?: string;
  /** Optional image; falls back to initials. */
  src?: string;
  /** @default 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Rounded-square instead of circle (project avatars). @default false */
  square?: boolean;
}

export interface AvatarGroupProps {
  names: string[];
  /** Max avatars before collapsing to "+n". @default 4 */
  max?: number;
  /** @default 'sm' */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

export function Avatar(props: AvatarProps): React.JSX.Element;
export function AvatarGroup(props: AvatarGroupProps): React.JSX.Element;
