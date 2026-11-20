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
