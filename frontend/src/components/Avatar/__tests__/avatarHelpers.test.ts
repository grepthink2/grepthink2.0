import { describe, expect, it } from 'vitest';
import { AVATAR_COLORS, AVATAR_PX, hashColor, initialsOf } from '../avatarHelpers';

describe('avatar helpers', () => {
  it('initialsOf handles names, emails and blanks', () => {
    expect(initialsOf('Ashton Liu')).toBe('AL');
    expect(initialsOf('aliu@ucsc.edu')).toBe('AL');
    expect(initialsOf('ashton.liu@ucsc.edu')).toBe('AL');
    expect(initialsOf('ashton_k-liu@ucsc.edu')).toBe('AL');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
    expect(initialsOf('  tony   wu  ')).toBe('TW');
    expect(initialsOf('Madonna')).toBe('MA');
    expect(initialsOf('Q')).toBe('Q');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf()).toBe('?');
    expect(initialsOf('@ucsc.edu')).toBe('?');
  });

  it('initialsOf takes whole characters, not halves of one', () => {
    const script = String.fromCodePoint(0x1d49c); // a letter outside the 16-bit range
    expect(initialsOf(`${script}lice Bo`)).toBe(`${script}B`);
    expect(initialsOf(`${script}l`)).toBe(`${script}L`);
  });

  it('hashColor is stable and in the palette', () => {
    expect(hashColor('Pat Lee')).toBe(hashColor('Pat Lee'));
    // Pinned slots: the hash decides every person's colour, so changing it repaints everyone.
    expect(hashColor('')).toBe('var(--gt-avatar-1)');
    expect(hashColor()).toBe('var(--gt-avatar-1)');
    expect(hashColor('Pat Lee')).toBe('var(--gt-avatar-2)');
    expect(hashColor('Tony Wu')).toBe('var(--gt-avatar-3)');
    expect(hashColor('aliu@ucsc.edu')).toBe('var(--gt-avatar-4)');
    expect(hashColor('Joshua Cruz')).toBe('var(--gt-avatar-5)');
    expect(hashColor('Ashton Liu')).toBe('var(--gt-avatar-6)');
    for (const name of ['Ro Trinh', 'QA Student', 'Landon Ng', 'a'.repeat(500)]) {
      expect(AVATAR_COLORS).toContain(hashColor(name));
    }
  });

  it('AVATAR_COLORS are the six token slots, in order', () => {
    expect(AVATAR_COLORS).toEqual([1, 2, 3, 4, 5, 6].map((n) => `var(--gt-avatar-${n})`));
  });

  it('AVATAR_PX gives each size in px', () => {
    expect(AVATAR_PX).toEqual({ xs: 20, sm: 28, md: 36, lg: 48, xl: 64 });
  });
});
