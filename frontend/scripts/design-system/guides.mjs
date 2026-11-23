/**
 * The guides beside the kit's components: `<Folder>/README.md`, one beside each preview (and
 * Icon's, in design-system/runtime/), published as `components/<Name>/README.md`, under the
 * preview's component.
 *
 * A guide is written for a designer or an agent composing a screen. checkGuide holds it to its
 * shape: a one-sentence summary first (the page adds the name, so no leading `# ` heading), at
 * least one fenced `jsx` example, and nothing about the design-era copies or the repo's history.
 * Every capitalised element in an example is a bundle export or a lucide icon the preview imports,
 * and its opening tag, props and all, appears in the preview as written (whitespace aside): the
 * preview is type-checked, so an example copied from it cannot name a prop the component lacks.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { splitCodeAndComments } from '../ownership.mjs';

export const GUIDE_CAP = 64 * 1024;
const SUMMARY_CAP = 200;

/**
 * @typedef {{ component: string; file: string; path: string; text: string }} GuideEntry
 *   `file` is the guide's path for messages, beside its preview's `file`
 */

/**
 * The guides beside the previews, by the previews' order; a preview without one is skipped.
 * @param {string} componentsDir src/components, which a kit guide's `file` is relative to
 * @param {{ component: string; file: string; path: string }[]} previews
 * @returns {GuideEntry[]}
 */
export function collectGuides(componentsDir, previews) {
  const guides = [];
  for (const { component, file, path } of previews) {
    const guidePath = join(dirname(path), 'README.md');
    if (!existsSync(guidePath)) continue;
    const inKit = relative(componentsDir, guidePath).split(sep).join('/');
    const name = inKit.startsWith('..') ? `${dirname(file)}/README.md` : inKit;
    guides.push({ component, file: name, path: guidePath, text: readFileSync(guidePath, 'utf8') });
  }
  return guides;
}

// The text of the fenced `jsx` blocks.
function examplesOf(text) {
  return [...text.matchAll(/^```jsx[ \t]*\n([\s\S]*?)^```[ \t]*$/gm)].map((match) => match[1]);
}

/**
 * Each capitalised opening tag in `code`: its name and its text from `<` to the `>` or `/>` that
 * ends it, props (and the elements inside their braces) included.
 */
export function openingTags(code) {
  const tags = [];
  for (const start of [...code.matchAll(/<([A-Z][\w.]*)/g)].map((match) => match.index)) {
    const name = /^<([A-Z][\w.]*)/.exec(code.slice(start))[1];
    let depth = 0;
    let i = start + 1 + name.length;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === '"' || c === "'" || c === '`') {
        const close = code.indexOf(c, i + 1);
        if (close === -1) break;
        i = close;
      } else if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    tags.push({ name, text: code.slice(start, i + 1) });
  }
  return tags;
}

const squeeze = (text) => text.replace(/\s+/g, '');

// The local names the preview gives the lucide icons it imports.
function lucideNamesOf(previewSource) {
  const { code } = splitCodeAndComments(previewSource, { script: true });
  const names = new Set();
  for (const [, typeOnly, specifiers] of code.matchAll(/^import[ \t]+(type[ \t]+)?\{([^}]*)\}[ \t]*from[ \t]*(['"])lucide-react\3/gm)) {
    if (typeOnly) continue;
    for (const part of specifiers.split(',')) {
      const [imported, local] = part.trim().split(/\s+as\s+/);
      if (imported && !imported.startsWith('type ')) names.add(local ?? imported);
    }
  }
  return names;
}

// The first paragraph after an optional leading `# ` heading, and whether that heading is there.
function summaryOf(text) {
  const blocks = text.trim().split(/\n[ \t]*\n/);
  const leadingHeading = /^# /.test(blocks[0] ?? '');
  const first = (leadingHeading ? blocks[1] : blocks[0]) ?? '';
  return { leadingHeading, first: first.trim() };
}

function isSummary(paragraph) {
  if (!paragraph || /^(?:#|```|[-*>|]\s|\d+\.\s)/.test(paragraph)) return false;
  const sentence = paragraph.replace(/\s+/g, ' ');
  return sentence.length < SUMMARY_CAP && sentence.endsWith('.') && !/[.!?]\s+[A-Z]/.test(sentence);
}

// What a guide must not mention: the design-era copies, and the repo's history (a pull request,
// by name or as a bare #number).
const MENTIONS = [/\bdesign\/[\w./*-]*/g, /\bClaude Design\b/gi, /\b(?:PR|pull request)\s*#?\d+|(?<![\w/&#])#\d{3,5}\b/gi];

/**
 * The problems that keep a guide from being published, none when it can be.
 * @param {{ text: string; previewSource: string; exports: { name: string }[] }} options
 * @returns {string[]}
 */
export function checkGuide({ text, previewSource, exports }) {
  if (!text.trim()) return ['the guide is empty'];
  const problems = [];
  if (Buffer.byteLength(text) > GUIDE_CAP) problems.push('the guide is over 64 KB');
  const { leadingHeading, first } = summaryOf(text);
  if (leadingHeading) problems.push('the guide starts with a # heading; the page adds the component name');
  if (!isSummary(first)) {
    problems.push(`the first paragraph is not a one-sentence summary ending with a period, under ${SUMMARY_CAP} characters`);
  }

  const examples = examplesOf(text);
  if (examples.length === 0) problems.push('the guide has no ```jsx example');
  const known = new Set([...exports.map((entry) => entry.name), ...lucideNamesOf(previewSource)]);
  const preview = squeeze(previewSource);
  const unknown = new Set();
  const missing = new Set();
  for (const example of examples) {
    for (const { name, text: tag } of openingTags(example)) {
      if (!known.has(name)) unknown.add(name);
      else if (!preview.includes(squeeze(tag))) missing.add(tag.replace(/\s+/g, ' '));
    }
  }
  for (const name of unknown) problems.push(`an example uses <${name}>, which is neither a bundle export nor a lucide icon the preview imports`);
  for (const tag of missing) problems.push(`an example's ${tag} is not in the preview as written`);

  for (const pattern of MENTIONS) {
    for (const [match] of text.matchAll(pattern)) {
      problems.push(`the guide mentions ${match.replace(/[.,;:]+$/, '')}; a guide speaks of the shipped kit only`);
    }
  }
  return problems;
}
