/**
 * The design-system bundle: the kit as one classic script for a page that has React 18
 * (`components/bundle.js`), and the stylesheet Vite compiles with it.
 *
 * buildBundle writes the entry and the icon map under .design-system/gen/, runs the library
 * build of vite.design.config.ts and returns its raw output. The build runs in a Node process of
 * its own: Rolldown's native binding refuses plugin objects made inside a Vitest worker's sandbox.
 *
 * finishBundleJs makes the script publishable: the `@ds-bundle` header on line 1, no text that
 * would end or confuse an inline `<script>`, no module statement, and within the format's size.
 * The header names the cards: the components with a guide and a preview. The page draws a card for
 * every name in it, so a companion, hook or helper stays on the namespace without one.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { NAMESPACE, collectKitExports, writeEntry } from './exports.mjs';
import { collectLucideIcons, writeIconMap } from './icons.mjs';

export const BUNDLE_JS_CAP = 6 * 1024 * 1024;

/**
 * U+FFFD, which the artifact refuses in a file it is sent (it reads as text decoded badly). The
 * Markdown parser the bundle carries uses it for an invalid character reference; in a bundle it can
 * sit only in a string, a template or a regular expression, where its escape means the same.
 */
export const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);
const ESCAPED_REPLACEMENT_CHARACTER = `${'\\'}ufffd`;

const HEADER = /^\/\* @ds-bundle: (\{.*\}) \*\/$/;
const MODULE_STATEMENT = /^[ \t]*(?:import[ \t]*[\w{*'"]|export[ \t]*[\w{*])/m;

/**
 * @param {{ root: string }} options the frontend directory
 * @returns {Promise<{ js: string; css: string; exports: { name: string; kind: string }[] }>}
 */
export async function buildBundle({ root }) {
  const kit = collectKitExports(join(root, 'src/components'));
  writeEntry(kit, join(root, '.design-system/gen/entry.ts'), { runtimeDir: join(root, 'design-system/runtime') });
  writeIconMap(collectLucideIcons(join(root, 'src')), join(root, '.design-system/gen/icons.ts'));
  const vite = join(root, 'node_modules/vite/bin/vite.js');
  const run = spawnSync(process.execPath, [vite, 'build', '--config', 'vite.design.config.ts'], {
    cwd: root,
    encoding: 'utf8',
    // Production builds of the dependencies whatever the caller's NODE_ENV (Vitest sets "test").
    env: { ...process.env, NODE_ENV: 'production', VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true' },
  });
  if (run.status !== 0) throw new Error(`the design-system build failed:\n${run.stdout}${run.stderr}`);
  return {
    js: readFileSync(join(root, '.design-system/raw/bundle.js'), 'utf8'),
    css: readFileSync(join(root, '.design-system/raw/bundle.css'), 'utf8'),
    exports: [...kit.map(({ name, kind }) => ({ name, kind })), { name: 'Icon', kind: 'component' }],
  };
}

/**
 * The header's JSON, or null when line 1 is not a header.
 * @param {string} bundle
 */
export function parseBundleHeader(bundle) {
  const match = HEADER.exec(bundle.slice(0, bundle.indexOf('\n') === -1 ? undefined : bundle.indexOf('\n')));
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * The problems that keep a finished bundle from being published.
 * @param {string} bundle
 * @returns {string[]}
 */
export function bundleJsProblems(bundle) {
  const problems = [];
  if (Buffer.byteLength(bundle) > BUNDLE_JS_CAP) problems.push('bundle.js is over 6 MB');
  if (bundle.includes('</script')) problems.push('bundle.js contains </script');
  if (bundle.includes('<!--')) problems.push('bundle.js contains <!--');
  if (MODULE_STATEMENT.test(bundle)) problems.push('bundle.js has a top-level import or export');
  if (bundle.includes(REPLACEMENT_CHARACTER)) problems.push('bundle.js contains U+FFFD, which the artifact refuses');
  return problems;
}

/**
 * @param {string} js the raw library build
 * @param {{ name: string; kind: string }[]} exports
 * @param {Iterable<string>} cards the exports with a guide and a preview, which the header names in
 *   export order
 * @returns {string} the publishable bundle.js
 */
export function finishBundleJs(js, exports, cards) {
  const wanted = new Set(cards);
  const unknown = [...wanted].filter((name) => !exports.some((entry) => entry.name === name));
  if (unknown.length) throw new Error(`a card names no bundle export: ${unknown.join(', ')}`);
  const names = [...new Set(exports.map(({ name }) => name))].filter((name) => wanted.has(name));
  const header = { format: 4, namespace: NAMESPACE, components: names.map((name) => ({ name })) };
  const code = js
    .replaceAll('</script', '<\\/script')
    .replaceAll('<!--', '<\\!--')
    .replaceAll(REPLACEMENT_CHARACTER, ESCAPED_REPLACEMENT_CHARACTER);
  const bundle = `/* @ds-bundle: ${JSON.stringify(header)} */\n${code}`;
  const [problem] = bundleJsProblems(bundle);
  if (problem) throw new Error(problem);
  return bundle;
}

/**
 * A jsdom window with each script run in order, as classic scripts run on a page.
 * @param {string[]} scripts
 */
export function loadInJsdom(scripts) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
  for (const script of scripts) dom.window.eval(script);
  return dom.window;
}
