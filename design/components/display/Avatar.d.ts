// Intentional addition: AVATAR_COLORS, Avatar, AvatarGroup — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import * as React from 'react';

export interface AvatarProps extends React.HTMLAttributes<HTMLElement> {
  /** Full name or email — initials, colour and the accessible name come from it ("Avatar" when empty). */
  name?: string;
  /** Photo; when it fails to load the initials show instead. */
  src?: string;
  /** 20 / 28 / 36 / 48 / 64. @default 'md' */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  /** Rounded-square instead of circle (project avatars). @default false */
  square?: boolean;
  /** Beside a visible name: `aria-hidden` and an empty alt, so the initials are not read twice. @default false */
  decorative?: boolean;
  /** Merges over the hashed colour (a caller's own colour wins). */
  style?: React.CSSProperties;
}

export interface AvatarGroupProps {
  names: string[];
  /** Max avatars before collapsing to "+n"; at least 1. @default 4 */
  max?: number;
  /** @default 'sm' */
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

/** The one palette: 'var(--gt-avatar-1)' … 'var(--gt-avatar-6)', each ≥ 4.5:1 behind white. */
export const AVATAR_COLORS: string[];
/** The one hash: a deterministic palette slot for a name / email. */
export function hashColor(name?: string): string;
/** "Ashton Liu" → "AL", "aliu@ucsc.edu" → "AL". */
export function initialsOf(name?: string): string;
export function Avatar(props: AvatarProps): React.JSX.Element;
/** Overlapping avatars + "+n", announced as one image. */
export function AvatarGroup(props: AvatarGroupProps): React.JSX.Element;
