/**
 * The design-system stylesheet (`components/bundle.css`), in this order:
 *
 * 1. The token stylesheets' `:root` blocks, less the custom properties tokens.json carries (the
 *    page declares those from tokens.json), so a token the format cannot hold is still declared.
 * 2. A base layer scoped to the kit's own elements, standing in for what the app's index.css gives
 *    every element: the border-box sizing on kit elements and everything inside them, and the root
 *    font, line height and text colour on the outermost kit element (only there, since the three
 *    inherit: set on every kit element, they would override a colour or font a kit element
 *    inherits from the one around it). Every selector is inside `:where()`, so the layer has no
 *    specificity and no bare element selector: it cannot restyle a prototype's own markup.
 * 3. The app's shared keyframes (styles/keyframes.css).
 * 4. The kit's utilities that live in index.css (`.gt-visually-hidden`): rules that style kit
 *    classes only.
 * 5. The kit's compiled CSS.
 *
 * The scope of the base layer comes from the compiled kit CSS: the first class of each rule,
 * as a `gt-` prefix test, and each other block by name (DatePickerField's `dpf`).
 *
 * CSS is read with a small brace-aware scanner (comments and strings skipped), and with
 * ownership.mjs's selector helpers; no CSS parser dependency.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { firstCompoundClasses, selectorsOf } from '../ownership.mjs';

export const BUNDLE_CSS_CAP = 2 * 1024 * 1024;

const INDEX_CSS = fileURLToPath(new URL('../../src/index.css', import.meta.url));

// The index just past the string or comment that starts at `i`, or `i` when none does.
function skipStringOrComment(css, i) {
  const c = css[i];
  if (c === '"' || c === "'") {
    let j = i + 1;
    while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1;
    return Math.min(j + 1, css.length);
  }
  if (c === '/' && css[i + 1] === '*') {
    const close = css.indexOf('*/', i + 2);
    return close === -1 ? css.length : close + 2;
  }
  return i;
}

// The index of the `}` closing the block that opens at `open`.
function closingBrace(css, open) {
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    const skipped = skipStringOrComment(css, i);
    if (skipped !== i) {
      i = skipped - 1;
    } else if (css[i] === '{') {
      depth++;
    } else if (css[i] === '}' && --depth === 0) {
      return i;
    }
  }
  return css.length;
}

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, ' ');

/**
 * The top-level rules and at-rules of a stylesheet, with their offsets: `prelude` is the text
 * before the block (comments removed, trimmed), `open` and `close` the block's braces.
 * @param {string} css
 * @returns {{ start: number; end: number; prelude: string; open: number; close: number }[]}
 */
export function topLevelBlocks(css) {
  const blocks = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;
    const afterComment = css[i] === '/' ? skipStringOrComment(css, i) : i;
    if (afterComment !== i) {
      i = afterComment;
      continue;
    }
    const start = i;
    let depth = 0;
    while (i < css.length) {
      const skipped = skipStringOrComment(css, i);
      if (skipped !== i) {
        i = skipped;
        continue;
      }
      const c = css[i];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth <= 0 && (c === '{' || c === ';' || c === '}')) break;
      i++;
    }
    if (i >= css.length) break;
    if (css[i] !== '{') {
      i++;
      continue;
    }
    const close = closingBrace(css, i);
    blocks.push({ start, end: close + 1, prelude: withoutComments(css.slice(start, i)).trim(), open: i, close });
    i = close + 1;
  }
  return blocks;
}

/**
 * The declarations of a block's body: `start`/`end` (offsets in `body`, `end` past the `;`) and
 * the property name.
 * @param {string} body
 * @returns {{ start: number; end: number; property: string; value: string }[]}
 */
export function declarationsOf(body) {
  const declarations = [];
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++;
    const afterComment = skipStringOrComment(body, i);
    if (body[i] === '/' && afterComment !== i) {
      i = afterComment;
      continue;
    }
    if (i >= body.length) break;
    const start = i;
    let depth = 0;
    while (i < body.length) {
      const skipped = skipStringOrComment(body, i);
      if (skipped !== i) {
        i = skipped;
        continue;
      }
      const c = body[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === ';' && depth <= 0) break;
      i++;
    }
    const end = Math.min(i + 1, body.length);
    const text = body.slice(start, i);
    const colon = text.indexOf(':');
    if (colon !== -1) {
      declarations.push({ start, end, property: text.slice(0, colon).trim(), value: withoutComments(text.slice(colon + 1)).trim() });
    }
    i = end;
  }
  return declarations;
}

// Widens [start, end) over a declaration's whole line: the indentation before it, and the
// comments, spaces and newline after it, when nothing else shares the line.
function lineOf(text, start, end) {
  let from = start;
  while (from > 0 && (text[from - 1] === ' ' || text[from - 1] === '\t')) from--;
  if (from > 0 && text[from - 1] !== '\n' && text[from - 1] !== '{') from = start;
  let to = end;
  for (;;) {
    while (to < text.length && (text[to] === ' ' || text[to] === '\t')) to++;
    const afterComment = text[to] === '/' ? skipStringOrComment(text, to) : to;
    if (afterComment === to) break;
    to = afterComment;
  }
  if (text[to] === '\n') return [from, to + 1];
  return to >= text.length ? [from, to] : [start, end];
}

const isRootRule = (block) => block.prelude === ':root';

/**
 * Removes the declarations of `names` (custom property names without `--`) from the `:root`
 * rules, with their trailing comments; a `:root` rule left with no declaration goes, with its line.
 * @param {string} css
 * @param {Set<string>} names
 */
export function stripTokenDeclarations(css, names) {
  let out = css;
  for (const block of topLevelBlocks(css).filter(isRootRule).reverse()) {
    const body = out.slice(block.open + 1, block.close);
    const declarations = declarationsOf(body);
    const removed = declarations.filter((d) => d.property.startsWith('--') && names.has(d.property.slice(2)));
    if (removed.length === 0) continue;
    if (removed.length === declarations.length) {
      const end = out[block.end] === '\n' ? block.end + 1 : block.end;
      out = out.slice(0, block.start) + out.slice(end);
      continue;
    }
    let kept = body;
    for (const declaration of [...removed].reverse()) {
      const [from, to] = lineOf(kept, declaration.start, declaration.end);
      kept = kept.slice(0, from) + kept.slice(to);
    }
    out = out.slice(0, block.open + 1) + kept + out.slice(block.close);
  }
  return out;
}

// A class's BEM block: its name up to the first `__` or `--`.
const blockOf = (cls) => cls.split(/__|--/)[0];

/**
 * The scope of the base layer: attribute and class tests that match every element the kit's
 * compiled CSS styles from its first class.
 * @param {string} css
 * @returns {string[]}
 */
export function kitRootSelectors(css) {
  let gt = false;
  const blocks = new Set();
  for (const selector of selectorsOf(css)) {
    const [cls] = firstCompoundClasses(selector);
    if (!cls) continue;
    if (cls.startsWith('gt-')) gt = true;
    else blocks.add(blockOf(cls));
  }
  const scope = gt ? ['[class^="gt-"]', '[class*=" gt-"]'] : [];
  for (const block of [...blocks].sort()) scope.push(`.${block}`, `[class^="${block}"]`, `[class*=" ${block}"]`);
  return scope;
}

/**
 * The root line height and text colour the app sets in index.css, or null if either is missing.
 * @param {string} css
 * @returns {{ lineHeight: string; color: string } | null}
 */
export function indexRootValues(css) {
  const root = topLevelBlocks(css).find(isRootRule);
  if (!root) return null;
  const declarations = declarationsOf(css.slice(root.open + 1, root.close));
  const value = (property) => declarations.find((d) => d.property === property)?.value;
  const lineHeight = value('line-height');
  const color = value('color');
  return lineHeight && color ? { lineHeight, color } : null;
}

function readRootValues() {
  const values = indexRootValues(readFileSync(INDEX_CSS, 'utf8'));
  if (!values) throw new Error("src/index.css's :root sets no line-height or no color");
  return values;
}

/**
 * The base layer for `selectors` (kitRootSelectors).
 * @param {string[]} selectors
 * @param {{ lineHeight: string; color: string }} [rootValues] from src/index.css's :root by default
 */
export function baseLayer(selectors, rootValues = readRootValues()) {
  const kit = `:where(${selectors.join(', ')})`;
  const sizing = [kit, `${kit} *`, `${kit}::before`, `${kit}::after`, `${kit} *::before`, `${kit} *::after`];
  return [
    "/* Base layer: what the app's index.css gives every element, here for kit elements only, with no specificity. */",
    `${sizing.join(',\n')} { box-sizing: border-box; }`,
    `:where(${kit}:not(${kit} *)) { font-family: var(--gt-font-sans); line-height: ${rootValues.lineHeight}; color: ${rootValues.color}; }`,
  ].join('\n');
}

/**
 * The top-level rules of `css` that style kit classes only (each selector starts with a `gt-`
 * class), as they are written.
 * @param {string} css
 */
export function kitRulesOf(css) {
  const rules = topLevelBlocks(css).filter((block) => {
    if (block.prelude.startsWith('@')) return false;
    const selectors = selectorsOf(`${block.prelude}{}`);
    return selectors.length > 0 && selectors.every((selector) => firstCompoundClasses(selector)[0]?.startsWith('gt-'));
  });
  return rules.map((rule) => `${css.slice(rule.start, rule.end)}\n`).join('');
}

/**
 * @param {{
 *   rawCss: string;
 *   keyframesCss: string;
 *   tokenCss: string;
 *   tokenNames: Set<string>;
 *   utilityCss?: string;
 *   rootValues?: { lineHeight: string; color: string };
 * }} parts
 * @returns {string} the publishable bundle.css
 */
export function buildCss({ rawCss, keyframesCss, tokenCss, tokenNames, utilityCss = '', rootValues = readRootValues() }) {
  const css = [
    '/* GrepThink design system: the shared kit\'s styles, built from frontend/src by `npm run design:build`. */',
    stripTokenDeclarations(tokenCss, tokenNames).trim(),
    baseLayer(kitRootSelectors(rawCss), rootValues),
    keyframesCss.trim(),
    utilityCss.trim(),
    rawCss.trim(),
  ]
    .filter(Boolean)
    .join('\n\n');
  const result = `${css}\n`;
  if (Buffer.byteLength(result) > BUNDLE_CSS_CAP) throw new Error('bundle.css is over 2 MB');
  if (result.includes('</style')) throw new Error('bundle.css contains </style');
  return result;
}
