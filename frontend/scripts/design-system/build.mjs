/**
 * `npm run design:build`: the Design System artifact's code-derived files, from the shared kit and
 * its tokens, written to .design-system/project/ laid out as they are published:
 *
 *   README.md                              readme.mjs, the brand book (design-system/README.md)
 *   tokens.json                            tokens.mjs
 *   tokens.css                             tokens.mjs, tokens.json compiled
 *   components/bundle.js                   bundle.mjs (the kit, Icon, React from the page)
 *   components/bundle.css                  styles.mjs
 *   components/index.d.ts                  types.mjs
 *   components/lib/react*.production.min.js  React and React DOM 18.3.1, from npm
 *   components/<Name>/preview.html         previews.mjs, from each kit folder's <Folder>.preview.tsx
 *   components/<Name>/README.md            guides.mjs, the README.md beside each preview
 *
 * and .design-system/report.json beside it (exports, the cards the bundle header names, icons,
 * tokens carried and kept, sizes, the guides with their size and the previews with their group,
 * height and size, the React 18 test skips, components whose props type has another name). The page
 * generates manifest.json and api/: the build never writes them. It writes tokens.css because the
 * page of a system synced from code generates nothing. Exits 1 on any error.
 */

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBundle, finishBundleJs } from './bundle.mjs';
import { collectKitExports } from './exports.mjs';
import { collectLucideIcons } from './icons.mjs';
import { collectGuides } from './guides.mjs';
import { buildPreviews, kitCards } from './previews.mjs';
import { brandBook } from './readme.mjs';
import { buildCss, kitRulesOf } from './styles.mjs';
import { buildTokens, tokensCss } from './tokens.mjs';
import { buildTypes, propsNotes } from './types.mjs';

const LIBRARIES = {
  'react.production.min.js': 'node_modules/react18/umd/react.production.min.js',
  'react-dom.production.min.js': 'node_modules/react-dom18/umd/react-dom.production.min.js',
};

function gitRef(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const sha = git('rev-parse', '--short', 'HEAD');
  let branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  if (branch === 'HEAD') branch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'detached';
  return `${branch}@${sha}`;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

/**
 * @param {string} root the frontend directory
 * @returns {Promise<object>} the report
 */
export async function build(root) {
  const out = join(root, '.design-system/project');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'components/lib'), { recursive: true });

  const kit = collectKitExports(join(root, 'src/components'));
  const withIcon = [...kit, { name: 'Icon' }];
  const cards = kitCards(root, withIcon);
  const bundle = await buildBundle({ root });
  const bundleJs = finishBundleJs(bundle.js, bundle.exports, cards.map((card) => card.component));

  const tokensDir = join(root, 'src/styles/tokens');
  const tokenFiles = readdirSync(tokensDir)
    .filter((file) => file.endsWith('.css'))
    .sort()
    .map((file) => ({ path: `src/styles/tokens/${file}`, css: readFileSync(join(tokensDir, file), 'utf8') }));
  const meta = { source: 'code', repo: 'grepthink2/grepthink2.0', ref: gitRef(root), built: new Date().toISOString() };
  const { tokens, carried, kept } = buildTokens(tokenFiles, meta);

  const bundleCss = buildCss({
    rawCss: bundle.css,
    keyframesCss: readFileSync(join(root, 'src/styles/keyframes.css'), 'utf8'),
    tokenCss: tokenFiles.map((file) => file.css).join('\n'),
    tokenNames: carried,
    utilityCss: kitRulesOf(readFileSync(join(root, 'src/index.css'), 'utf8')),
  });

  const types = await buildTypes({ root, exports: kit });
  const props = propsNotes(types, bundle.exports);
  const previews = await buildPreviews({ root, exports: kit });
  const guides = collectGuides(join(root, 'src/components'), cards);
  const icons = collectLucideIcons(join(root, 'src'));

  writeFileSync(join(out, 'README.md'), brandBook(readFileSync(join(root, 'design-system/README.md'), 'utf8'), icons));
  writeFileSync(join(out, 'components/bundle.js'), bundleJs);
  writeFileSync(join(out, 'components/bundle.css'), bundleCss);
  writeFileSync(join(out, 'components/index.d.ts'), types);
  writeFileSync(join(out, 'tokens.json'), `${JSON.stringify(tokens, null, 2)}\n`);
  writeFileSync(join(out, 'tokens.css'), tokensCss(tokens));
  for (const [name, from] of Object.entries(LIBRARIES)) copyFileSync(join(root, from), join(out, 'components/lib', name));
  for (const { component, html } of previews) {
    mkdirSync(join(out, 'components', component), { recursive: true });
    writeFileSync(join(out, 'components', component, 'preview.html'), html);
  }
  for (const { component, text } of guides) {
    mkdirSync(join(out, 'components', component), { recursive: true });
    writeFileSync(join(out, 'components', component, 'README.md'), text);
  }

  const sizes = {};
  for (const path of ['README.md', 'components/bundle.js', 'components/bundle.css', 'components/index.d.ts', 'tokens.json', 'tokens.css', ...Object.keys(LIBRARIES).map((n) => `components/lib/${n}`)]) {
    sizes[path] = statSync(join(out, path)).size;
  }
  const report = {
    exports: bundle.exports,
    cards: cards.map((card) => card.component),
    icons,
    tokens: { carried: [...carried], kept },
    props,
    sizes,
    guides: guides.map(({ component, text }) => ({ name: component, bytes: Buffer.byteLength(text) })),
    previews: previews.map(({ component, meta, html }) => ({
      name: component,
      group: meta.group,
      height: meta.height,
      bytes: Buffer.byteLength(html),
    })),
    skips: JSON.parse(readFileSync(join(root, 'design-system/react18-skips.json'), 'utf8')),
  };
  writeFileSync(join(root, '.design-system/report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function summary(report) {
  const count = (kind) => report.exports.filter((e) => e.kind === kind).length;
  return [
    'design:build → .design-system/project',
    `  exports: ${report.exports.length} (${count('component')} components, ${count('hook')} hooks, ${count('helper')} helpers)`,
    `  cards (the bundle header): ${report.cards.length}`,
    `  icons: ${report.icons.length}`,
    `  tokens: ${report.tokens.carried.length} in tokens.json, ${report.tokens.kept.length} kept in bundle.css:`,
    ...report.tokens.kept.map(({ name, reason }) => `    --${name}: ${reason}`),
    `  props under another name: ${report.props.join('; ') || 'none'}`,
    `  sizes: ${Object.entries(report.sizes).map(([path, bytes]) => `${path} ${kb(bytes)}`).join(', ')}`,
    `  guides: ${report.guides.length}${report.guides.length ? ` (the largest ${kb(Math.max(...report.guides.map((g) => g.bytes)))})` : ''}`,
    `  previews: ${report.previews.length}${report.previews.length ? ` (the largest ${kb(Math.max(...report.previews.map((p) => p.bytes)))}):` : ''}`,
    ...report.previews.map(({ name, group, height, bytes }) => `    ${name}: ${group}, ${height}px, ${kb(bytes)}`),
    `  React 18 test skips: ${report.skips.length}`,
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  try {
    console.log(summary(await build(root)));
  } catch (error) {
    console.error(`design:build failed: ${error.message}`);
    process.exit(1);
  }
}
