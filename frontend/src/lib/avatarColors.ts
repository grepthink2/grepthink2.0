/**
 * The landing page's copy of the avatar palette, as hex: its decorative floating cards
 * (features/landing/components/FloatingCards.tsx) paint with these. Everything else takes the kit's
 * palette and hash from components/Avatar/avatarHelpers.ts (AVATAR_COLORS as the --gt-avatar-1…6
 * tokens, hashColor, initialsOf). The six are kept verbatim, in the tokens' order, and
 * lib/__tests__/avatarColors.test.ts pins the two together.
 */
export const AVATAR_COLORS = [
  '#018156',
  '#1B57D6',
  '#8A5200',
  '#7D3C98',
  '#016547',
  '#1543A8',
] as const;
