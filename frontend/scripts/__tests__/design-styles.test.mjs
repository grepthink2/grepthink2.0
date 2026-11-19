// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BUNDLE_CSS_CAP,
  baseLayer,
  buildCss,
  indexRootValues,
  kitRootSelectors,
  kitRulesOf,
  stripTokenDeclarations,
} from '../design-system/styles.mjs';

describe('stripTokenDeclarations', () => {
  const tokens = [
    '/* Header */',
    ':root {',
    '  /* Group */',
    '  --gt-a: 1px;  /* the a */',
    '  --gt-b: #fff;',
    "  --gt-c: 'x;y'; /* the c */",
    '}',
    '',
  ].join('\n');

  it('removes the named declarations of :root, keeping the others, their comments and the rest', () => {
    const out = stripTokenDeclarations(tokens, new Set(['gt-a', 'gt-b']));
    expect(out).toBe(['/* Header */', ':root {', '  /* Group */', "  --gt-c: 'x;y'; /* the c */", '}', ''].join('\n'));
  });

  it('leaves custom properties outside :root alone', () => {
    const css = '.gt-x { --gt-a: 1; }\n:root { --gt-a: 2; }\n';
    expect(stripTokenDeclarations(css, new Set(['gt-a']))).toBe('.gt-x { --gt-a: 1; }\n');
  });

  it('removes a :root rule it empties', () => {
    expect(stripTokenDeclarations(tokens, new Set(['gt-a', 'gt-b', 'gt-c']))).toBe('/* Header */\n');
  });
});

describe('kitRootSelectors', () => {
  it('reduces the first classes of the kit rules to scope tests', () => {
    const css = '.gt-button{}.gt-button--x{}@media (min-width:1px){.gt-card .x{}}.dpf{}.dpf__cal{}@keyframes k{from{}}';
    expect(kitRootSelectors(css)).toEqual(['[class^="gt-"]', '[class*=" gt-"]', '.dpf', '[class^="dpf"]', '[class*=" dpf"]']);
  });

  it('needs no gt- tests when no rule starts with a gt- class', () => {
    expect(kitRootSelectors('.dpf{}')).toEqual(['.dpf', '[class^="dpf"]', '[class*=" dpf"]']);
  });
});

describe('baseLayer', () => {
  const layer = baseLayer(['[class^="gt-"]', '.dpf'], { lineHeight: '1.5', color: 'var(--gt-text-primary)' });

  it('scopes every rule with :where, so it has no specificity and no bare element selector', () => {
    expect(layer).toContain(':where(');
    for (const line of layer.split('\n')) expect(line).not.toMatch(/^(a|button|\*)\s*\{/);
  });

  it('sizes kit elements, what they hold, and their pseudo-elements by the border box', () => {
    expect(layer).toContain(':where([class^="gt-"], .dpf) *::before');
    expect(layer).toMatch(/\{ box-sizing: border-box; \}/);
  });

  it("gives the outermost kit element the app's font, line height and text colour", () => {
    expect(layer).toContain(':where(:where([class^="gt-"], .dpf):not(:where([class^="gt-"], .dpf) *))');
    expect(layer).toContain('font-family: var(--gt-font-sans); line-height: 1.5; color: var(--gt-text-primary);');
  });

  it("reads the values from index.css's :root", () => {
    expect(indexRootValues(':root {\n  line-height: 1.4;\n  color: red;\n}\na { color: blue; }')).toEqual({ lineHeight: '1.4', color: 'red' });
    expect(indexRootValues(':root { color: red; }')).toBeNull();
  });
});

describe('kitRulesOf', () => {
  it("keeps the rules that style kit classes only, as they are written", () => {
    const css = '*, *::before { margin: 0; }\n/* hidden */\n.gt-visually-hidden { position: absolute !important; }\n:where(a):focus-visible { outline: none; }\n.gt-a, .x { color: red; }\n';
    expect(kitRulesOf(css)).toBe('.gt-visually-hidden { position: absolute !important; }\n');
  });
});

describe('buildCss', () => {
  const parts = {
    rawCss: '.gt-button{color:red}',
    keyframesCss: '@keyframes gt-spin{to{transform:rotate(360deg)}}',
    tokenCss: ':root {\n  --gt-font-sans: Poppins, sans-serif;\n  --gt-gray-0: #fff;\n}\n',
    tokenNames: new Set(['gt-gray-0']),
    utilityCss: '.gt-visually-hidden { position: absolute; }\n',
    rootValues: { lineHeight: '1.5', color: 'var(--gt-text-primary)' },
  };

  it('keeps what tokens.json does not carry, then the base layer, keyframes, kit utilities and the kit', () => {
    const css = buildCss(parts);
    expect(css.split('\n')[0]).toMatch(/^\/\* .* \*\/$/);
    expect(css).toContain('--gt-font-sans: Poppins, sans-serif;');
    expect(css).not.toContain('--gt-gray-0');
    const order = [':root {', 'box-sizing: border-box', '@keyframes gt-spin', '.gt-visually-hidden', '.gt-button{color:red}'];
    const at = order.map((text) => css.indexOf(text));
    expect(at.every((i) => i >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  it('refuses a stylesheet over 2 MB, or one that would end an inline style element', () => {
    expect(() => buildCss({ ...parts, rawCss: `.gt-x{content:"${'x'.repeat(BUNDLE_CSS_CAP)}"}` })).toThrow('bundle.css is over 2 MB');
    expect(() => buildCss({ ...parts, rawCss: '.gt-x{content:"</style>"}' })).toThrow('bundle.css contains </style');
  });
});
