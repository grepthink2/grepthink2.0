import { describe, expect, it } from 'vitest';
import tokens from '@/styles/tokens/colors.css?raw';
import { AVATAR_COLORS as KIT_PALETTE } from '@/components/Avatar/avatarHelpers';
import { AVATAR_COLORS } from '../avatarColors';

/** A token's value in tokens/colors.css, following var() references down to the literal. */
function resolve(value: string): string {
  const ref = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (!ref) return value.trim();
  const declared = new RegExp(`${ref[1]}:\\s*([^;]+);`).exec(tokens);
  if (!declared) throw new Error(`${ref[1]} is not declared in tokens/colors.css`);
  return resolve(declared[1]);
}

describe('the landing page’s avatar colours', () => {
  it('are the kit’s six token slots as hex, in the same order', () => {
    expect(KIT_PALETTE.map((slot) => resolve(slot).toUpperCase())).toEqual(AVATAR_COLORS.map((hex) => hex.toUpperCase()));
  });
});
