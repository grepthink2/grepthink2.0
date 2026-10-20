/**
 * Shared component ownership, the second check of `npm run lint:design` (design-adherence.mjs
 * walks the tree, runs these functions and reports).
 *
 * A shared component in src/components/<Name>/ owns the classes its stylesheet's selectors begin
 * with: the classes in the first compound selector of every rule, read from the CSS that Sass
 * compiles, so nesting is resolved. Outside src/components/:
 *   - Styles. A rule fails when its selector's first compound begins with an owned class
 *     (`.gt-button`, `.gt-button--sm:hover`, `.gt-button.feature`, `button.gt-button`): it copies
 *     the component, or overrides it for one screen. A rule that starts from the feature's own
 *     class (`.feature .gt-button`, `.feature.gt-button`) adjusts the component in context and
 *     passes; its extra specificity makes the result independent of the order the bundle loads
 *     stylesheets in. Classes inside `:not(...)`, `:is(...)` and other parenthesised arguments
 *     are not read.
 *   - Markup. A string or template literal that holds an owned class as a whole
 *     whitespace-separated token (`className="gt-button gt-button--sm"`) renders the component by
 *     hand. A token built around an interpolation (`gt-button--${size}`) is not a class name, and
 *     comments are not read.
 *
 * Deliberate exceptions go in OWNERSHIP_ALLOWLIST, each with its reason.
 */

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as sass from 'sass';

/**
 * @typedef {{ file: string; line?: number; selector?: string; cls: string; owner: string }} Violation
 * @typedef {{ file: string; cls: string; reason: string }} AllowlistEntry
 */

/**
 * Classes a file outside src/components/ may use anyway. `file` is relative to frontend/
 * (`src/features/x/x.scss`); a stylesheet's entry names the file that is compiled, which for a
 * partial is the stylesheet that @uses it. Each entry is a reason, not a rubber stamp.
 * @type {AllowlistEntry[]}
 */
export const OWNERSHIP_ALLOWLIST = [];

// The path aliases vite.config.ts defines, as stylesheets write them, and their folders under src/.
const ALIASES = [
  ['@styles/', 'styles/'],
  ['@features/', 'features/'],
  ['@components/', 'components/'],
  ['@assets/', 'assets/'],
  ['@/', ''],
];

/**
 * Compiles a stylesheet to expanded CSS as the Vite build does, resolving the path aliases
 * against `srcDir`. Deprecation warnings are left to the build to report.
 * @param {string} path
 * @param {string} srcDir
 * @returns {string}
 */
export function compileScss(path, srcDir) {
  const srcUrl = pathToFileURL(join(srcDir, '/'));
  const aliasImporter = {
    findFileUrl(url) {
      const alias = ALIASES.find(([prefix]) => url.startsWith(prefix));
      return alias ? new URL(alias[1] + url.slice(alias[0].length), srcUrl) : null;
    },
  };
  return sass.compile(path, {
    style: 'expanded',
    importers: [aliasImporter],
    logger: sass.Logger.silent,
  }).css;
}

// The index just past the CSS string that opens at `i`.
function endOfString(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length && text[j] !== quote) j += text[j] === '\\' ? 2 : 1;
  return Math.min(j + 1, text.length);
}

function withoutCssComments(css) {
  const parts = [];
  let from = 0;
  let i = 0;
  while (i < css.length) {
    const c = css[i];
    if (c === '"' || c === "'") {
      i = endOfString(css, i);
    } else if (c === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2);
      parts.push(css.slice(from, i), ' ');
      i = from = close === -1 ? css.length : close + 2;
    } else {
      i++;
    }
  }
  parts.push(css.slice(from));
  return parts.join('');
}

// The index of the `}` that closes the block opening at `open`, or `end` when it never closes.
function closingBrace(css, open, end) {
  let depth = 0;
  for (let i = open; i < end; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      i = endOfString(css, i) - 1;
    } else if (c === '{') {
      depth++;
    } else if (c === '}' && --depth === 0) {
      return i;
    }
  }
  return end;
}

// The selectors of a selector list, split on its top-level commas, whitespace collapsed.
function splitSelectorList(prelude) {
  const selectors = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i++) {
    const c = prelude[i];
    if (c === '\\') {
      i++;
    } else if (c === '"' || c === "'") {
      i = endOfString(prelude, i) - 1;
    } else if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    } else if (c === ',' && depth === 0) {
      selectors.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  selectors.push(prelude.slice(from));
  return selectors.map((s) => s.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

// At-rules whose blocks hold style rules. The other blocks (@keyframes, @font-face, @page,
// @property and the like) hold no selectors.
const GROUPING_AT_RULES = new Set([
  'media',
  'supports',
  'container',
  'layer',
  'scope',
  'document',
  'starting-style',
]);

function collectSelectors(css, start, end, out) {
  let i = start;
  while (i < end) {
    // A prelude runs to the first `{` or `;` outside strings, parentheses and brackets.
    let j = i;
    let depth = 0;
    while (j < end) {
      const c = css[j];
      if (c === '"' || c === "'") {
        j = endOfString(css, j);
        continue;
      }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth <= 0 && (c === '{' || c === ';' || c === '}')) break;
      j++;
    }
    if (j >= end) return;
    if (css[j] !== '{') {
      i = j + 1; // a statement such as @charset, @import or @layer a, b;
      continue;
    }
    const prelude = css.slice(i, j).trim();
    const close = closingBrace(css, j, end);
    if (prelude.startsWith('@')) {
      const name = /^@([\w-]+)/.exec(prelude)?.[1].toLowerCase();
      if (GROUPING_AT_RULES.has(name)) collectSelectors(css, j + 1, close, out);
    } else if (prelude) {
      out.push(...splitSelectorList(prelude));
    }
    i = close + 1;
  }
}

/**
 * The selectors of every style rule in compiled CSS, including those inside @media, @supports,
 * @container and @layer. Comments and the steps of @keyframes are not selectors.
 * @param {string} css
 * @returns {string[]}
 */
export function selectorsOf(css) {
  const text = withoutCssComments(css);
  const selectors = [];
  collectSelectors(text, 0, text.length, selectors);
  return selectors;
}

/**
 * The classes in a selector's first compound selector (up to its first combinator), leaving out
 * the classes inside parenthesised pseudo-class arguments and the contents of attribute selectors.
 * @param {string} selector
 * @returns {string[]}
 */
export function firstCompoundClasses(selector) {
  const s = selector.trim();
  let compound = '';
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (depth === 0) compound += s.slice(i, i + 2);
      i++;
    } else if (c === '"' || c === "'") {
      i = endOfString(s, i) - 1;
    } else if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    } else if (depth === 0) {
      if (/\s/.test(c) || c === '>' || c === '+' || c === '~') break;
      compound += c;
    }
  }
  return [...compound.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

/**
 * Maps each class a component stylesheet's rules begin with to its component folder.
 * @param {Map<string, string>} componentCss compiled CSS by component folder
 * @returns {Map<string, string>} class → component folder
 */
export function ownedClasses(componentCss) {
  const owned = new Map();
  for (const [owner, css] of componentCss) {
    for (const selector of selectorsOf(css)) {
      for (const cls of firstCompoundClasses(selector)) {
        if (!owned.has(cls)) owned.set(cls, owner);
      }
    }
  }
  return owned;
}

function isAllowed(file, cls, allowlist) {
  return allowlist.some((entry) => entry.file === file && entry.cls === cls);
}

/**
 * The rules of a stylesheet outside src/components/ whose first compound begins with an owned
 * class: the first class selector of the first compound is owned.
 * @param {string} file
 * @param {string} css compiled CSS
 * @param {Map<string, string>} owned
 * @param {AllowlistEntry[]} [allowlist]
 * @returns {Violation[]}
 */
export function checkStylesheet(file, css, owned, allowlist = OWNERSHIP_ALLOWLIST) {
  const violations = [];
  for (const selector of selectorsOf(css)) {
    const [cls] = firstCompoundClasses(selector);
    const owner = cls === undefined ? undefined : owned.get(cls);
    if (owner && !isAllowed(file, cls, allowlist)) violations.push({ file, selector, cls, owner });
  }
  return violations;
}

// A quote right after a letter or digit is an apostrophe in JSX text ("don't"): code never puts
// a string there.
const WORD_CHAR = /[\p{L}\p{N}_$]/u;

// What a regular expression literal can follow: an operator, an opening bracket, a comma or
// semicolon, or one of these keywords. After anything else a `/` divides.
const BEFORE_REGEX_CHARS = '(,=:[!&|?{;+-%~^>';
const BEFORE_REGEX_WORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

function startsRegex(text, i) {
  let k = i - 1;
  while (k >= 0 && /\s/.test(text[k])) k--;
  if (k < 0 || BEFORE_REGEX_CHARS.includes(text[k])) return true;
  const word = /[\w$]+$/.exec(text.slice(Math.max(0, k - 9), k + 1));
  return word !== null && BEFORE_REGEX_WORDS.has(word[0]);
}

// The index just past the regular expression literal that opens at `i`, or -1 when no closing
// slash ends it on its line.
function endOfRegex(text, i) {
  let inClass = false;
  for (let j = i + 1; j < text.length && text[j] !== '\n'; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return j + 1;
  }
  return -1;
}

/**
 * Splits source text into `code` (same length and layout as the input, comments blanked to
 * spaces), `comments` (the text of every comment) and `literals` (every string and template
 * literal: `start` is the offset of its first character inside the quotes, `text` its content,
 * the same length, with each interpolation's code blanked). An interpolation is scanned as code,
 * so a string inside one is a literal of its own. A quoted string ends at its closing quote or,
 * unclosed, at the end of its line, so an apostrophe the scan misreads costs one line at most.
 * With `script`, for TypeScript, a regular expression literal is code, and its quotes start no
 * string. A quick char-scanner, not a parser.
 * @param {string} text
 * @param {{ script?: boolean }} [options]
 * @returns {{ code: string; comments: string; literals: { start: number; text: string }[] }}
 */
export function splitCodeAndComments(text, { script = false } = {}) {
  const n = text.length;
  const code = [];
  const comments = [];
  const literals = [];
  // Template literals whose interpolation the scan is inside, innermost last.
  const open = [];
  let depth = 0; // brace depth of the code
  let from = 0; // where the code not yet copied to `code` starts
  let i = 0;

  // Reads a template literal's text from `start` to its closing backtick or its next `${`, and
  // returns where the scan goes on.
  const readTemplate = (template, start) => {
    let j = start;
    while (j < n && text[j] !== '`' && !(text[j] === '$' && text[j + 1] === '{')) {
      j += text[j] === '\\' ? 2 : 1;
    }
    j = Math.min(j, n);
    template.parts.push(text.slice(start, j));
    if (j < n && text[j] === '$') {
      template.parts.push('${');
      template.depth = depth;
      template.codeStart = j + 2;
      depth++;
      open.push(template);
      return j + 2;
    }
    literals.push({ start: template.start, text: template.parts.join('') });
    return Math.min(j + 1, n);
  };

  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    // A line comment (`://` is a URL) or a block comment: blanked in `code`.
    if ((c === '/' && c2 === '/' && text[i - 1] !== ':') || (c === '/' && c2 === '*')) {
      let j;
      if (c2 === '/') {
        j = text.indexOf('\n', i);
        if (j === -1) j = n;
      } else {
        j = text.indexOf('*/', i + 2);
        j = j === -1 ? n : j + 2;
      }
      if (i > from) code.push(text.slice(from, i));
      comments.push(` ${text.slice(i, j)}`);
      code.push(text.slice(i, j).replace(/[^\n]/g, ' '));
      i = from = j;
      continue;
    }
    if (script && c === '/' && startsRegex(text, i)) {
      const end = endOfRegex(text, i);
      if (end !== -1) {
        i = end;
        continue;
      }
    }
    if ((c === '"' || c === "'") && !WORD_CHAR.test(text[i - 1] ?? '')) {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      literals.push({ start: i + 1, text: text.slice(i + 1, j) });
      i = j < n && text[j] === c ? j + 1 : j;
      continue;
    }
    if (c === '`') {
      i = readTemplate({ start: i + 1, parts: [] }, i + 1);
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      const template = open.at(-1);
      if (template && template.depth === depth - 1) {
        // The interpolation closes: its code is blanked in the literal, and the text goes on.
        open.pop();
        depth--;
        template.parts.push(text.slice(template.codeStart, i).replace(/[^\n]/g, ' '), '}');
        i = readTemplate(template, i + 1);
        continue;
      }
      depth--;
    }
    i++;
  }
  if (n > from) code.push(text.slice(from, n));
  return { code: code.join(''), comments: comments.join(''), literals };
}

// The 1-based line of the character at `index`.
function lineAt(text, index) {
  let line = 1;
  for (let k = text.indexOf('\n'); k !== -1 && k < index; k = text.indexOf('\n', k + 1)) line++;
  return line;
}

/**
 * The owned classes that source outside src/components/ writes as a whole token in a string or
 * template literal, with their lines.
 * @param {string} file
 * @param {string} source
 * @param {Map<string, string>} owned
 * @param {AllowlistEntry[]} [allowlist]
 * @returns {Violation[]}
 */
export function checkMarkup(file, source, owned, allowlist = OWNERSHIP_ALLOWLIST) {
  const violations = [];
  for (const { start, text } of splitCodeAndComments(source, { script: true }).literals) {
    for (const match of text.matchAll(/\S+/g)) {
      const token = match[0];
      if (token.includes('${')) continue;
      const owner = owned.get(token);
      if (owner && !isAllowed(file, token, allowlist)) {
        violations.push({ file, line: lineAt(source, start + match.index), cls: token, owner });
      }
    }
  }
  return violations;
}
