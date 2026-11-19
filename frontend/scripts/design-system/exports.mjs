/**
 * What the design-system bundle exports, read from the shared kit's source.
 *
 * Every value export of every source file in a component folder of src/components/ and in its
 * hooks/ folder: components, hooks and helpers alike, since code decides what the system holds.
 * Left out: tests, the ErrorBoundary folder (app plumbing) and icons/ (brand marks, which Icon
 * does not carry either). Types are not values and are left to index.d.ts.
 *
 * Exports are read by pattern over the source with comments and strings blanked, as names.mjs
 * reads them: a top-level `export function|const|class`, `export default function Name`, and
 * `export { a, b as c }` without `from`. A default export that is the module's only export of its
 * binding (`export default function MarkdownText`) is marked `isDefault`, so the entry imports it
 * as the default.
 */

import { mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { splitCodeAndComments } from '../ownership.mjs';

/** The bundle's global: `window.GrepThinkDesignSystem_36e7e3`. */
export const NAMESPACE = 'GrepThinkDesignSystem_36e7e3';

const LEFT_OUT_FOLDERS = new Set(['ErrorBoundary', 'icons', '__tests__']);

/**
 * @typedef {{ name: string; file: string; kind: 'component' | 'hook' | 'helper'; isDefault?: true }} KitExport
 * `file` is the source path relative to the components directory, with `/` separators.
 */

const DECLARATION =
  /^export[ \t]+(default[ \t]+)?(?:async[ \t]+)?(?:function\b[ \t]*\*?|const\b|let\b|var\b|class\b)[ \t]*([A-Za-z_$][\w$]*)/gm;
const DEFAULT_EXPORT = /^export[ \t]+default[ \t]+([A-Za-z_$][\w$]*)[ \t]*;?[ \t]*$/gm;
const EXPORT_LIST = /^export[ \t]*(type\b)?[ \t]*\{([^}]*)\}[ \t]*(from\b)?/gm;

// The source with its comments and the contents of its strings blanked, lines kept.
function codeOf(source) {
  const { code, literals } = splitCodeAndComments(source, { script: true });
  const chars = code.split('');
  for (const { start, text } of literals) {
    for (let i = start; i < start + text.length; i++) if (chars[i] !== '\n') chars[i] = ' ';
  }
  return chars.join('');
}

/**
 * The value exports of one module: `{ name, isDefault }`, in source order.
 * @param {string} source
 * @returns {{ name: string; isDefault: boolean }[]}
 */
export function valueExportsOf(source) {
  const code = codeOf(source);
  const named = new Set();
  const defaults = [];
  for (const [, isDefault, name] of code.matchAll(DECLARATION)) {
    if (isDefault) defaults.push(name);
    else named.add(name);
  }
  for (const [, name] of code.matchAll(DEFAULT_EXPORT)) defaults.push(name);
  for (const [, typeOnly, names, from] of code.matchAll(EXPORT_LIST)) {
    if (typeOnly || from) continue;
    for (const part of names.split(',')) {
      const [local, as] = part.trim().split(/\s+as\s+/);
      if (!local || local.startsWith('type ')) continue;
      if (as === 'default') defaults.push(local);
      else named.add(as ?? local);
    }
  }
  return [
    ...[...named].map((name) => ({ name, isDefault: false })),
    ...defaults.filter((name) => !named.has(name)).map((name) => ({ name, isDefault: true })),
  ];
}

const isPascalCase = (name) => /^[A-Z]/.test(name) && /[a-z]/.test(name);

function kindOf(name, file) {
  if (isPascalCase(name) && file.endsWith('.tsx')) return 'component';
  if (/^use[A-Z]/.test(name)) return 'hook';
  return 'helper';
}

function sourceFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir).sort()) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!LEFT_OUT_FOLDERS.has(entry)) files.push(...sourceFiles(path));
    } else if (/\.tsx?$/.test(entry) && !entry.endsWith('.d.ts') && !entry.includes('.test.')) {
      files.push(path);
    }
  }
  return files;
}

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Every value export of the kit, sorted by folder, then name.
 * @param {string} componentsDir
 * @returns {KitExport[]}
 */
export function collectKitExports(componentsDir) {
  /** @type {Map<string, KitExport>} */
  const byName = new Map();
  for (const folder of readdirSync(componentsDir).sort()) {
    const folderPath = join(componentsDir, folder);
    if (LEFT_OUT_FOLDERS.has(folder) || !statSync(folderPath).isDirectory()) continue;
    for (const path of sourceFiles(folderPath)) {
      const file = relative(componentsDir, path).split(sep).join('/');
      for (const { name, isDefault } of valueExportsOf(readFileSync(path, 'utf8'))) {
        const seen = byName.get(name);
        if (seen) throw new Error(`${name} is exported by both ${seen.file} and ${file}`);
        byName.set(name, { name, file, kind: kindOf(name, file), ...(isDefault ? { isDefault: true } : {}) });
      }
    }
  }
  const folderOf = (entry) => entry.file.split('/')[0];
  return [...byName.values()].sort((a, b) => byCodePoint(folderOf(a), folderOf(b)) || byCodePoint(a.name, b.name));
}

/**
 * Writes the bundle's entry: imports each export through the `@components` alias, and assigns
 * the namespace on `window`, components through `wrapExport` (runtime/adapt.ts), hooks and
 * helpers as they are, and `Icon`.
 * @param {KitExport[]} exports
 * @param {string} outFile
 * @param {{ runtimeDir: string }} options
 */
export function writeEntry(exports, outFile, { runtimeDir }) {
  const runtime = runtimeDir.split(sep).join('/');
  const lines = [
    '// Generated by scripts/design-system/exports.mjs for `npm run design:build`. Do not edit.',
    `import { wrapExport } from '${runtime}/adapt';`,
    `import { Icon } from '${runtime}/Icon';`,
  ];
  for (const { name, file, isDefault } of exports) {
    const from = `@components/${file.replace(/\.tsx?$/, '')}`;
    lines.push(isDefault ? `import ${name} from '${from}';` : `import { ${name} } from '${from}';`);
  }
  lines.push('', `(window as unknown as Record<string, unknown>).${NAMESPACE} = {`);
  for (const { name, kind } of exports) lines.push(kind === 'component' ? `  ${name}: wrapExport(${name}),` : `  ${name},`);
  lines.push('  Icon: wrapExport(Icon),', '};', '');
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, lines.join('\n'));
}
