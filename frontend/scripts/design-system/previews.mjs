/**
 * The previews beside the kit's components: `<Folder>/<Folder>.preview.tsx`, one per component
 * folder of src/components/, published as `components/<Name>/preview.html`.
 *
 * A preview is type-checked TSX that imports the kit the way a feature does:
 *
 *   export const meta: PreviewMeta = { group: 'Primitives', height: 220 };
 *   export default function ButtonPreview() { … }
 *
 * `meta` (src/components/previewMeta.ts) is read from the source text, never run: an object literal
 * of string and number literals. Its `group` and `height` go on the card's `@dsCard` line,
 * `component` names the bundle export the card belongs to when it is not the folder's name, and
 * `expects` is a selector the render check must find. A preview imports kit pieces (through
 * `@components/`, `@/components/` or a relative path), icons from lucide-react and hooks from react,
 * and nothing else; type-only imports are erased and go unchecked.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { splitCodeAndComments } from '../ownership.mjs';

/** Folders of src/components/ that hold no kit component, so carry no preview. */
export const PREVIEW_FOLDERS_LEFT_OUT = ['ErrorBoundary', 'hooks', 'icons', '__tests__'];

export const PREVIEW_GROUPS = ['Primitives', 'Display', 'Feedback', 'Navigation'];
export const PREVIEW_HEIGHT = { min: 40, max: 4000 };
const META_KEYS = new Set(['group', 'height', 'subtitle', 'component', 'expects']);

/**
 * @typedef {{ group: string; height: number; subtitle?: string; component?: string; expects?: string }} PreviewMeta
 * @typedef {{ folder: string; component: string; file: string; path: string; meta: PreviewMeta }} PreviewEntry
 *   `file` is the preview's path for messages (relative to the components directory, `/`
 *   separators); `path` is absolute.
 */

const META_START = /^export[ \t]+const[ \t]+meta\b[^=\n]*=[ \t]*/m;
// One token of the literal: a name, a quoted string, a number, or punctuation.
const TOKEN = /\s*(?:([A-Za-z_$][\w$]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")|(-?\d+(?:\.\d+)?)(?![\w.])|([{}:,]))/y;

const unquote = (text) => text.slice(1, -1).replace(/\\(.)/g, '$1');

/**
 * The object literal at `from` in `code` (comments blanked): its entries, or null when it is not a
 * literal of string and number values.
 */
function parseLiteral(code, from) {
  TOKEN.lastIndex = from;
  const next = () => {
    const match = TOKEN.exec(code);
    if (!match) return null;
    const [, name, string, number, punct] = match;
    if (name !== undefined) return { kind: 'name', value: name };
    if (string !== undefined) return { kind: 'string', value: unquote(string) };
    if (number !== undefined) return { kind: 'number', value: Number(number) };
    return { kind: punct };
  };
  if (next()?.kind !== '{') return null;
  const entries = {};
  for (;;) {
    let token = next();
    if (token?.kind === '}') break;
    if (token?.kind !== 'name' && token?.kind !== 'string') return null;
    const key = token.value;
    if (next()?.kind !== ':') return null;
    const value = next();
    if (value?.kind !== 'string' && value?.kind !== 'number') return null;
    entries[key] = value.value;
    token = next();
    if (token?.kind === '}') break;
    if (token?.kind !== ',') return null;
  }
  // What follows the literal ends the statement: `;`, or a line end.
  const rest = /^[ \t]*(?:;|\n|$)/.exec(code.slice(TOKEN.lastIndex));
  return rest ? entries : null;
}

// The module specifiers of a source's value imports (`import type` left out), side-effect imports included.
const IMPORT = /^import[ \t]+(?:(type)[ \t]+)?(?:[\s\S]*?[ \t]+from[ \t]*)?(['"])([^'"]+)\2/gm;

function importProblem(code, previewPath, componentsDir) {
  for (const [, typeOnly, , from] of code.matchAll(IMPORT)) {
    if (typeOnly) continue;
    if (from === 'react' || from === 'lucide-react') continue;
    let target = null;
    if (from.startsWith('@components/')) target = join(componentsDir, from.slice('@components/'.length));
    else if (from.startsWith('@/components/')) target = join(componentsDir, from.slice('@/components/'.length));
    else if (from.startsWith('./') || from.startsWith('../')) target = resolve(dirname(previewPath), from);
    const inKit = target !== null && !relative(componentsDir, target).startsWith('..') && !/\.(?:s?css|json)$/.test(from);
    if (!inKit) return from;
  }
  return null;
}

/**
 * Reads one preview: its meta, checked, and its default export.
 * @param {{ path: string; file: string; folder: string; componentsDir: string; exports: { name: string }[] }} options
 *   `componentsDir` is where the preview may import from (the kit, or Icon's runtime folder)
 * @returns {PreviewEntry}
 */
export function readPreview({ path, file, folder, componentsDir, exports }) {
  const source = readFileSync(path, 'utf8');
  // Comments blanked, strings kept: the literal's values are strings.
  const { code } = splitCodeAndComments(source, { script: true });
  const start = META_START.exec(code);
  if (!start) throw new Error(`${file}: export const meta is missing`);
  const meta = parseLiteral(code, start.index + start[0].length);
  if (!meta) throw new Error(`${file}: meta must be an object literal of strings and numbers`);
  for (const key of Object.keys(meta)) {
    if (!META_KEYS.has(key)) throw new Error(`${file}: meta has an unknown key "${key}"`);
  }
  if (meta.group === undefined || meta.height === undefined) throw new Error(`${file}: meta needs a group and a height`);
  if (!PREVIEW_GROUPS.includes(meta.group)) throw new Error(`${file}: unknown group "${meta.group}"`);
  if (typeof meta.height !== 'number' || !Number.isInteger(meta.height) || meta.height < PREVIEW_HEIGHT.min || meta.height > PREVIEW_HEIGHT.max) {
    throw new Error(`${file}: height ${meta.height} is outside ${PREVIEW_HEIGHT.min}–${PREVIEW_HEIGHT.max}`);
  }
  for (const key of ['subtitle', 'component', 'expects']) {
    if (key in meta && typeof meta[key] !== 'string') throw new Error(`${file}: meta ${key} must be a string`);
  }
  const component = meta.component ?? folder;
  if (!exports.some((entry) => entry.name === component)) throw new Error(`${file}: component "${component}" is not a bundle export`);
  const name = `${folder}Preview`;
  if (!new RegExp(`^export[ \\t]+default[ \\t]+function[ \\t]+${name}\\b`, 'm').test(code)) {
    throw new Error(`${file}: export default function ${name} is missing`);
  }
  const imported = importProblem(code, path, componentsDir);
  if (imported) throw new Error(`${file}: imports "${imported}"; a preview imports only the kit, lucide-react and react`);
  return { folder, component, file, path, meta };
}

/**
 * The previews of the kit, one per component folder that has `<Folder>.preview.tsx`, by folder.
 * @param {string} componentsDir src/components
 * @param {{ name: string }[]} exports the bundle's exports, which a meta `component` must name
 * @returns {PreviewEntry[]}
 */
export function collectPreviews(componentsDir, exports) {
  const previews = [];
  for (const folder of readdirSync(componentsDir).sort()) {
    const folderPath = join(componentsDir, folder);
    if (PREVIEW_FOLDERS_LEFT_OUT.includes(folder) || !statSync(folderPath).isDirectory()) continue;
    const path = join(folderPath, `${folder}.preview.tsx`);
    if (!existsSync(path)) continue;
    const file = relative(componentsDir, path).split(sep).join('/');
    previews.push(readPreview({ path, file, folder, componentsDir, exports }));
  }
  return previews;
}
