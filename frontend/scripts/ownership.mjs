/**
 * Shared component ownership, the second check of `npm run lint:design` (design-adherence.mjs
 * walks the tree, runs these functions and reports).
 *
 * A shared component in src/components/<Name>/ owns the classes its stylesheet's selectors begin
 * with: the classes in the first compound selector of every rule, read from the CSS that Sass
 * compiles, so nesting is resolved. Only the classes of the component's own BEM blocks count (the
 * blocks its single-compound rules style), so a rule written from an outer context
 * (`.app-view--previewing .gt-toast-stack`) claims none of that context's classes. Outside
 * src/components/:
 *   - Styles. The first compound selector that has a class decides a rule; one with none
 *     (`body`, `*`, `:root`) is the page around the feature, not the feature. The rule fails when
 *     that compound begins with an owned class (`.gt-button`, `.gt-button--sm:hover`,
 *     `.gt-button.feature`, `button.gt-button`, `body .gt-button`): it copies the component, or
 *     overrides it for one screen or for every screen. A rule that starts from the feature's own
 *     class (`.feature .gt-button`, `.feature.gt-button`) adjusts the component in context and
 *     passes; its extra specificity makes the result independent of the order the bundle loads
 *     stylesheets in. Classes inside `:not(...)` and `:has(...)` are not read; inside a
 *     top-level `:is(...)` or `:where(...)` they count only when the compound has no class of its
 *     own (`:where(.gt-button)` fails).
 *   - Markup. A string or template literal that holds an owned class as a whole
 *     whitespace-separated token (`className="gt-button gt-button--sm"`) renders the component by
 *     hand. A token glued to an interpolation counts by its text before the `${`
 *     (`gt-popover${open ? ' is-open' : ''}` writes gt-popover; `gt-button--${size}` names no
 *     class), and comments are not read.
 *
 * Deliberate exceptions go in OWNERSHIP_ALLOWLIST, each with its reason.
 *
 * Known limit: native CSS nesting inside a plain .css file is not read. Sass passes it through
 * as written, and only the top-level rules of each block are read, so a rule nested there is
 * checked neither as a copy nor as a component's own.
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

// The path aliases vite.config.ts defines and their folders under src/. A stylesheet names one
// bare (`@styles`) or before a path (`@styles/motion`).
const ALIASES = [
  ['@styles', 'styles'],
  ['@features', 'features'],
  ['@components', 'components'],
  ['@assets', 'assets'],
  ['@', ''],
];

/**
 * Compiles a stylesheet to expanded CSS as the Vite build does: the path aliases resolve against
 * `srcDir`, and any other load that is not relative against the node_modules beside it.
 * Deprecation warnings are left to the build to report.
 * @param {string} path
 * @param {string} srcDir
 * @returns {string}
 */
export function compileScss(path, srcDir) {
  const srcUrl = pathToFileURL(join(srcDir, '/'));
  const aliasImporter = {
    findFileUrl(url) {
      for (const [alias, folder] of ALIASES) {
        if (url !== alias && !url.startsWith(`${alias}/`)) continue;
        const target = [folder, url.slice(alias.length + 1)].filter(Boolean).join('/');
        return target ? new URL(target, srcUrl) : null;
      }
      return null;
    },
  };
  return sass.compile(path, {
    style: 'expanded',
    importers: [aliasImporter],
    loadPaths: [join(srcDir, '..', 'node_modules')],
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

// The compound selectors of a selector, split at its combinators (whitespace, `>`, `+`, `~`)
// outside parentheses, brackets and strings.
function compoundsOf(selector) {
  const compounds = [];
  let start = 0;
  let depth = 0;
  for (let i = 0; i <= selector.length; i++) {
    const c = selector[i];
    if (c === '\\') {
      i++;
    } else if (c === '"' || c === "'") {
      i = endOfString(selector, i) - 1;
    } else if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    } else if (i === selector.length || (depth === 0 && (/\s/.test(c) || '>+~'.includes(c)))) {
      if (i > start) compounds.push(selector.slice(start, i));
      start = i + 1;
    }
  }
  return compounds;
}

// The classes of a compound selector outside its parenthesised arguments and attribute selectors.
function classesOf(compound) {
  let bare = '';
  let depth = 0;
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i];
    if (c === '\\') {
      if (depth === 0) bare += compound.slice(i, i + 2);
      i++;
    } else if (c === '"' || c === "'") {
      i = endOfString(compound, i) - 1;
    } else if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    } else if (depth === 0) {
      bare += c;
    }
  }
  return [...bare.matchAll(/\.((?:[\w-]|\\.)+)/g)].map((m) => m[1].replace(/\\(.)/g, '$1'));
}

/**
 * The classes in a selector's first compound selector (up to its first combinator), leaving out
 * the classes inside parenthesised pseudo-class arguments and the contents of attribute selectors.
 * @param {string} selector
 * @returns {string[]}
 */
export function firstCompoundClasses(selector) {
  return classesOf(compoundsOf(selector.trim())[0] ?? '');
}

// A class's BEM block: its name up to the first `__` or `--`.
function blockOf(cls) {
  const end = cls.search(/__|--/);
  return end === -1 ? cls : cls.slice(0, end);
}

/**
 * Maps the classes a component's rules begin with to its component folder, keeping only the
 * classes of the component's own BEM blocks: the blocks of the classes in its single-compound
 * rules. A rule written from an outer context (`.app-view--previewing .gt-toast-stack`) styles
 * the component there and claims none of the context's classes.
 * @param {Map<string, string>} componentCss compiled CSS by component folder
 * @returns {Map<string, string>} class → component folder
 */
export function ownedClasses(componentCss) {
  const owned = new Map();
  for (const [owner, css] of componentCss) {
    const selectors = selectorsOf(css);
    const blocks = new Set();
    for (const selector of selectors) {
      const compounds = compoundsOf(selector);
      if (compounds.length === 1) for (const cls of classesOf(compounds[0])) blocks.add(blockOf(cls));
    }
    for (const selector of selectors) {
      for (const cls of firstCompoundClasses(selector)) {
        if (blocks.has(blockOf(cls)) && !owned.has(cls)) owned.set(cls, owner);
      }
    }
  }
  return owned;
}

function isAllowed(file, cls, allowlist) {
  return allowlist.some((entry) => entry.file === file && entry.cls === cls);
}

// The index of the `)` that closes the parenthesis opening at `open`.
function closingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '"' || c === "'") i = endOfString(text, i) - 1;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i;
  }
  return text.length;
}

// The first class inside a top-level `:is(...)` or `:where(...)` of a compound selector.
function firstClassInIsOrWhere(compound) {
  let depth = 0;
  for (let i = 0; i < compound.length; i++) {
    const c = compound[i];
    if (c === '\\') {
      i++;
    } else if (c === '"' || c === "'") {
      i = endOfString(compound, i) - 1;
    } else if (c === '(' && depth === 0 && /:(?:is|where)$/i.test(compound.slice(0, i))) {
      const close = closingParen(compound, i);
      const [cls] = classesOf(compound.slice(i + 1, close));
      if (cls !== undefined) return cls;
      i = close;
    } else if (c === '(' || c === '[') {
      depth++;
    } else if (c === ')' || c === ']') {
      depth--;
    }
  }
  return undefined;
}

// The class that decides a rule: the first class of the first compound that has one. A compound
// with no class (`body`, `*`, `:root`) is the page, not the feature. Classes inside `:not(...)`
// and `:has(...)` never count; in a compound with no class of its own, the first class inside a
// top-level `:is(...)` or `:where(...)` does.
function decidingClass(selector) {
  for (const compound of compoundsOf(selector.trim())) {
    const cls = classesOf(compound)[0] ?? firstClassInIsOrWhere(compound);
    if (cls !== undefined) return cls;
  }
  return undefined;
}

/**
 * The rules of a stylesheet outside src/components/ that copy or override a shared component:
 * the first class of the first compound that has a class is owned.
 * @param {string} file
 * @param {string} css compiled CSS
 * @param {Map<string, string>} owned
 * @param {AllowlistEntry[]} [allowlist]
 * @returns {Violation[]}
 */
export function checkStylesheet(file, css, owned, allowlist = OWNERSHIP_ALLOWLIST) {
  const violations = [];
  for (const selector of selectorsOf(css)) {
    const cls = decidingClass(selector);
    const owner = cls === undefined ? undefined : owned.get(cls);
    if (owner && !isAllowed(file, cls, allowlist)) violations.push({ file, selector, cls, owner });
  }
  return violations;
}

// A quote right after a letter or digit is an apostrophe in JSX text ("don't"): code never puts
// a string there.
const WORD_CHAR = /[\p{L}\p{N}_$]/u;

// Whether the quote at `i` opens a string. Not right after a letter or digit; in a script, not
// right after `}` or a `>` that ends no arrow either, where JSX text goes on ("{name}'s",
// "</b>'s").
function opensString(text, i, script) {
  const prev = text[i - 1] ?? '';
  if (WORD_CHAR.test(prev)) return false;
  return !(script && (prev === '}' || (prev === '>' && text[i - 2] !== '=')));
}

// What a regular expression literal can follow: an operator, an opening bracket, a comma or
// semicolon, the `>` of an arrow, or one of these keywords. After anything else a `/` divides.
const BEFORE_REGEX_CHARS = '(,=:[!&|?{;+-%~^';
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

// Whether an expression can start at `i`: where a `/` opens a regular expression, and a backtick
// a template literal. A JSX tag's `>` is followed by text, not by an expression.
function startsRegex(text, i) {
  let k = i - 1;
  while (k >= 0 && /\s/.test(text[k])) k--;
  if (k < 0 || BEFORE_REGEX_CHARS.includes(text[k])) return true;
  if (text[k] === '>') return text[k - 1] === '=';
  const word = /[\w$]+$/.exec(text.slice(Math.max(0, k - 9), k + 1));
  return word !== null && BEFORE_REGEX_WORDS.has(word[0]);
}

const REGEX_FLAGS = 'dgimsuvy';

// The index just past the regular expression literal that opens at `i`, flags included, or -1
// when no closing slash ends it on its line, or a letter that is no flag follows that slash
// (`in/out <b>`).
function endOfRegex(text, i) {
  let inClass = false;
  for (let j = i + 1; j < text.length && text[j] !== '\n'; j++) {
    const c = text[j];
    if (c === '\\') {
      j++;
    } else if (c === '[') {
      inClass = true;
    } else if (c === ']') {
      inClass = false;
    } else if (c === '/' && !inClass) {
      let k = j + 1;
      for (; k < text.length && /[\w$]/.test(text[k]); k++) {
        if (!REGEX_FLAGS.includes(text[k])) return -1;
      }
      return k;
    }
  }
  return -1;
}

// Whether the backtick at `i` opens a template literal in a script: where an expression can
// start, or right after a tag (`css`, `styled.div`) that itself stands where code does.
// Elsewhere it is a backtick in JSX text (`<kbd>`</kbd>`, "`code`").
function opensTemplate(text, i) {
  if (startsRegex(text, i)) return true;
  let k = i;
  while (k > 0 && /[\w$]/.test(text[k - 1])) k--;
  return k < i && (text[k - 1] === '.' || startsRegex(text, k));
}

/**
 * Splits source text into `code` (same length and layout as the input, comments blanked to
 * spaces), `comments` (the text of every comment) and `literals` (every string and template
 * literal: `start` is the offset of its first character inside the quotes, `text` its content,
 * the same length, with each interpolation's code blanked). An interpolation is scanned as code,
 * so a string inside one is a literal of its own. A quoted string ends at its closing quote or,
 * unclosed, at the end of its line, so an apostrophe the scan misreads costs one line at most.
 * With `script`, for TypeScript, a regular expression literal is code and its quotes start no
 * string, and JSX text's quotes and backticks start nothing: a quote right after `}` or a tag's
 * `>`, or a backtick where no expression can start. A quick char-scanner, not a parser.
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
    if ((c === '"' || c === "'") && opensString(text, i, script)) {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      j = Math.min(j, n);
      literals.push({ start: i + 1, text: text.slice(i + 1, j) });
      i = j < n && text[j] === c ? j + 1 : j;
      continue;
    }
    if (c === '`' && (!script || opensTemplate(text, i))) {
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
      // A token glued to an interpolation counts by its text before the `${`: `gt-button${x}`
      // writes gt-button, while `gt-button--${size}` names no class.
      const glued = match[0].indexOf('${');
      const cls = glued === -1 ? match[0] : match[0].slice(0, glued);
      const owner = owned.get(cls);
      if (owner && !isAllowed(file, cls, allowlist)) {
        violations.push({ file, line: lineAt(source, start + match.index), cls, owner });
      }
    }
  }
  return violations;
}
