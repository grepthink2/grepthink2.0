/**
 * tokens.json, from the token stylesheets (src/styles/tokens/*.css), in the shape the Design
 * System format reads. Each `:root` custom property goes to one family, by its value first, then
 * by its name:
 *
 *   color          a hex colour (lowercased), rgb()/rgba()/hsl()/hsla()/oklch() with plain
 *                  numbers, or var() of a colour token, written as "{name}"
 *   spacing        gt-space-*    a length
 *   radius         gt-radius-*   a length
 *   shadow         gt-shadow-*   with no var()
 *   fontSize       gt-text-*     a length
 *   fontWeight     gt-weight-*   a number
 *   lineHeight     gt-leading-*  a number or length
 *   letterSpacing  gt-tracking-* a length
 *   zIndex         gt-z-*        a number
 *   opacity        gt-opacity-*  a number
 *   size           any other length (gt-container, gt-sidebar-w)
 *   type.families  gt-font-sans and gt-font-mono, as `sans` and `mono`
 *
 * Anything else stays declared in bundle.css and is reported with its reason (`kept`): calc(),
 * color-mix(), var() of a token that is not a colour or inside a longer value, a transition, a
 * gradient, a named colour, or a family that already holds 60 tokens. The two font families are
 * both: tokens.json names them, and bundle.css keeps declaring them, since the kit reads
 * `--gt-font-sans` and the page declares `--font-sans`.
 *
 * `usage` is the comment on the declaration's line, without the `@kind` markers an earlier
 * design import left there.
 */

import { declarationsOf, topLevelBlocks } from './styles.mjs';

/** A token name the format accepts. */
export const TOKEN_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

const FAMILY_CAP = 60;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)$/;
const LENGTH = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%)?$/;
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgba?|hsla?|oklch)\(\s*[-\d.%\s,/]+\)$/i;
const ALIAS = /^var\(\s*--([\w-]+)\s*\)$/;

const BY_NAME = [
  ['spacing', 'gt-space-', LENGTH],
  ['radius', 'gt-radius-', LENGTH],
  ['fontSize', 'gt-text-', LENGTH],
  ['fontWeight', 'gt-weight-', NUMBER],
  ['lineHeight', 'gt-leading-', LENGTH],
  ['letterSpacing', 'gt-tracking-', LENGTH],
  ['zIndex', 'gt-z-', NUMBER],
  ['opacity', 'gt-opacity-', NUMBER],
];

const FONT_FAMILIES = { 'gt-font-sans': 'sans', 'gt-font-mono': 'mono' };
const HEADING_STYLES = new Set(['h1', 'h2', 'h3', 'display']);

/**
 * @param {string} css
 * @returns {{ name: string; value: string; comment: string }[]}
 */
export function parseTokenCss(css) {
  const tokens = [];
  for (const block of topLevelBlocks(css).filter((b) => b.prelude === ':root')) {
    const body = css.slice(block.open + 1, block.close);
    for (const { property, value, end } of declarationsOf(body)) {
      if (!property.startsWith('--')) continue;
      const lineEnd = body.indexOf('\n', end);
      const rest = body.slice(end, lineEnd === -1 ? body.length : lineEnd);
      const comments = [...rest.matchAll(/\/\*([\s\S]*?)\*\//g)]
        .map((m) => m[1].trim())
        .filter((text) => text && !text.startsWith('@kind'));
      tokens.push({ name: property.slice(2), value, comment: comments.join(' ') });
    }
  }
  return tokens;
}

function keptReason(name, value) {
  if (/\bcalc\(/i.test(value)) return 'calc(), which tokens.json cannot hold';
  if (/\bcolor-mix\(/i.test(value)) return 'color-mix(), which tokens.json cannot hold';
  if (/gradient\(/i.test(value)) return 'a gradient';
  if (/\bvar\(/i.test(value)) return 'var() inside a longer value';
  if (/\d(?:m?s)\b/.test(value)) return 'a transition or a duration';
  if (/^[a-z-]+$/i.test(value)) return 'a named colour or a keyword';
  if (name.includes('shadow')) return 'a shadow outside the gt-shadow- names';
  return 'not a colour, length or number tokens.json holds';
}

/**
 * @param {{ path: string; css: string }[]} files
 * @param {object} meta
 * @returns {{ tokens: object; carried: Set<string>; kept: { name: string; reason: string }[] }}
 */
export function buildTokens(files, meta) {
  /** @type {Map<string, { value: string; comment: string; path: string }>} */
  const declared = new Map();
  for (const { path, css } of files) {
    for (const { name, value, comment } of parseTokenCss(css)) {
      const seen = declared.get(name);
      if (seen) throw new Error(`--${name} is declared in both ${seen.path} and ${path}`);
      declared.set(name, { value, comment, path });
    }
  }

  // Whether a token is a colour: a colour literal, or an alias of a colour token.
  const colourCache = new Map();
  const isColour = (name, seen = new Set()) => {
    if (colourCache.has(name)) return colourCache.get(name);
    const token = declared.get(name);
    let result = false;
    if (token && !seen.has(name)) {
      const alias = ALIAS.exec(token.value);
      result = alias ? isColour(alias[1], seen.add(name)) : HEX.test(token.value) || COLOR_FUNCTION.test(token.value);
    }
    colourCache.set(name, result);
    return result;
  };

  const families = { color: [], spacing: [], radius: [], shadow: [], fontSize: [], fontWeight: [], lineHeight: [], letterSpacing: [], zIndex: [], opacity: [], size: [] };
  const typeFamilies = {};
  const carried = new Set();
  const kept = [];
  const keep = (name, reason) => kept.push({ name, reason });

  for (const [name, { value, comment }] of declared) {
    const usage = comment;
    if (!TOKEN_NAME.test(name)) {
      keep(name, 'a name longer than 64 characters or with characters the format does not allow');
      continue;
    }
    if (FONT_FAMILIES[name]) {
      typeFamilies[FONT_FAMILIES[name]] = value;
      keep(name, `type.families.${FONT_FAMILIES[name]} in tokens.json, and still declared: the kit reads --${name}`);
      continue;
    }
    let family;
    let written = value;
    const alias = ALIAS.exec(value);
    if (alias) {
      if (!declared.has(alias[1])) {
        keep(name, 'alias of an unknown token');
        continue;
      }
      if (!isColour(alias[1])) {
        keep(name, 'alias of a token that is not a colour');
        continue;
      }
      family = 'color';
      written = `{${alias[1]}}`;
    } else if (HEX.test(value)) {
      family = 'color';
      written = value.toLowerCase();
    } else if (COLOR_FUNCTION.test(value)) {
      family = 'color';
    } else if (name.startsWith('gt-shadow-') && !/\bvar\(/i.test(value)) {
      family = 'shadow';
    } else {
      family = BY_NAME.find(([, prefix, grammar]) => name.startsWith(prefix) && grammar.test(value))?.[0];
      if (!family && LENGTH.test(value) && !BY_NAME.some(([, prefix]) => name.startsWith(prefix))) family = 'size';
    }
    if (!family) {
      keep(name, keptReason(name, value));
      continue;
    }
    if (family !== 'color' && families[family].length >= FAMILY_CAP) {
      keep(name, `the ${family} family already holds ${FAMILY_CAP} tokens`);
      continue;
    }
    families[family].push({ name, value: written, usage });
    carried.add(name);
  }

  const leading = (key) => {
    const value = declared.get(key)?.value;
    return value && NUMBER.test(value) ? Number(value) : value;
  };
  const styles = families.fontSize.map(({ name, value }) => {
    const style = name.slice('gt-text-'.length);
    const heading = HEADING_STYLES.has(style);
    return {
      name: style,
      fontSize: value,
      lineHeight: leading(heading ? 'gt-leading-tight' : 'gt-leading-normal'),
      fontWeight: heading ? 600 : 400,
    };
  });

  const tokens = {
    name: 'GrepThink Design System',
    version: 1,
    color: { themes: [{ id: 'light', name: 'Light' }], tokens: families.color },
    type: { fonts: [], families: typeFamilies, groups: styles.length ? [{ name: 'Text', family: 'sans', styles }] : [] },
  };
  for (const [family, list] of Object.entries(families)) {
    if (family !== 'color' && list.length) tokens[family] = { tokens: list };
  }
  tokens.meta = meta;
  return { tokens, carried, kept };
}

/**
 * Line 1 of tokens.css. The page takes a file whose first comment ends with "generated from
 * tokens.json" for one compiled from tokens.json.
 * @param {string} title the system's name
 */
export const tokensCssHead = (title) => `/* ${title} — generated from tokens.json */`;

// A token name as a CSS identifier: a dot escaped, a leading digit as its code point.
function ident(name) {
  const escaped = name.replace(/\./g, '\\.');
  return /^[0-9]/.test(escaped) ? `\\3${escaped[0]} ${escaped.slice(1)}` : escaped;
}

const FONT_FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

/**
 * tokens.css, compiled from tokens.json in the format's layout: the colours and shadows under
 * `:root` and the first theme's `[data-theme]`, a `[data-theme]` block per further theme (its own
 * values, and every alias declared again so that it resolves in that theme), every other family and
 * each type family (`--font-<key>`) under `:root`, a class per type style, and an `@font-face` per
 * font file. An alias `{name}` is `var(--name)`; a value only a later theme has stands in for the
 * first; a bare number is px in a length (spacing, radius, a style's size and tracking), and stays a
 * number anywhere else. The page generates this file only when someone saves an
 * edit there, and the page of a system synced from code saves nothing, so the build writes it.
 * @param {object} tokens tokens.json
 * @returns {string}
 */
export function tokensCss(tokens) {
  const out = [tokensCssHead(tokens.name ?? 'Design system')];
  const themes = (tokens.color?.themes ?? []).map((theme) => theme.id);
  const perTheme = (token) => token.value !== null && typeof token.value === 'object';
  // A token's value in a theme; in the first, a value only a later theme has.
  const raw = (token, theme) => {
    if (!perTheme(token)) return theme === themes[0] || theme === undefined ? token.value : undefined;
    if (theme !== themes[0] && theme !== undefined) return token.value[theme];
    return token.value[themes[0]] ?? themes.map((id) => token.value[id]).find((value) => value !== undefined);
  };
  const css = (value) => {
    const alias = /^\{(.+)\}$/.exec(String(value));
    return alias ? `var(--${ident(alias[1])})` : String(value);
  };
  const isAlias = (value) => /^\{.+\}$/.test(String(value));
  const length = (value) => (typeof value === 'number' && value !== 0 ? `${value}px` : String(value));
  const themed = [...(tokens.color?.tokens ?? []), ...(tokens.shadow?.tokens ?? [])].filter((token) => raw(token, themes[0]) !== undefined);
  if (themed.length) {
    out.push(themes.length ? `:root, [data-theme="${themes[0]}"] {` : ':root {', ...themed.map((token) => `  --${ident(token.name)}: ${css(raw(token, themes[0]))};`), '}');
  }
  for (const theme of themes.slice(1)) {
    const lines = themed.flatMap((token) => {
      const own = raw(token, theme);
      const value = own ?? (isAlias(raw(token, themes[0])) ? raw(token, themes[0]) : undefined);
      return value === undefined ? [] : [`  --${ident(token.name)}: ${css(value)};`];
    });
    if (lines.length) out.push(`[data-theme="${theme}"] {`, ...lines, '}');
  }
  const root = Object.entries(tokens)
    .filter(([key, family]) => !['color', 'shadow', 'type'].includes(key) && Array.isArray(family?.tokens))
    .flatMap(([key, family]) =>
      family.tokens.map((token) => `  --${ident(token.name)}: ${['spacing', 'radius'].includes(key) ? length(token.value) : String(token.value)};`),
    );
  for (const [key, stack] of Object.entries(tokens.type?.families ?? {})) root.push(`  --font-${ident(key)}: ${stack};`);
  if (root.length) out.push(':root {', ...root, '}');
  for (const group of tokens.type?.groups ?? []) {
    for (const style of group.styles ?? []) {
      const family = style.family ?? group.family;
      out.push(
        `.${ident(style.name)} {`,
        ...(family ? [`  font-family: var(--font-${ident(family)});`] : []),
        `  font-size: ${length(style.fontSize)};`,
        `  line-height: ${style.lineHeight ?? 1.4};`,
        `  font-weight: ${style.fontWeight ?? 400};`,
        `  letter-spacing: ${length(style.letterSpacing ?? 0)};`,
        '}',
      );
    }
  }
  for (const font of tokens.type?.fonts ?? []) {
    const file = font.file.includes('/') ? font.file : `fonts/${font.file}`;
    const format = FONT_FORMATS[file.slice(file.lastIndexOf('.') + 1).toLowerCase()];
    out.push(
      '@font-face {',
      `  font-family: "${font.family}";`,
      `  src: url("${file.split('/').map(encodeURIComponent).join('/')}")${format ? ` format("${format}")` : ''};`,
      `  font-weight: ${font.weight};`,
      `  font-style: ${font.style ?? 'normal'};`,
      '  font-display: swap;',
      '}',
    );
  }
  return `${out.join('\n')}\n`;
}
