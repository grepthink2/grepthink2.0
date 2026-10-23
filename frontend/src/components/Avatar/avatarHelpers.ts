export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * The one avatar palette: six token slots (green-500, blue-600, amber-700, purple, green-700,
 * blue-700), each 4.5:1 or more behind white initials. Every avatar picks its colour from it through
 * hashColor. The landing page keeps the same six as hex (lib/avatarColors.ts), and a test pins that
 * copy to these tokens.
 */
export const AVATAR_COLORS = [
  'var(--gt-avatar-1)',
  'var(--gt-avatar-2)',
  'var(--gt-avatar-3)',
  'var(--gt-avatar-4)',
  'var(--gt-avatar-5)',
  'var(--gt-avatar-6)',
] as const;

/** Each size in px, as Avatar.scss draws it: for a placeholder that must match one (a loading row's circle). */
export const AVATAR_PX: Record<AvatarSize, number> = { xs: 20, sm: 28, md: 36, lg: 48, xl: 64 };

/**
 * "Ashton Liu" → "AL": the first letters of the first and last words. An email reads as its local part,
 * with dots, dashes and underscores as spaces ("aliu@ucsc.edu" → "AL"); one word gives its first two
 * letters; a blank gives "?". Letters are whole characters, so one outside the 16-bit range is never
 * cut in half.
 */
export function initialsOf(name = ''): string {
  const clean = name.includes('@') ? name.split('@')[0].replace(/[._-]+/g, ' ') : name;
  const words = clean.trim().split(/\s+/).filter(Boolean).map((word) => Array.from(word));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).join('').toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** The one hash: a stable palette slot for a name or email, the same on every screen. */
export function hashColor(name = ''): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
