// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FONTS } from '../design-system/previews.mjs';
import { ICONS_MARKER, brandBook, brandBookProblems } from '../design-system/readme.mjs';

const source = readFileSync(fileURLToPath(new URL('../../design-system/README.md', import.meta.url)), 'utf8');

describe('brandBook', () => {
  it('lists the icons in place of the marker, at its indent', () => {
    const out = brandBook(`## Iconography\n- Icons:\n  ${ICONS_MARKER}\n- More.\n`, ['Bell', 'Trash2']);
    expect(out).toBe('## Iconography\n- Icons:\n  `Bell`, `Trash2`.\n- More.\n');
  });

  it('needs exactly one marker', () => {
    expect(() => brandBook('No marker.\n', ['Bell'])).toThrow(`design-system/README.md needs one ${ICONS_MARKER} line, where the build lists the icons; it has 0`);
    expect(() => brandBook(`${ICONS_MARKER}\n${ICONS_MARKER}\n`, ['Bell'])).toThrow('it has 2');
  });

  it('builds a publishable brand book from design-system/README.md', () => {
    const out = brandBook(source, ['Bell', 'Trash2']);
    expect(brandBookProblems(out, ['Bell', 'Trash2'])).toEqual([]);
    expect(out).toContain(FONTS);
    expect(out).toContain('window.GrepThinkDesignSystem_36e7e3');
    // The page names the system above the brand book, and a sync replaces nothing it appended.
    expect(out.startsWith('# ')).toBe(false);
  });
});
