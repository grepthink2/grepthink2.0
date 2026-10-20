import React from 'react';

/**
 * One avatar palette everywhere: six token slots (--gt-avatar-1…6), each ≥ 4.5:1 behind white
 * initials. The app's seven schemes (one failing behind white) all port to this list + hashColor.
 */
export const AVATAR_COLORS = ['var(--gt-avatar-1)', 'var(--gt-avatar-2)', 'var(--gt-avatar-3)', 'var(--gt-avatar-4)', 'var(--gt-avatar-5)', 'var(--gt-avatar-6)'];

export function initialsOf(name = '') {
  const clean = name.includes('@') ? name.split('@')[0].replace(/[._-]+/g, ' ') : name;
  const parts = clean.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic palette slot for a name (the one hash). */
export function hashColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/**
 * Avatar: photo, or initials on the hashed palette colour. When `src` fails to load it falls back
 * to the initials. `decorative` (beside a visible name) hides it from screen readers.
 */
export function Avatar({ name = '', src, size = 'md', square = false, decorative = false, className = '', ...rest }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setFailed(false); }, [src]);
  const cls = ['gt-avatar', `gt-avatar--${size}`, square ? 'gt-avatar--square' : '', className].filter(Boolean).join(' ');
  if (src && !failed) {
    return <img className={cls} src={src} alt={decorative ? '' : name} aria-hidden={decorative || undefined} onError={() => setFailed(true)} {...rest} />;
  }
  return (
    <span className={cls} style={{ backgroundColor: hashColor(name) }} role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : (name || 'Avatar')} aria-hidden={decorative || undefined} {...rest}>
      {initialsOf(name)}
    </span>
  );
}

/** Overlapping row of avatars with a "+n" chip; read as one image ("Ana Ruiz, Ben Ko and 3 more"). */
export function AvatarGroup({ names = [], max = 4, size = 'sm', className = '' }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className={['gt-avatar-group', className].filter(Boolean).join(' ')} role="img" aria-label={`${shown.join(', ')}${extra > 0 ? ` and ${extra} more` : ''}`}>
      {shown.map((n) => <Avatar key={n} name={n} size={size} decorative />)}
      {extra > 0 && <span className={`gt-avatar gt-avatar--${size} gt-avatar--extra`} aria-hidden="true">+{extra}</span>}
    </span>
  );
}
