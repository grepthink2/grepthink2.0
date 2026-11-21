// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildBundle, finishBundleJs } from '../design-system/bundle.mjs';
import { NAMESPACE, collectKitExports } from '../design-system/exports.mjs';
import {
  CLOCKS,
  PREVIEW_FOLDERS_LEFT_OUT,
  buildPreviews,
  checkPreview,
  collectPreviews,
  renderPreviewHtml,
} from '../design-system/previews.mjs';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const kitDir = join(frontend, 'src/components');
const lib = (file) => readFileSync(join(frontend, 'node_modules', file), 'utf8');
const LIBS = [lib('react18/umd/react.production.min.js'), lib('react-dom18/umd/react-dom.production.min.js')];

const scratch = mkdtempSync(join(tmpdir(), 'design-previews-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let trees = 0;
/** Writes `files` ({ 'Folder/File.tsx': source }) under a fresh directory and returns it. */
function tree(files) {
  const root = join(scratch, `tree-${trees++}`);
  mkdirSync(root, { recursive: true });
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

const EXPORTS = [
  { name: 'Alpha', file: 'Alpha/Alpha.tsx', kind: 'component' },
  { name: 'MarkdownText', file: 'Markdown/MarkdownText.tsx', kind: 'component', isDefault: true },
];

/** A preview file with `meta` as written, and the default export its folder asks for. */
const preview = (folder, meta, extra = '') =>
  [
    "import type { PreviewMeta } from '@components/previewMeta';",
    `import { ${folder === 'Markdown' ? 'MarkdownText' : folder} } from './${folder === 'Markdown' ? 'MarkdownText' : folder}';`,
    extra,
    `export const meta: PreviewMeta = ${meta};`,
    '',
    `export default function ${folder}Preview() {`,
    '  return null;',
    '}',
    '',
  ].join('\n');

describe('collectPreviews', () => {
  it("reads each kit folder's preview and its meta, parsed from the source text", () => {
    const root = tree({
      'Alpha/Alpha.tsx': 'export function Alpha() { return null; }\n',
      'Alpha/Alpha.preview.tsx': preview(
        'Alpha',
        "{\n  group: 'Primitives', // the manifest's group\n  height: 220,\n  subtitle: \"Six variants, it's sized\",\n}",
      ),
      'Markdown/MarkdownText.tsx': 'export default function MarkdownText() { return null; }\n',
      'Markdown/Markdown.preview.tsx': preview('Markdown', "{ group: 'Display', height: 300, component: 'MarkdownText', expects: '.gt-md' }"),
      'Beta/Beta.tsx': 'export function Beta() { return null; }\n',
      'hooks/hooks.preview.tsx': preview('hooks', "{ group: 'Display', height: 100 }"),
      'previewMeta.ts': 'export type PreviewMeta = object;\n',
    });
    expect(collectPreviews(root, EXPORTS)).toEqual([
      {
        folder: 'Alpha',
        component: 'Alpha',
        file: 'Alpha/Alpha.preview.tsx',
        path: join(root, 'Alpha/Alpha.preview.tsx'),
        meta: { group: 'Primitives', height: 220, subtitle: "Six variants, it's sized" },
      },
      {
        folder: 'Markdown',
        component: 'MarkdownText',
        file: 'Markdown/Markdown.preview.tsx',
        path: join(root, 'Markdown/Markdown.preview.tsx'),
        meta: { group: 'Display', height: 300, component: 'MarkdownText', expects: '.gt-md' },
      },
    ]);
  });

  it("reads the kit's own previews", () => {
    const previews = collectPreviews(kitDir, collectKitExports(kitDir));
    expect(previews.find((entry) => entry.folder === 'Button')).toMatchObject({
      component: 'Button',
      file: 'Button/Button.preview.tsx',
      meta: { group: 'Primitives' },
    });
  });

  it('leaves out the folders that hold no kit component', () => {
    expect(PREVIEW_FOLDERS_LEFT_OUT).toEqual(['ErrorBoundary', 'hooks', 'icons', '__tests__']);
  });

  /** collectPreviews over one Alpha folder whose preview is `source`. */
  const collectAlpha = (source) =>
    collectPreviews(tree({ 'Alpha/Alpha.tsx': 'export function Alpha() {}\n', 'Alpha/Alpha.preview.tsx': source }), EXPORTS);

  it('refuses a meta that is missing or not a plain literal', () => {
    const file = 'Alpha/Alpha.preview.tsx';
    expect(() => collectAlpha('export default function AlphaPreview() { return null; }\n')).toThrow(
      `${file}: export const meta is missing`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 40 + 180 }"))).toThrow(
      `${file}: meta must be an object literal of strings and numbers`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: `Primitives`, height: 220 }"))).toThrow(
      `${file}: meta must be an object literal of strings and numbers`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ ...base, height: 220 }", "const base = { group: 'Primitives' };"))).toThrow(
      `${file}: meta must be an object literal of strings and numbers`,
    );
    expect(() => collectAlpha(preview('Alpha', 'makeMeta()'))).toThrow(`${file}: meta must be an object literal of strings and numbers`);
  });

  it('refuses an unknown group, a height outside 40–4000 and a component the bundle does not export', () => {
    const file = 'Alpha/Alpha.preview.tsx';
    expect(() => collectAlpha(preview('Alpha', "{ group: 'X', height: 220 }"))).toThrow(`${file}: unknown group "X"`);
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 20 }"))).toThrow(`${file}: height 20 is outside 40–4000`);
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 4001 }"))).toThrow(`${file}: height 4001 is outside 40–4000`);
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220, component: 'X' }"))).toThrow(
      `${file}: component "X" is not a bundle export`,
    );
  });

  it("refuses a meta with a key it does not know, or without its group and height", () => {
    const file = 'Alpha/Alpha.preview.tsx';
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220, expect: '[role=dialog]' }"))).toThrow(
      `${file}: meta has an unknown key "expect"`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives' }"))).toThrow(`${file}: meta needs a group and a height`);
  });

  it('needs the default export its folder names, and imports from the kit, lucide-react and react only', () => {
    const file = 'Alpha/Alpha.preview.tsx';
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220 }").replace('AlphaPreview', 'Gallery'))).toThrow(
      `${file}: export default function AlphaPreview is missing`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220 }", "import { api } from '@/lib/api';"))).toThrow(
      `${file}: imports "@/lib/api"; a preview imports only the kit, lucide-react and react`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220 }", "import './Alpha.scss';"))).toThrow(
      `${file}: imports "./Alpha.scss"; a preview imports only the kit, lucide-react and react`,
    );
    expect(() => collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220 }", "import { x } from '../../lib/x';"))).toThrow(
      `${file}: imports "../../lib/x"; a preview imports only the kit, lucide-react and react`,
    );
    const fine = [
      "import { useState } from 'react';",
      "import { Plus } from 'lucide-react';",
      "import { Beta } from '@components/Beta/Beta';",
      "import { Gamma } from '@/components/Gamma/Gamma';",
      "import { Delta } from '../Delta/Delta';",
      "import type { Row } from '@/lib/rows';",
    ].join('\n');
    expect(collectAlpha(preview('Alpha', "{ group: 'Primitives', height: 220 }", fine))).toHaveLength(1);
  });
});

describe('renderPreviewHtml', () => {
  const html = renderPreviewHtml({ meta: { group: 'Primitives', height: 220 }, script: 'void 0;', title: 'Button' });

  it('puts the @dsCard marker on line 1, then a small complete document with one script', () => {
    const lines = html.split('\n');
    expect(lines[0]).toBe('<!-- @dsCard group="Primitives" height=220 -->');
    expect(lines[1]).toBe('<!doctype html>');
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<title>Button</title>');
    expect(html).toContain(
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&amp;family=Poppins:wght@400;500;600;700&amp;display=swap">',
    );
    expect(html).toMatch(/body \{ margin: 0; padding: 16px; background: var\(--gt-surface\); font-family: var\(--gt-font-sans\);/);
    expect(html).toContain('<div id="ds-preview"></div>');
    expect(html.match(/<script/g)).toHaveLength(1);
  });

  it('escapes a subtitle in the marker and the strings that would end the script', () => {
    const marked = renderPreviewHtml({
      meta: { group: 'Display', height: 300, subtitle: 'The "status" map & <more>' },
      script: 'var a = "</script>", b = "<!-- x";',
      title: 'Badge',
    });
    expect(marked.split('\n')[0]).toBe('<!-- @dsCard group="Display" height=300 subtitle="The &quot;status&quot; map &amp; &lt;more&gt;" -->');
    expect(marked).toContain('var a = "<\\/script>", b = "<\\!-- x";');
    expect(marked.match(/<\/script/g)).toHaveLength(1);
  });
});

/** A bundle that puts a Box and a Clock component on the namespace. */
const BUNDLE = [
  '(function (R) {',
  `  window.${NAMESPACE} = {`,
  "    Box: function (props) { return R.createElement('div', { className: 'gt-box', role: props.role }, props.children); },",
  "    Clock: function () { return R.createElement('p', null, String(new Date().getFullYear())); },",
  "    Broken: function () { throw new Error('Broken renders nothing'); },",
  '  };',
  '})(React);',
].join('\n');
const TOKENS = JSON.stringify({ color: { tokens: [{ name: 'gt-surface', value: '#ffffff' }] }, type: { fonts: [], families: {}, groups: [] } });

/** A preview document whose script renders `element` (source text) into the root. */
const page = (element, { meta = { group: 'Display', height: 120 }, before = '' } = {}) =>
  renderPreviewHtml({
    meta,
    title: 'Box',
    script: `${before}(function () { var ns = window.${NAMESPACE}; ReactDOM.createRoot(document.getElementById('ds-preview')).render(${element}); })();`,
  });
const check = (html, expects) => checkPreview({ html, libs: LIBS, bundleJs: BUNDLE, bundleCss: '.gt-box{color:red}', tokensJson: TOKENS, expects });

describe('checkPreview', () => {
  it('finds nothing wrong with a preview that renders the bundle', async () => {
    expect(await check(page("React.createElement(ns.Box, { role: 'dialog' }, 'Hello')"), '[role="dialog"]')).toEqual([]);
  });

  it('reports a script that throws, as it runs or as it renders', async () => {
    expect(await check(page('null', { before: "throw new Error('boom');" }))).toEqual(['threw: boom', '#ds-preview is empty']);
    const problems = await check(page('React.createElement(ns.Broken)'));
    expect(problems).toContain('threw: Broken renders nothing');
    expect(problems).toContain('#ds-preview is empty');
  });

  it('reports a console error, quoting it', async () => {
    expect(await check(page("React.createElement(ns.Box, null, 'Hi')", { before: "console.error('Warning: %s is odd', 'Box');" }))).toEqual([
      'console.error: Warning: Box is odd',
    ]);
  });

  it('reports an empty root, and an `expects` that matches nothing', async () => {
    expect(await check(page('null'))).toEqual(['#ds-preview is empty']);
    expect(await check(page("React.createElement(ns.Box, null, 'Hi')"), '[role="dialog"]')).toEqual([
      'nothing in the document matches [role="dialog"]',
    ]);
  });

  it('reports a render that depends on the clock', async () => {
    expect(await check(page('React.createElement(ns.Clock)'))).toEqual([
      `renders differently with the clock at ${CLOCKS[0]} and at ${CLOCKS[1]}`,
    ]);
  });

  it('holds the document to the format: marker, size, tags, scripts and fetches', async () => {
    const good = page("React.createElement(ns.Box, null, 'Hi')");
    expect(await check(good.replace('<div id="ds-preview"></div>', '<div id="ds-preview"></div><iframe src="about:blank"></iframe>'))).toEqual([
      'preview.html holds an <iframe>',
    ]);
    expect(await check(good.replace('</body>', '<embed src="x.swf"><object data="x"></object></body>'))).toEqual([
      'preview.html holds an <object>',
      'preview.html holds an <embed>',
    ]);
    expect(await check(good.split('\n').slice(1).join('\n'))).toEqual(['line 1 is not a @dsCard marker with a group and a height']);
    expect(await check(good.replace('group="Display" height=120', 'group="Other" height=120'))).toEqual([
      '@dsCard group "Other" is not one of Primitives, Display, Feedback, Navigation',
    ]);
    expect(await check(good.replace('height=120', 'height=20'))).toEqual(['@dsCard height 20 is outside 40–4000']);
    expect(await check(`${good}<!--${'x'.repeat(256 * 1024)}-->`)).toEqual(['preview.html is over 256 KB']);
    expect(await check(good.replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>'))).toEqual([
      'preview.html holds 2 scripts; a preview has one inline script',
    ]);
    expect(await check(good.replace('</head>', '<link rel="stylesheet" href="https://cdn.example.com/x.css"></head>'))).toEqual([
      'preview.html fetches https://cdn.example.com/x.css; only the Google Fonts stylesheet may be fetched',
    ]);
  });

  it('reports a bundle that does not load', async () => {
    const problems = await checkPreview({
      html: page("React.createElement(ns.Box, null, 'Hi')"),
      libs: LIBS,
      bundleJs: 'throw new Error("no bundle");',
      bundleCss: '',
      tokensJson: TOKENS,
    });
    expect(problems[0]).toBe('the bundle does not load: no bundle');
  });
});

describe('buildPreviews on the kit', () => {
  let previews;
  let bundleJs;
  let bundleCss;
  let tokensJson;

  beforeAll(async () => {
    const kit = collectKitExports(kitDir);
    const bundle = await buildBundle({ root: frontend });
    bundleJs = finishBundleJs(bundle.js, bundle.exports);
    bundleCss = bundle.css;
    tokensJson = JSON.stringify({ color: { tokens: [] }, type: { fonts: [], families: {}, groups: [] } });
    previews = await buildPreviews({ root: frontend, exports: kit });
  }, 120_000);

  it('compiles each preview into a document that renders on React 18 against the built bundle', async () => {
    const names = previews.map((preview) => preview.component);
    expect(names).toContain('Button');
    expect(names).toContain('Modal');
    for (const { component, html, meta } of previews.filter((p) => ['Button', 'Modal'].includes(p.component))) {
      const problems = await checkPreview({ html, libs: LIBS, bundleJs, bundleCss, tokensJson, expects: meta.expects });
      expect({ component, problems }).toEqual({ component, problems: [] });
    }
  }, 60_000);

  it("reads the kit from the bundle's namespace instead of carrying its source", () => {
    const button = previews.find((preview) => preview.component === 'Button').html;
    expect(button).not.toContain('gt-button__faces');
    expect(bundleJs).toContain('gt-button__faces');
    expect(button).toContain(NAMESPACE);
  });
});
