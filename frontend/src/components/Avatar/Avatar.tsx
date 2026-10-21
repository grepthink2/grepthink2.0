import { useState, type HTMLAttributes, type Ref } from 'react';
import { hashColor, initialsOf, type AvatarSize } from './avatarHelpers';
import './Avatar.scss';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLElement>, 'children' | 'role' | 'aria-label' | 'aria-hidden'> {
  /** Full name or email: the initials, the colour and the accessible name come from it. */
  name?: string;
  /** A photo; when it fails to load, the initials show instead. */
  src?: string;
  /** 20 / 28 / 36 / 48 / 64. @default 'md' */
  size?: AvatarSize;
  /** A rounded square instead of a circle (project avatars). @default false */
  square?: boolean;
  /** Beside a visible name: `aria-hidden`, and an empty alt for a photo, so the name is not read twice. @default false */
  decorative?: boolean;
  /**
   * Set from `name` and `decorative`. JSX takes any hyphenated prop a type leaves out, so these are
   * declared `never` rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  'aria-hidden'?: never;
  /** Reaches the `<img>` or the initials' `<span>`, whichever shows. */
  ref?: Ref<HTMLElement>;
}

/**
 * Person or project avatar, ported from design/components/display/Avatar.jsx: the photo, or the
 * initials on the palette colour hashColor picks for the name (avatarHelpers). It is `role="img"`
 * named by `name` ("Avatar" without one), unless `decorative` hides it beside a visible name. A photo
 * that fails to load falls back to the initials; a new `src` gets its own try.
 *
 * Native props and `ref` reach the element that shows; a `style` merges over the initials' colour.
 */
export function Avatar({
  name = '', src, size = 'md', square = false, decorative = false, className = '', style, onError, ref, ...rest
}: AvatarProps) {
  // The photo that last failed: a new src is tried again without an effect to reset anything.
  const [failedSrc, setFailedSrc] = useState<string>();
  const cls = ['gt-avatar', `gt-avatar--${size}`, square ? 'gt-avatar--square' : '', className].filter(Boolean).join(' ');
  const label = name.trim() || 'Avatar';
  if (src && src !== failedSrc) {
    return (
      <img
        {...rest}
        ref={ref as Ref<HTMLImageElement>}
        className={cls}
        style={style}
        src={src}
        alt={decorative ? '' : label}
        aria-hidden={decorative || undefined}
        onError={(e) => {
          setFailedSrc(src);
          onError?.(e);
        }}
      />
    );
  }
  return (
    <span
      {...rest}
      ref={ref as Ref<HTMLSpanElement>}
      className={cls}
      style={{ backgroundColor: hashColor(name), ...style }}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative || undefined}
    >
      {initialsOf(name)}
    </span>
  );
}

export interface AvatarGroupProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children' | 'role' | 'aria-label'> {
  names: string[];
  /** The most avatars shown before the rest collapse to "+n"; at least 1. @default 4 */
  max?: number;
  /** @default 'sm' */
  size?: 'xs' | 'sm' | 'md';
  /**
   * Set from `names`. JSX takes any hyphenated prop a type leaves out, so both are declared `never`
   * rather than only omitted.
   */
  role?: never;
  'aria-label'?: never;
  ref?: Ref<HTMLSpanElement>;
}

/**
 * Overlapping avatars with a "+n" chip past `max`, ported from the design's AvatarGroup. It is one
 * image named for everyone in it ("Ana Ruiz, Ben Ko and 3 more"), with each face hidden; with no
 * names it is an empty row, no image.
 *
 * Native props and `ref` reach the row's span.
 */
export function AvatarGroup({ names, max = 4, size = 'sm', className = '', ref, ...rest }: AvatarGroupProps) {
  // At least one face: 0 would show only "+n", and a negative count would slice from the end.
  const shown = names.slice(0, max >= 1 ? max : 1);
  const extra = names.length - shown.length;
  const label = `${shown.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`;
  return (
    <span
      {...rest}
      ref={ref}
      className={['gt-avatar-group', className].filter(Boolean).join(' ')}
      role={names.length ? 'img' : undefined}
      aria-label={names.length ? label : undefined}
    >
      {/* Keyed by position: two people can share a name. */}
      {shown.map((n, i) => <Avatar key={i} name={n} size={size} decorative />)}
      {extra > 0 && <span className={`gt-avatar gt-avatar--${size} gt-avatar--extra`} aria-hidden="true">+{extra}</span>}
    </span>
  );
}
