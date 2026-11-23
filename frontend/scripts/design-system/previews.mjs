/**
 * The previews beside the kit's components: `<Folder>/<Folder>.preview.tsx`, one per component
 * folder of src/components/ (and Icon's, in design-system/runtime/), published as
 * `components/<Name>/preview.html`.
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
 *
 * buildPreviews compiles each one (vite.design-preview.config.ts, in a Node process of its own as
 * bundle.mjs runs the bundle's build) into a classic script that reads every kit piece from
 * `window.GrepThinkDesignSystem_36e7e3`, so a published preview exercises the published bundle, and
 * renderPreviewHtml wraps it in the document the format asks for. The document's head carries a few
 * layout classes a preview's own markup may use: `ds-stack` (sections, top to bottom), `ds-section`
 * (a caption over its examples), `ds-caption`, `ds-row` (examples side by side, wrapping) and
 * `ds-grid`.
 *
 * checkPreview loads a document in jsdom as the Design System's frame does (tokens, bundle.css, React
 * and React DOM 18, the bundle, then the preview's script), twice, with the clock a year and a half
 * apart, and returns what keeps it from being published.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { format } from 'node:util';
import { splitCodeAndComments } from '../ownership.mjs';
import { NAMESPACE } from './exports.mjs';

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

/** Icon's preview, beside it in design-system/runtime/, when there is one. */
export function iconPreview(runtimeDir, exports) {
  const path = join(runtimeDir, 'Icon.preview.tsx');
  if (!existsSync(path)) return null;
  return readPreview({ path, file: 'design-system/runtime/Icon.preview.tsx', folder: 'Icon', componentsDir: runtimeDir, exports });
}

// ── The document ──────────────────────────────────────────────────────────────────────────────────

export const PREVIEW_CAP = 256 * 1024;
const FONTS = 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Poppins:wght@400;500;600;700&display=swap';
const FONT_HOSTS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/'];
const PREVIEW_STYLE = [
  'body { margin: 0; padding: 16px; background: var(--gt-surface); font-family: var(--gt-font-sans); font-size: var(--gt-text-body); line-height: 1.5; color: var(--gt-text-primary); }',
  '.ds-stack { display: flex; flex-direction: column; gap: 20px; }',
  '.ds-section { display: flex; flex-direction: column; gap: 8px; }',
  '.ds-caption { margin: 0; font-size: 12px; line-height: 16px; font-weight: 500; color: var(--gt-text-tertiary); }',
  '.ds-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }',
  '.ds-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 320px)); gap: 16px; align-items: start; }',
];

const escapeAttribute = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Script text that cannot end or confuse the inline `<script>` holding it, as bundle.js is made. */
export const inlineScript = (code) => code.replaceAll('</script', '<\\/script').replaceAll('<!--', '<\\!--');

/**
 * @param {{ meta: PreviewMeta; script: string; title: string }} options
 * @returns {string} preview.html
 */
export function renderPreviewHtml({ meta, script, title }) {
  const marker = `<!-- @dsCard group="${escapeAttribute(meta.group)}" height=${meta.height}${
    meta.subtitle ? ` subtitle="${escapeAttribute(meta.subtitle)}"` : ''
  } -->`;
  return [
    marker,
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeAttribute(title)}</title>`,
    `<link rel="stylesheet" href="${escapeAttribute(FONTS)}">`,
    '<style>',
    ...PREVIEW_STYLE,
    '</style>',
    '</head>',
    '<body>',
    '<div id="ds-preview"></div>',
    `<script>\n${inlineScript(script).trimEnd()}\n</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/**
 * tokens.json as the `:root` block a frame declares: every token of every family but `type`, an
 * alias (`{gt-gray-0}`) as `var()`.
 * @param {string | object} tokensJson
 */
export function tokensCss(tokensJson) {
  const tokens = typeof tokensJson === 'string' ? JSON.parse(tokensJson) : tokensJson;
  const lines = [];
  for (const [family, value] of Object.entries(tokens)) {
    if (family === 'type' || !Array.isArray(value?.tokens)) continue;
    for (const token of value.tokens) {
      const alias = /^\{(.+)\}$/.exec(String(token.value));
      lines.push(`  --${token.name}: ${alias ? `var(--${alias[1]})` : token.value};`);
    }
  }
  return `:root {\n${lines.join('\n')}\n}\n`;
}

// ── The check ─────────────────────────────────────────────────────────────────────────────────────

/** The two clocks a preview renders under; its HTML must not differ. */
export const CLOCKS = ['2026-01-15T12:00:00Z', '2027-06-15T12:00:00Z'];
const MARKER = /^<!-- @dsCard((?:\s+[a-z]+=(?:"[^"]*"|\d+))*)\s*-->$/;
const FORBIDDEN_TAGS = ['iframe', 'object', 'embed'];

function documentProblems(html) {
  const problems = [];
  if (Buffer.byteLength(html) > PREVIEW_CAP) problems.push('preview.html is over 256 KB');
  const marker = MARKER.exec(html.slice(0, html.indexOf('\n') === -1 ? undefined : html.indexOf('\n')));
  const attributes = Object.fromEntries([...(marker?.[1] ?? '').matchAll(/([a-z]+)=(?:"([^"]*)"|(\d+))/g)].map(([, k, q, n]) => [k, q ?? Number(n)]));
  if (!marker || attributes.group === undefined || attributes.height === undefined) {
    problems.push('line 1 is not a @dsCard marker with a group and a height');
  } else {
    if (!PREVIEW_GROUPS.includes(attributes.group)) {
      problems.push(`@dsCard group "${attributes.group}" is not one of ${PREVIEW_GROUPS.join(', ')}`);
    }
    const { height } = attributes;
    if (typeof height !== 'number' || height < PREVIEW_HEIGHT.min || height > PREVIEW_HEIGHT.max) {
      problems.push(`@dsCard height ${height} is outside ${PREVIEW_HEIGHT.min}–${PREVIEW_HEIGHT.max}`);
    }
  }
  // The markup outside the scripts: what the parser sees as tags.
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '<script></script>');
  for (const tag of FORBIDDEN_TAGS) {
    if (new RegExp(`<${tag}\\b`, 'i').test(markup)) problems.push(`preview.html holds an <${tag}>`);
  }
  const scripts = markup.match(/<script\b/gi) ?? [];
  if (scripts.length !== 1) problems.push(`preview.html holds ${scripts.length} scripts; a preview has one inline script`);
  for (const [, url] of markup.matchAll(/\b(?:src|href|data|srcset|poster)\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)) {
    if (!FONT_HOSTS.some((host) => url.startsWith(host))) {
      problems.push(`preview.html fetches ${url}; only the Google Fonts stylesheet may be fetched`);
    }
  }
  return problems;
}

// What a console.error call prints: an Error (from any realm) by its message.
function consoleText(args) {
  const plain = args.map((arg) =>
    arg && typeof arg === 'object' && typeof arg.message === 'string' && typeof arg.stack === 'string' ? arg.message : arg,
  );
  return format(...plain);
}

// Lets the window's event loop run until the document stops changing (at least twice, at most 50 times).
async function settle(window) {
  const turn = () => new Promise((resolve) => window.setTimeout(resolve, 0));
  let last = null;
  let still = 0;
  for (let i = 0; i < 50 && still < 2; i++) {
    await turn();
    const now = window.document.body.innerHTML;
    still = i >= 1 && now === last ? still + 1 : 0;
    last = now;
  }
}

/** One render of a preview document in jsdom under a fixed clock: its problems and the body's HTML. */
async function renderOnce({ html, libs, bundleJs, bundleCss, tokensJson, clock }) {
  // Loaded here, not with the module: lint:design reads previews without rendering one.
  const { JSDOM, VirtualConsole } = await import('jsdom');
  const problems = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('error', (...args) => problems.push(`console.error: ${consoleText(args)}`));
  virtualConsole.on('jsdomError', (error) => {
    if (error.type === 'unhandled-exception') problems.push(`threw: ${error.cause?.message ?? error.message}`);
  });
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole, url: 'https://preview.invalid/' });
  const { window } = dom;
  try {
    const { document } = window;
    const style = (text) => {
      const element = document.createElement('style');
      element.textContent = text;
      document.head.prepend(element);
    };
    style(bundleCss);
    style(tokensCss(tokensJson));
    window.eval(
      `(() => { const Real = Date; const fixed = Real.parse(${JSON.stringify(clock)});
        class FixedDate extends Real { constructor(...args) { if (args.length === 0) super(fixed); else super(...args); } static now() { return fixed; } }
        window.Date = FixedDate; })();`,
    );
    try {
      for (const code of [...libs, bundleJs]) window.eval(code);
    } catch (error) {
      problems.push(`the bundle does not load: ${error.message}`);
      return { problems, body: '', window };
    }
    const script = document.querySelector('script')?.textContent ?? '';
    try {
      window.eval(script);
    } catch (error) {
      problems.push(`threw: ${error.message}`);
    }
    await settle(window);
    if (!document.getElementById('ds-preview')?.firstElementChild) problems.push('#ds-preview is empty');
    return { problems, body: document.body.innerHTML, window };
  } catch (error) {
    window.close();
    throw error;
  }
}

/**
 * The problems that keep a preview document from being published, none when it can be.
 * @param {{ html: string; libs: string[]; bundleJs: string; bundleCss: string; tokensJson: string | object; expects?: string }} options
 *   `libs`: React and React DOM 18, in that order, as the frame loads them
 * @returns {Promise<string[]>}
 */
export async function checkPreview({ html, libs, bundleJs, bundleCss, tokensJson, expects }) {
  const problems = documentProblems(html);
  if (problems.length) return problems;
  const renders = [];
  for (const clock of CLOCKS) {
    const render = await renderOnce({ html, libs, bundleJs, bundleCss, tokensJson, clock });
    if (render.window && expects && !render.window.document.querySelector(expects)) {
      render.problems.push(`nothing in the document matches ${expects}`);
    }
    render.window?.close();
    renders.push(render);
  }
  const found = [...new Set(renders.flatMap((render) => render.problems))];
  if (found.length === 0 && renders[0].body !== renders[1].body) {
    found.push(`renders differently with the clock at ${CLOCKS[0]} and at ${CLOCKS[1]}`);
  }
  return found;
}

// ── The build ─────────────────────────────────────────────────────────────────────────────────────

const withoutExtension = (path) => path.replace(/\.tsx?$/, '');

/**
 * What vite.design-preview.config.ts reads to swap a kit module for the bundle's namespace: each kit
 * module by its absolute path without extension, with the names the namespace holds for it, and the
 * one it exports as its default (MarkdownText's module), which keeps its namespace name.
 * @param {{ exports: { name: string; file: string; isDefault?: boolean }[]; componentsDir: string; runtimeDir: string }} options
 * @returns {{ namespace: string; componentsDir: string; modules: Record<string, { names: string[]; default?: string }> }}
 */
export function kitIndex({ exports, componentsDir, runtimeDir }) {
  const modules = {};
  for (const { name, file, isDefault } of exports) {
    const module = (modules[withoutExtension(join(componentsDir, file))] ??= { names: [] });
    if (isDefault) module.default = name;
    else module.names.push(name);
  }
  modules[withoutExtension(join(runtimeDir, 'Icon.tsx'))] = { names: ['Icon'] };
  return { namespace: NAMESPACE, componentsDir, modules };
}

/**
 * Compiles every preview against the bundle's namespace.
 * @param {{ root: string; exports: { name: string; file: string }[] }} options the frontend
 *   directory, and the kit's exports as collectKitExports gives them
 * @returns {Promise<{ component: string; html: string; meta: PreviewMeta }[]>}
 */
export async function buildPreviews({ root, exports }) {
  const componentsDir = join(root, 'src/components');
  const runtimeDir = join(root, 'design-system/runtime');
  const bundleExports = [...exports, { name: 'Icon' }];
  const previews = [...collectPreviews(componentsDir, bundleExports), iconPreview(runtimeDir, bundleExports)].filter(Boolean);

  const gen = join(root, '.design-system/gen/previews');
  const raw = join(root, '.design-system/raw-previews');
  rmSync(gen, { recursive: true, force: true });
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(gen, { recursive: true });

  writeFileSync(join(gen, 'kit.json'), `${JSON.stringify(kitIndex({ exports, componentsDir, runtimeDir }), null, 2)}\n`);

  const entries = previews.map(({ component, path }) => {
    const entry = join(gen, `${component}.tsx`);
    writeFileSync(
      entry,
      [
        '// Generated by scripts/design-system/previews.mjs for `npm run design:build`. Do not edit.',
        "import { createElement } from 'react';",
        "import { createRoot } from 'react-dom/client';",
        `import Preview from '${withoutExtension(path).split(sep).join('/')}';`,
        '',
        "createRoot(document.getElementById('ds-preview') as HTMLElement).render(createElement(Preview));",
        '',
      ].join('\n'),
    );
    return { name: component, entry };
  });
  writeFileSync(join(gen, 'entries.json'), `${JSON.stringify(entries, null, 2)}\n`);

  // Rolldown's native binding refuses plugin objects made inside a Vitest worker's sandbox.
  const run = spawnSync(process.execPath, [join(root, 'scripts/design-system/preview-runner.mjs'), join(gen, 'entries.json')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'production', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true', NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  if (run.status !== 0) throw new Error(`the preview build failed:\n${run.stdout}${run.stderr}`);

  return previews.map(({ component, meta }) => ({
    component,
    meta,
    html: renderPreviewHtml({ meta, title: component, script: readFileSync(join(raw, `${component}.js`), 'utf8') }),
  }));
}
