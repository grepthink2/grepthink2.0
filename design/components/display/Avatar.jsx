import React from 'react';

const AVATAR_COLORS = ['#018156', '#2771FF', '#B26A00', '#7D3C98', '#016547', '#1543A8'];

function initialsOf(name = '') {
  const clean = name.includes('@') ? name.split('@')[0].replace(/[._-]+/g, ' ') : name;
  const parts = clean.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashColor(name = '') {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

/**
 * Avatar with initials derived from a name or email.
 * Deterministic background color per name; optional image src.
 */
export function Avatar({ name = '', src, size = 'md', square = false, className = '', ...rest }) {
  const cls = ['gt-avatar', `gt-avatar--${size}`, square ? 'gt-avatar--square' : '', className].filter(Boolean).join(' ');
  if (src) {
    return <img className={cls} src={src} alt={name} {...rest} />;
  }
  return (
    <span className={cls} style={{ backgroundColor: hashColor(name) }} role="img" aria-label={name || 'avatar'} {...rest}>
      {initialsOf(name)}
    </span>
  );
}

/** Overlapping row of avatars with a "+n" overflow chip. */
export function AvatarGroup({ names = [], max = 4, size = 'sm', className = '' }) {
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  return (
    <span className={['gt-avatar-group', className].filter(Boolean).join(' ')}>
      {shown.map((n) => <Avatar key={n} name={n} size={size} />)}
      {extra > 0 && <span className={`gt-avatar gt-avatar--${size} gt-avatar--extra`}>+{extra}</span>}
    </span>
  );
}
