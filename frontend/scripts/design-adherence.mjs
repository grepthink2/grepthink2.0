#!/usr/bin/env node
/**
 * Design-system adherence check: non-token color literals.
 *
 * SCOPE (read before trusting a clean run): this scanner matches only bare
 * `#hex`/`#rrggbb`/`#rrggbbaa` literals. It does NOT scan `rgba()`/`rgb()`/
 * `hsl()`/`hsla()` literals — as of this writing 51 files under src/ contain
 * at least one. Extending coverage to those is real, separate work: it needs
 * its own ledger sweep (most `rgba($sass-var, alpha)` calls are legitimate
 * soft-fill math on an already-tokenized color and shouldn't be flagged, but
 * plenty of literal `rgba(r, g, b, a)` calls are exactly the same kind of
 * non-token color this script exists to catch) — tracked as a possible
 * follow-up, not attempted here.
 *
 * This script is the ENTIRE `lint:design` gate. An oxlint half was vendored
 * briefly and removed by the final branch review: the only rules oxlint could
 * actually run (`no-restricted-imports` on DS-component paths, an empty
 * `forbid-elements`) matched zero files in this repo — the globs referenced a
 * component layout (`components/primitives/**` etc.) that doesn't exist here.
 * If/when the DS component package is vendored in, resurrect that half from
 * commit 26083fb with real paths.
 *
 * Origin: the GrepThink Design System export ships `_adherence.oxlintrc.json`,
 * an oxlint config whose real substance — a `no-restricted-syntax` block with
 * ~88 selectors (raw hex/px/font-family literals, plus per-component JSX
 * prop/enum shape checks for the DS's own React components) — turns out not
 * to run at all: oxlint 1.76 doesn't implement `no-restricted-syntax`
 * (confirmed empirically: `oxlint -c` refuses to load a config referencing
 * it, "Rule 'no-restricted-syntax' not found in plugin 'eslint'"). oxlint
 * also can't parse .scss in the first place, which is where nearly every
 * color literal in this codebase actually lives — the DS's own JSX
 * components aren't imported anywhere in this repo yet, so the prop/enum
 * portion of that rule would be pure noise (and would false-positive on
 * this codebase's unrelated local components that happen to share names,
 * e.g. the file-scoped `Avatar` helpers in FinalReviews.tsx/FinalReviewDetail
 * .tsx/TeamMeetingCard.tsx, which take a `name`/`email`/`size` shape with no
 * relation to the DS's `Avatar`).
 *
 * What's genuinely usable from that config (restricted imports of DS
 * component internals, forbidden elements) is vendored as-is in
 * frontend/.oxlintrc-adherence.json and run by oxlint. This script
 * reimplements the one part of the config's *intent* that actually has bite
 * in this codebase: catching raw hex color literals that bypass the
 * `--gt-*` design-token layer, across the stylesheet layer (.scss/.css) and
 * the handful of TS/TSX call sites that hardcode chart/decorative colors
 * (oxlint's own literal-value check can't run either, per above, so this
 * covers the JS/TS side too, not only CSS).
 *
 * A hex literal is allowed when:
 *   - it lives in a token-definition file (the source of truth FOR the
 *     `--gt-*` layer must contain literal hex — that's not a violation), or
 *   - the file carries a documenting comment block using this codebase's
 *     existing "E1 ledger" convention (comments containing words like
 *     "bespoke", "legacy palette", "left as raw hex", "pinned", "verbatim",
 *     "predates the design-token"). Presence of the marker anywhere in the
 *     file's comments allowlists every hex literal in that file — matching
 *     how this codebase actually documents an exception today: one
 *     comment block per file/section explaining the family (e.g. "these
 *     *-bg values are a bespoke shade, left as raw hex"), not a citation of
 *     every individual value. The comment IS the allowlist, so the ledger
 *     can't drift out of sync with a second, hand-maintained list.
 *   - it's listed in NON_COLOR_FALSE_POSITIVES below — a small number of
 *     `#NNN`-shaped substrings that aren't colors at all (e.g. a "PR #123"
 *     reference inside placeholder copy).
 *
 * Anything else is a violation: either a real regression (fix the value) or
 * a pre-existing gap that needs its own ledger comment added.
 */

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const SRC_DIR = join(FRONTEND_ROOT, 'src');

const SCAN_EXTS = new Set(['.scss', '.css', '.ts', '.tsx']);

// Token-definition files: these ARE the source of truth for the --gt-*
// tokens (and the legacy $-variable bridge that predates them). Raw hex here
// is the point of the file, not a violation.
const DEFINITION_FILES = new Set([
  'src/styles/_colors.scss',
  'src/styles/tokens/colors.css',
  'src/styles/tokens/spacing.css',
  'src/styles/tokens/typography.css',
]);

// Vocabulary this codebase already uses (see `git log --oneline -30` /
// the "token sweep" commits) to document a deliberately-kept non-token
// color inline. Anything matching one of these, anywhere in a file's
// comments, marks that file as having a reviewed ledger.
//
// NOTE on 'pinned': deliberately NOT a bare word. "pinned" shows up in
// plenty of innocent, color-unrelated prose (position/scheduling language
// like "pinned to the top" in Header.tsx, "pinned to the viewport bottom"
// in Messages.scss, "Pinned to America/Los_Angeles" in reviewDates.ts,
// "pinned to 11:59 PM PST" in StudentHomeDashboard.tsx) — and since
// allowlisting is file-scoped, a bare 'pinned' match would clear every hex
// literal in a file for a reason that has nothing to do with color. Only
// the specific phrases below count.
const LEDGER_MARKERS = [
  'bespoke',
  'legacy palette',
  'left as', // "left as-is" / "left as raw hex" / "left as the raw hex" / ...
  'leave as-is',
  'not tokeniz', // tokenized / tokenised
  'no --gt-* equivalent',
  'no close --gt-*',
  'no gt-* equivalent',
  'predates the design-token',
  'pinned literal',
  'pinned hex',
  'verbatim', // covers "kept verbatim" too
  'kept literal',
  'stay local',
];

// Known `#NNN`-shaped substrings that are not color literals — tracked
// explicitly (file + exact snippet) rather than loosened in the regex, so
// the regex stays precise for everything else. Each entry is a reason, not
// a rubber stamp: re-verify the snippet still matches before trusting it.
const NON_COLOR_FALSE_POSITIVES = [
  {
    file: 'src/features/app/components/TSRS/ScrumMasterTab.tsx',
    snippet: 'PR #123',
    reason: 'GitHub PR-number example inside placeholder copy, not a color.',
  },
];

const HEX_RE = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (SCAN_EXTS.has(extname(entry))) out.push(p);
  }
  return out;
}

/**
 * Splits source text into `code` (same length/layout as the input, with
 * comments and string/template contents blanked to spaces) and `comments`
 * (the concatenated raw text of every comment span). Hex literals inside
 * string/template literals are left in `code` — a chart-color constant like
 * `'#018156'` is a real usage, not commentary. A quick char-scanner is
 * enough here; this isn't trying to be a real parser.
 */
function splitCodeAndComments(text) {
  let code = '';
  let comments = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    // Line comment — guard against `://` (protocol-relative URLs).
    if (c === '/' && c2 === '/' && text[i - 1] !== ':') {
      let j = i;
      while (j < n && text[j] !== '\n') j++;
      // Leading space keeps this comment from gluing onto whatever
      // (unrelated) comment text precedes it with no separator.
      comments += ' ' + text.slice(i, j);
      code += ' '.repeat(j - i);
      i = j;
      continue;
    }
    // Block comment.
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      comments += ' ' + text.slice(i, j);
      code += text.slice(i, j).replace(/[^\n]/g, ' ');
      i = j;
      continue;
    }
    // String / template literal — copy through as code.
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      let j = i + 1;
      while (j < n && text[j] !== quote) {
        if (text[j] === '\\') j++;
        j++;
      }
      j = Math.min(j + 1, n);
      code += text.slice(i, j);
      i = j;
      continue;
    }
    code += c;
    i++;
  }
  return { code, comments };
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let k = 0; k < index; k++) if (text[k] === '\n') line++;
  return line;
}

const files = walk(SRC_DIR, []);
const violations = [];
let allowedCount = 0;
let ledgerFileCount = 0;

for (const abs of files) {
  const rel = relative(FRONTEND_ROOT, abs).split(sep).join('/');
  if (DEFINITION_FILES.has(rel)) continue;

  const text = readFileSync(abs, 'utf8');
  const { code, comments } = splitCodeAndComments(text);
  const falsePositives = NON_COLOR_FALSE_POSITIVES.filter((fp) => fp.file === rel);

  // Normalize away line-wrapping before matching markers: a wrapped JSDoc/
  // block comment like `...distinct — left\n * as-is rather...` must still
  // read as "left as-is", not have the phrase split across the `\n * `
  // continuation prefix. Collapse leading `//`/`*` line-continuation noise
  // and all whitespace runs (including newlines) to a single space.
  const commentsLower = comments
    .toLowerCase()
    .replace(/^[ \t]*[/*]+[ \t]*/gm, ' ')
    .replace(/\s+/g, ' ');
  const hasLedger = LEDGER_MARKERS.some((m) => commentsLower.includes(m));
  if (hasLedger) ledgerFileCount++;

  HEX_RE.lastIndex = 0;
  let m;
  while ((m = HEX_RE.exec(code))) {
    if (hasLedger) {
      allowedCount++;
      continue;
    }
    const line = lineNumberAt(text, m.index);
    const lineText = text.split('\n')[line - 1] ?? '';
    const isKnownFalsePositive = falsePositives.some((fp) => lineText.includes(fp.snippet));
    if (isKnownFalsePositive) {
      allowedCount++;
      continue;
    }
    violations.push({ file: rel, line, value: m[0] });
  }
}

if (violations.length === 0) {
  console.log(
    `design-adherence: OK — 0 non-token color literals (${allowedCount} pre-cleared by ` +
      `in-file ledger comments/known false-positives across ${ledgerFileCount} ledger files, ` +
      `${DEFINITION_FILES.size} token-definition files exempted).`
  );
  process.exit(0);
}

console.error(`design-adherence: ${violations.length} non-token color literal(s) found:\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}  ${v.value}`);
}
console.error(
  '\nUse a --gt-* design token via var(...) instead. If this is a deliberate, already-reviewed ' +
    'exception, document it with a comment in the file (see existing "bespoke" / "legacy palette" ' +
    '/ "left as raw hex" comments for the convention) rather than adding it here.'
);
process.exit(1);
