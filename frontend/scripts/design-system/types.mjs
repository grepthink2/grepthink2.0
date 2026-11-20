/**
 * `components/index.d.ts`: the kit's exported types, as one documentation file.
 *
 * buildTypes runs `tsc` (tsconfig.design-types.json) to emit the declarations of the kit and of
 * Icon, and joinDeclarations joins those of the files the bundle exports from, in the export
 * list's order, each under a line naming its source. One file has no module graph, so the imports
 * go: React's types are named through one `import * as React from 'react'` (a bare `ReactNode`
 * becomes `React.ReactNode`, an `import("react").JSX` type becomes `React.JSX`), another kit
 * file's types are already in the file, and the router's and lucide's few types are declared at
 * the top as the bundle has them (the Link stand-in's props, a lucide icon component).
 *
 * The joined file is then compiled on its own, against React's types only, so it holds no name it
 * does not declare.
 *
 * TypeScript 7 has no stable compiler API, so this runs the `tsc` command and reads its output.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const STAND_INS = {
  LinkProps:
    "/** The Link stand-in's props: an anchor's, with `to` as its address. */\n" +
    'type LinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & { to: string | { pathname?: string; search?: string; hash?: string } };',
  LucideProps:
    '/** A lucide icon\'s props: an `<svg>`\'s, with its size. */\n' +
    'type LucideProps = React.SVGProps<SVGSVGElement> & { size?: string | number; absoluteStrokeWidth?: boolean };',
  LucideIcon:
    '/** A lucide icon component (lucide-react). */\n' +
    'type LucideIcon = React.ForwardRefExoticComponent<Omit<LucideProps, "ref"> & React.RefAttributes<SVGSVGElement>>;',
};
const STAND_IN_NEEDS = { LucideIcon: ['LucideProps'] };

const IMPORT = /^import[ \t]+(?:type[ \t]+)?([\s\S]*?)[ \t]+from[ \t]+(['"])([^'"]+)\2;?[ \t]*\n?/gm;
const SIDE_EFFECT_IMPORT = /^import[ \t]+(['"])[^'"]+\1;?[ \t]*\n?/gm;

const escape = (name) => name.replace(/\$/g, '\\$');
const word = (name) => new RegExp(`(?<![.\\w$])${escape(name)}\\b`, 'g');

const isReact = (from) => from === 'react' || from.startsWith('react/');

// The bindings of an import clause: `[imported, local]` pairs, and a default or namespace name.
function bindingsOf(clause) {
  const named = [];
  const braces = /\{([\s\S]*)\}/.exec(clause);
  if (braces) {
    for (const part of braces[1].split(',')) {
      const [imported, local] = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
      if (imported) named.push([imported, local ?? imported]);
    }
  }
  const head = clause.replace(/\{[\s\S]*\}/, '').replace(/,/g, ' ').trim();
  const whole = /^(?:\*\s+as\s+)?([A-Za-z_$][\w$]*)$/.exec(head)?.[1];
  return { named, whole };
}

/**
 * One file's declarations, with its imports resolved for the joined file. Returns the text and
 * the router and lucide types it names.
 */
function rewrite(text) {
  const external = new Set();
  let out = text;
  const renames = [];
  out = out.replace(IMPORT, (statement, clause, _quote, from) => {
    const { named, whole } = bindingsOf(clause);
    if (isReact(from)) {
      for (const [imported, local] of named) renames.push([local, `React.${imported}`]);
      if (whole && whole !== 'React') renames.push([whole, 'React']);
      return '';
    }
    const isLocal = from.startsWith('.') || from.startsWith('@/');
    if (!isLocal && from !== 'react-router-dom' && from !== 'lucide-react') return statement;
    for (const [imported, local] of named) {
      if (!isLocal) external.add(imported);
      if (local !== imported) renames.push([local, imported]);
    }
    return '';
  });
  out = out.replace(SIDE_EFFECT_IMPORT, '');
  for (const [local, replacement] of renames) out = out.replace(word(local), replacement);
  out = out
    .replace(/import\("react(?:\/[^"]*)?"\)\./g, 'React.')
    .replace(/import\("[^"]*"\)\./g, '')
    .replace(/^export default function /gm, 'export declare function ')
    .replace(/^export default [A-Za-z_$][\w$]*;[ \t]*\n?/gm, '')
    .replace(/^export \{\};[ \t]*\n?/gm, '');
  return { text: out.trim(), external };
}

const declarationPath = (source) => source.replace(/\.tsx?$/, '.d.ts');

/**
 * @param {{ path: string; text: string }[]} files declaration files, by path from frontend/
 * @param {{ name: string; file: string }[]} exports the bundle's exports, by source path from frontend/
 * @returns {string}
 */
export function joinDeclarations(files, exports) {
  const byPath = new Map(files.map((file) => [file.path, file.text]));
  const sources = [...new Set(exports.map((entry) => entry.file))];
  const external = new Set();
  const sections = sources.map((source) => {
    const text = byPath.get(declarationPath(source));
    if (text === undefined) throw new Error(`no declarations for ${source}`);
    const rewritten = rewrite(text);
    for (const name of rewritten.external) external.add(name);
    return `// ── ${source} ──\n${rewritten.text}`;
  });
  const standIns = new Set();
  for (const name of external) {
    for (const need of STAND_IN_NEEDS[name] ?? []) standIns.add(need);
    if (STAND_INS[name]) standIns.add(name);
  }
  return [
    "/**\n * GrepThink design system: the shared kit's exported types, generated from frontend/src by\n * `npm run design:build`. Documentation of what window.GrepThinkDesignSystem_36e7e3 holds; there\n * is no module to import.\n */",
    "import * as React from 'react';",
    ...Object.keys(STAND_INS).filter((name) => standIns.has(name)).map((name) => STAND_INS[name]),
    ...sections,
  ].join('\n\n') + '\n';
}

// The parameter list of the function declared at `at`, found by balancing brackets.
function parametersAt(text, at) {
  let i = text.indexOf('(', at);
  const start = i + 1;
  let depth = 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '{' || c === '[' || c === '<') depth++;
    else if ((c === ')' || c === '}' || c === ']' || c === '>') && text[i - 1] !== '=') depth--;
    if (depth === 0) break;
  }
  return text.slice(start, i);
}

/**
 * For each component whose props type is not called `<Name>Props`, a line naming what it takes.
 * Throws when a component has no declaration in the joined text.
 * @param {string} text joinDeclarations' result
 * @param {{ name: string; kind?: string }[]} exports
 * @returns {string[]}
 */
export function propsNotes(text, exports) {
  const notes = [];
  for (const { name, kind } of exports) {
    if (kind && kind !== 'component') continue;
    if (new RegExp(`^(?:export )?(?:declare )?(?:interface|type) ${escape(name)}Props\\b`, 'm').test(text)) continue;
    const fn = new RegExp(`^export declare function ${escape(name)}\\b`, 'm').exec(text);
    const constant = new RegExp(`^export declare const ${escape(name)}: (.+);$`, 'm').exec(text);
    if (fn) {
      const params = parametersAt(text, fn.index);
      if (!params.trim()) notes.push(`${name} takes no props`);
      else {
        const type = /:\s*([A-Za-z_$][\w$.]*(?:<[\s\S]*>)?)\s*$/.exec(params)?.[1];
        notes.push(type ? `${name} takes ${type}` : `${name} takes props declared inline`);
      }
    } else if (constant) {
      notes.push(`${name} is ${constant[1]}`);
    } else {
      throw new Error(`${name} has no declaration in index.d.ts`);
    }
  }
  return notes;
}

/**
 * Emits the declarations and joins them.
 * @param {{ root: string; exports: { name: string; file: string; kind: string }[] }} options
 *   `exports` as collectKitExports gives them (paths from src/components/)
 * @returns {Promise<string>}
 */
export async function buildTypes({ root, exports }) {
  const outDir = join(root, '.design-system/types');
  rmSync(outDir, { recursive: true, force: true });
  const tsc = join(root, 'node_modules/.bin/tsc');
  const run = spawnSync(tsc, ['-p', 'tsconfig.design-types.json'], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`tsc could not emit the kit's declarations:\n${run.stdout}${run.stderr}`);
  const all = [
    ...exports.map((entry) => ({ ...entry, file: `src/components/${entry.file}` })),
    { name: 'Icon', file: 'design-system/runtime/Icon.tsx', kind: 'component' },
  ];
  const files = [...new Set(all.map((entry) => declarationPath(entry.file)))]
    .filter((path) => existsSync(join(outDir, path)))
    .map((path) => ({ path, text: readFileSync(join(outDir, path), 'utf8') }));
  const text = joinDeclarations(files, all);
  propsNotes(text, all);
  if (text.includes('import(')) throw new Error('index.d.ts still holds an import() type');
  // The joined file must compile on its own, against React's types only.
  const joined = join(outDir, 'index.d.ts');
  writeFileSync(joined, text);
  const check = spawnSync(
    tsc,
    ['--ignoreConfig', '--noEmit', '--strict', '--lib', 'es2022,dom', '--module', 'esnext', '--moduleResolution', 'bundler', '--types', 'react', joined],
    { cwd: root, encoding: 'utf8' },
  );
  if (check.status !== 0) throw new Error(`index.d.ts does not compile on its own:\n${check.stdout}${check.stderr}`);
  return text;
}
