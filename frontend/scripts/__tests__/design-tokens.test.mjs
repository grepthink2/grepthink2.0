// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKEN_NAME, buildTokens, parseTokenCss, tokensCss } from '../design-system/tokens.mjs';

const tokensDir = fileURLToPath(new URL('../../src/styles/tokens/', import.meta.url));
const meta = { source: 'code' };

/** buildTokens over one file of :root declarations. */
const build = (lines, path = 'tokens.css') => buildTokens([{ path, css: `:root {\n${lines.join('\n')}\n}\n` }], meta);
const tokensOf = (result, family) => result.tokens[family]?.tokens ?? [];

describe('parseTokenCss', () => {
  it('reads the :root custom properties in order, with the comment on their line', () => {
    const css = [
      '/* file header */',
      ':root {',
      '  /* group */',
      '  --gt-a: #FFF;  /* the a */',
      '  --gt-b: 1px;',
      '  --gt-c: 0.45; /* @kind other */ /* the c */',
      '}',
      '.x { --gt-d: 1; }',
    ].join('\n');
    expect(parseTokenCss(css)).toEqual([
      { name: 'gt-a', value: '#FFF', comment: 'the a' },
      { name: 'gt-b', value: '1px', comment: '' },
      { name: 'gt-c', value: '0.45', comment: 'the c' },
    ]);
  });
});

describe('buildTokens', () => {
  it('puts colours in color.tokens: hex lowercased, rgb and hsl with plain numbers, aliases of colours', () => {
    const result = build([
      '  --gt-gray-100: #EEEEEE; /* canvas */',
      '  --gt-scrim: rgba(0, 0, 0, 0.5);',
      '  --gt-tint: hsl(120, 50%, 40%);',
      '  --gt-canvas: var(--gt-gray-100);',
      '  --gt-canvas-2: var(--gt-canvas);',
    ]);
    expect(tokensOf(result, 'color')).toEqual([
      { name: 'gt-gray-100', value: '#eeeeee', usage: 'canvas' },
      { name: 'gt-scrim', value: 'rgba(0, 0, 0, 0.5)', usage: '' },
      { name: 'gt-tint', value: 'hsl(120, 50%, 40%)', usage: '' },
      { name: 'gt-canvas', value: '{gt-gray-100}', usage: '' },
      { name: 'gt-canvas-2', value: '{gt-canvas}', usage: '' },
    ]);
    expect(result.tokens.color.themes).toEqual([{ id: 'light', name: 'Light' }]);
  });

  it('sorts the other tokens into their families by name', () => {
    const result = build([
      '  --gt-space-sm: 8px;',
      '  --gt-radius-sm: 7px;',
      '  --gt-shadow-card: 0 0 2.61px rgba(0, 0, 0, 0.25);',
      '  --gt-text-body: 14px;',
      '  --gt-weight-bold: 700;',
      '  --gt-leading-tight: 1.2;',
      '  --gt-tracking-tight: -0.01em;',
      '  --gt-z-modal: 100;',
      '  --gt-opacity-disabled: 0.45;',
      '  --gt-container: 543px;',
    ]);
    const families = {
      spacing: 'gt-space-sm',
      radius: 'gt-radius-sm',
      shadow: 'gt-shadow-card',
      fontSize: 'gt-text-body',
      fontWeight: 'gt-weight-bold',
      lineHeight: 'gt-leading-tight',
      letterSpacing: 'gt-tracking-tight',
      zIndex: 'gt-z-modal',
      opacity: 'gt-opacity-disabled',
      size: 'gt-container',
    };
    for (const [family, name] of Object.entries(families)) {
      expect(tokensOf(result, family).map((t) => t.name)).toEqual([name]);
    }
    expect(result.kept).toEqual([]);
  });

  it('names the two font families in type, and keeps them declared', () => {
    const result = build([
      "  --gt-font-sans: 'Poppins', sans-serif;",
      "  --gt-font-mono: 'Fira Code', monospace;",
      '  --gt-text-body: 14px;',
      '  --gt-text-h1: 32px;',
      '  --gt-leading-tight: 1.2;',
      '  --gt-leading-normal: 1.5;',
    ]);
    expect(result.tokens.type.families).toEqual({ sans: "'Poppins', sans-serif", mono: "'Fira Code', monospace" });
    expect(result.tokens.type.fonts).toEqual([]);
    expect(result.tokens.type.groups).toEqual([
      {
        name: 'Text',
        family: 'sans',
        styles: [
          { name: 'body', fontSize: '14px', lineHeight: 1.5, fontWeight: 400 },
          { name: 'h1', fontSize: '32px', lineHeight: 1.2, fontWeight: 600 },
        ],
      },
    ]);
    expect(result.carried.has('gt-font-sans')).toBe(false);
    expect(result.kept.map((k) => k.name)).toEqual(['gt-font-sans', 'gt-font-mono']);
  });

  it('keeps in bundle.css what the format cannot hold, with the reason', () => {
    const result = build([
      '  --gt-a: calc(1px + 2px);',
      '  --gt-b: color-mix(in srgb, red, blue);',
      '  --gt-space-md: 16px;',
      '  --gt-c: var(--gt-space-md);',
      '  --gt-d: var(--gt-nowhere);',
      '  --gt-transition-fast: 0.2s ease;',
      '  --gt-e: linear-gradient(red, blue);',
      '  --gt-f: red;',
      '  --gt-ring: 0 0 0 2px var(--gt-space-md);',
      '  --gt-shadow-x: 0 0 2px var(--gt-f);',
    ]);
    expect(result.kept).toEqual([
      { name: 'gt-a', reason: 'calc(), which tokens.json cannot hold' },
      { name: 'gt-b', reason: 'color-mix(), which tokens.json cannot hold' },
      { name: 'gt-c', reason: 'alias of a token that is not a colour' },
      { name: 'gt-d', reason: 'alias of an unknown token' },
      { name: 'gt-transition-fast', reason: 'a transition or a duration' },
      { name: 'gt-e', reason: 'a gradient' },
      { name: 'gt-f', reason: 'a named colour or a keyword' },
      { name: 'gt-ring', reason: 'var() inside a longer value' },
      { name: 'gt-shadow-x', reason: 'var() inside a longer value' },
    ]);
    expect([...result.carried]).toEqual(['gt-space-md']);
  });

  it('keeps a token past the 60 a family may hold', () => {
    const lines = Array.from({ length: 61 }, (_, i) => `  --gt-size-${i}: ${i}px;`);
    const result = build(lines);
    expect(tokensOf(result, 'size')).toHaveLength(60);
    expect(result.kept).toEqual([{ name: 'gt-size-60', reason: 'the size family already holds 60 tokens' }]);
  });

  it('refuses a token declared twice, naming both files', () => {
    expect(() =>
      buildTokens(
        [
          { path: 'colors.css', css: ':root { --gt-a: #fff; }' },
          { path: 'spacing.css', css: ':root { --gt-a: 1px; }' },
        ],
        meta,
      ),
    ).toThrow('--gt-a is declared in both colors.css and spacing.css');
  });

  it('keeps a name the format does not allow', () => {
    const result = build([`  --gt-${'x'.repeat(70)}: 1px;`]);
    expect(result.kept[0].reason).toBe('a name longer than 64 characters or with characters the format does not allow');
  });

  it('carries the fixed parts and meta', () => {
    const result = build(['  --gt-space-sm: 8px;']);
    expect(result.tokens.name).toBe('GrepThink Design System');
    expect(result.tokens.version).toBe(1);
    expect(result.tokens.meta).toBe(meta);
  });

  it('reads the real token stylesheets', () => {
    const files = readdirSync(tokensDir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => ({ path: file, css: readFileSync(join(tokensDir, file), 'utf8') }));
    const { tokens, carried, kept } = buildTokens(files, meta);
    const declared = new Set(files.flatMap(({ css }) => parseTokenCss(css).map((t) => t.name)));
    expect(tokens.color.tokens.length).toBeLessThanOrEqual(600);
    expect(new Set([...carried, ...kept.map((k) => k.name)])).toEqual(declared);
    expect(carried.size + kept.length).toBe(declared.size);
    const families = Object.keys(tokens).filter((key) => !['name', 'version', 'meta'].includes(key));
    expect(families.length).toBeLessThanOrEqual(12);
    const emitted = families.filter((f) => f !== 'type').flatMap((f) => tokens[f].tokens.map((t) => t.name));
    expect(new Set(emitted).size).toBe(emitted.length);
    for (const name of emitted) expect(name).toMatch(TOKEN_NAME);
    for (const family of families.filter((f) => f !== 'color' && f !== 'type')) {
      expect(tokens[family].tokens.length).toBeLessThanOrEqual(60);
    }
    expect(tokens.type.families.sans).toContain('Poppins');
  });
});

describe('tokensCss', () => {
  const tokens = {
    name: 'Acme',
    version: 1,
    color: {
      themes: [{ id: 'light', name: 'Light' }],
      tokens: [
        { name: 'gt-a', value: '#ffffff', usage: 'Cards.' },
        { name: 'gt-b', value: '{gt-a}', usage: '' },
        { name: 'gt-c', value: { light: '#000000', dark: '#111111' }, usage: '' },
      ],
    },
    type: {
      fonts: [{ family: 'Acme Sans', file: 'Acme Sans.woff2', weight: '400' }],
      families: { sans: "'Acme Sans', sans-serif" },
      groups: [{ name: 'Text', family: 'sans', styles: [{ name: 'body', fontSize: '14px', lineHeight: 1.5, fontWeight: 400 }, { name: '2xl', fontSize: '24px' }] }],
    },
    spacing: { tokens: [{ name: 'gt-space-1.5', value: '6px', usage: '' }] },
    shadow: { tokens: [{ name: 'gt-shadow-card', value: '0 0 4px rgba(0,0,0,.08)', usage: '' }] },
    zIndex: { tokens: [{ name: 'gt-z-modal', value: '1000', usage: '' }] },
    meta: { source: 'code' },
  };

  it("lays tokens.json out as the format compiles it, under the page's generated line", () => {
    expect(tokensCss(tokens).split('\n')).toEqual([
      '/* Acme — generated from tokens.json */',
      ':root, [data-theme="light"] {',
      '  --gt-a: #ffffff;',
      '  --gt-b: var(--gt-a);',
      '  --gt-c: #000000;',
      '  --gt-shadow-card: 0 0 4px rgba(0,0,0,.08);',
      '}',
      ':root {',
      '  --gt-space-1\\.5: 6px;',
      '  --gt-z-modal: 1000;',
      "  --font-sans: 'Acme Sans', sans-serif;",
      '}',
      '.body {',
      '  font-family: var(--font-sans);',
      '  font-size: 14px;',
      '  line-height: 1.5;',
      '  font-weight: 400;',
      '  letter-spacing: 0;',
      '}',
      '.\\32 xl {',
      '  font-family: var(--font-sans);',
      '  font-size: 24px;',
      '  line-height: 1.4;',
      '  font-weight: 400;',
      '  letter-spacing: 0;',
      '}',
      '@font-face {',
      '  font-family: "Acme Sans";',
      '  src: url("fonts/Acme%20Sans.woff2") format("woff2");',
      '  font-weight: 400;',
      '  font-style: normal;',
      '  font-display: swap;',
      '}',
      '',
    ]);
  });

  it('declares a block per further theme, borrows a later value for the first, and makes a bare length px', () => {
    const themed = {
      name: 'Acme',
      color: {
        themes: [{ id: 'light', name: 'Light' }, { id: 'dark', name: 'Dark' }],
        tokens: [
          { name: 'a', value: { light: '#ffffff', dark: '#000000' } },
          { name: 'b', value: '{a}' },
          { name: 'c', value: { dark: '#111111' } },
          { name: 'd', value: '#222222' },
        ],
      },
      type: { fonts: [], families: {}, groups: [{ name: 'Text', styles: [{ name: 'body', fontSize: 14 }] }] },
      spacing: { tokens: [{ name: 'space-1', value: 4 }] },
      zIndex: { tokens: [{ name: 'z-top', value: 10 }] },
    };
    expect(tokensCss(themed).split('\n')).toEqual([
      '/* Acme \u2014 generated from tokens.json */',
      ':root, [data-theme="light"] {',
      '  --a: #ffffff;',
      '  --b: var(--a);',
      '  --c: #111111;',
      '  --d: #222222;',
      '}',
      '[data-theme="dark"] {',
      '  --a: #000000;',
      '  --b: var(--a);',
      '  --c: #111111;',
      '}',
      ':root {',
      '  --space-1: 4px;',
      '  --z-top: 10;',
      '}',
      '.body {',
      '  font-size: 14px;',
      '  line-height: 1.4;',
      '  font-weight: 400;',
      '  letter-spacing: 0;',
      '}',
      '',
    ]);
  });

  it('declares every token of the real build, the colours before the rest', () => {
    const files = readdirSync(tokensDir)
      .filter((file) => file.endsWith('.css'))
      .map((file) => ({ path: file, css: readFileSync(join(tokensDir, file), 'utf8') }));
    const built = buildTokens(files, meta).tokens;
    const css = tokensCss(built);
    expect(css.startsWith('/* GrepThink Design System — generated from tokens.json */\n:root, [data-theme="light"] {\n')).toBe(true);
    for (const [family, { tokens: list }] of Object.entries(built).filter(([key, value]) => key !== 'type' && Array.isArray(value?.tokens))) {
      for (const { name } of list) expect({ family, declared: css.includes(`  --${name}: `) }).toEqual({ family, declared: true });
    }
    expect(css).toContain("  --font-sans: 'Poppins'");
  });
});
