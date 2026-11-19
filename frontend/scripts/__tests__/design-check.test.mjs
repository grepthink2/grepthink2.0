// @vitest-environment node
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkTree } from '../design-system/check.mjs';
import { NAMESPACE } from '../design-system/exports.mjs';
import { baseLayer } from '../design-system/styles.mjs';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'design-check-'));
const good = join(scratch, 'good');

const header = (components, namespace = NAMESPACE) =>
  `/* @ds-bundle: ${JSON.stringify({ format: 4, namespace, components: components.map((name) => ({ name })) })} */`;
const BUNDLE = `${header(['Button'])}\n(function(R){window.${NAMESPACE}={Button:function(){return R.createElement("button")}}})(React);\n`;
const TOKENS = {
  name: 'GrepThink Design System',
  version: 1,
  color: {
    themes: [{ id: 'light', name: 'Light' }],
    tokens: [
      { name: 'gt-a', value: '#ffffff', usage: '' },
      { name: 'gt-b', value: '{gt-a}', usage: '' },
    ],
  },
  type: { fonts: [], families: {}, groups: [] },
  meta: {},
};
const CSS = [
  ':root {\n  --gt-ring: 0 0 0 2px var(--gt-a);\n}',
  baseLayer(['[class^="gt-"]', '[class*=" gt-"]'], { lineHeight: '1.5', color: 'var(--gt-b)' }),
  '.gt-button{color:red}',
  '',
].join('\n');

function write(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

beforeAll(() => {
  write(good, 'project/tokens.json', JSON.stringify(TOKENS));
  write(good, 'project/components/bundle.js', BUNDLE);
  write(good, 'project/components/bundle.css', CSS);
  write(good, 'project/components/index.d.ts', "import * as React from 'react';\n");
  write(good, 'project/components/lib/react.production.min.js', readFileSync(join(frontend, 'node_modules/react18/umd/react.production.min.js'), 'utf8'));
  write(good, 'project/components/lib/react-dom.production.min.js', readFileSync(join(frontend, 'node_modules/react-dom18/umd/react-dom.production.min.js'), 'utf8'));
  write(good, 'report.json', JSON.stringify({ icons: ['Trash2'] }));
  write(good, 'src/styles/tokens/colors.css', ':root {\n  --gt-a: #FFF;\n  --gt-b: var(--gt-a);\n  --gt-ring: 0 0 0 2px var(--gt-a);\n}\n');
  write(good, 'src/a.tsx', "import { Trash2 } from 'lucide-react';\n");
});

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let copies = 0;
/** checkTree over a copy of the good tree, changed by `change(root)`. */
function check(change = () => {}) {
  const root = join(scratch, `copy-${copies++}`);
  cpSync(good, root, { recursive: true });
  change(root);
  return checkTree(join(root, 'project'), { srcDir: join(root, 'src') });
}

const tokensWith = (change) => (root) => {
  const tokens = structuredClone(TOKENS);
  change(tokens);
  write(root, 'project/tokens.json', JSON.stringify(tokens));
};

describe('checkTree', () => {
  it('finds nothing wrong with a publishable tree', () => {
    expect(check()).toEqual([]);
  });

  it('needs every file the build writes', () => {
    expect(check((root) => rmSync(join(root, 'project/components/bundle.css')))).toEqual(['missing components/bundle.css']);
    expect(check((root) => rmSync(join(root, 'project/components/lib/react-dom.production.min.js')))).toEqual([
      'missing components/lib/react-dom.production.min.js',
    ]);
  });

  it("refuses the files the page generates", () => {
    expect(check((root) => write(root, 'project/tokens.css', ''))).toEqual(["tokens.css is the page's to generate; the build must not write it"]);
    expect(check((root) => write(root, 'project/manifest.json', '{}'))).toEqual(["manifest.json is the page's to generate; the build must not write it"]);
    expect(check((root) => write(root, 'project/api/Button.json', '{}'))).toEqual(["api is the page's to generate; the build must not write it"]);
  });

  it('holds bundle.js to its size and to what an inline script may contain', () => {
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.js'), `/*${'x'.repeat(6 * 1024 * 1024)}*/`))).toEqual([
      'bundle.js is over 6 MB',
    ]);
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.js'), 'var s="</script>";'))).toEqual(['bundle.js contains </script']);
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.js'), 'var s="<!--";'))).toEqual(['bundle.js contains <!--']);
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.js'), "\nexport default 1;\n"))).toContain(
      'bundle.js has a top-level import or export',
    );
  });

  it('holds bundle.css and each library to their sizes', () => {
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.css'), `/*${'x'.repeat(2 * 1024 * 1024)}*/`))).toEqual([
      'bundle.css is over 2 MB',
    ]);
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.css'), '.gt-x{content:"</style>"}'))).toEqual(['bundle.css contains </style']);
    expect(check((root) => appendFileSync(join(root, 'project/components/lib/react.production.min.js'), `/*${'x'.repeat(2 * 1024 * 1024)}*/`))).toEqual([
      'components/lib/react.production.min.js is over 2 MB',
    ]);
  });

  it('reads the header and finds each of its names on the namespace after a load in jsdom', () => {
    const bundle = (text) => (root) => write(root, 'project/components/bundle.js', text);
    expect(check(bundle(BUNDLE.split('\n').slice(1).join('\n')))).toEqual(['bundle.js has no @ds-bundle header on line 1']);
    expect(check(bundle(BUNDLE.replace(header(['Button']), header(['Button'], 'Other_1'))))).toEqual([
      `bundle.js header names namespace Other_1, not ${NAMESPACE}`,
    ]);
    expect(check(bundle(BUNDLE.replace(header(['Button']), header(['Button', 'Card']))))).toEqual([
      `Card is in the bundle header but not on window.${NAMESPACE}`,
    ]);
    expect(check(bundle(`${header(['Button'])}\nwindow.${NAMESPACE}={Button:1,__errors:{Card:"boom"}};\n`))).toEqual([
      `window.${NAMESPACE}.__errors is not empty: {"Card":"boom"}`,
    ]);
    expect(check(bundle(`${header(['Button'])}\nthrow new Error("boom");\n`))).toEqual(['bundle.js does not load after React 18: boom']);
  });

  it("holds tokens.json to the format's shape, names and colour values", () => {
    expect(check((root) => write(root, 'project/tokens.json', '{'))).toEqual(['tokens.json is not valid JSON']);
    expect(check(tokensWith((t) => (t.spacing = { tokens: {} })))).toEqual(['tokens.json: spacing.tokens is not a list']);
    expect(check(tokensWith((t) => t.color.tokens.push({ name: 'bad name', value: '#000' })))).toEqual(['tokens.json: "bad name" is not a valid token name']);
    expect(check(tokensWith((t) => (t.size = { tokens: [{ name: 'gt-a', value: '1px' }] })))).toEqual(['tokens.json: gt-a appears twice']);
    expect(check(tokensWith((t) => (t.color.tokens[0].value = 'red')))).toEqual([
      'tokens.json: colour gt-a has value "red", which the format does not accept',
    ]);
    expect(check(tokensWith((t) => (t.color.tokens[1].value = '{gt-zz}')))).toEqual([
      'tokens.json: colour gt-b aliases gt-zz, which is not a colour token',
    ]);
    expect(
      check(
        tokensWith((t) => {
          for (let i = 0; i < 11; i++) t[`family${i}`] = { tokens: [] };
        }),
      ),
    ).toEqual(['tokens.json has 13 families; the format allows 12']);
    expect(check(tokensWith((t) => (t.size = { tokens: Array.from({ length: 61 }, (_, i) => ({ name: `gt-s-${i}`, value: '1px' })) })))).toEqual([
      'tokens.json: size has 61 tokens; the format allows 60',
    ]);
  });

  it('needs each declared token in tokens.json or still declared in bundle.css', () => {
    expect(check((root) => write(root, 'project/components/bundle.css', CSS.replace('--gt-ring: 0 0 0 2px var(--gt-a);', '')))).toEqual([
      '--gt-ring (styles/tokens/colors.css) is neither in tokens.json nor declared in bundle.css',
    ]);
  });

  it("keeps every kit rule inside the base layer's scope", () => {
    expect(check((root) => appendFileSync(join(root, 'project/components/bundle.css'), '.dpf__cal{color:red}\n'))).toEqual([
      "bundle.css: .dpf__cal is outside the base layer's scope",
    ]);
    expect(check((root) => write(root, 'project/components/bundle.css', ':root {\n  --gt-ring: 0 0 0 2px var(--gt-a);\n}\n.gt-button{color:red}\n'))).toEqual([
      'bundle.css has no base layer',
    ]);
  });

  it('needs the icons built in to be those src/ imports now', () => {
    expect(check((root) => write(root, 'report.json', JSON.stringify({ icons: ['Plus'] })))).toEqual([
      'the icons built in differ from those src/ imports: missing Trash2; no longer imported Plus',
    ]);
    expect(check((root) => write(root, 'src/b.tsx', "import { Plus } from 'lucide-react';\n"))).toEqual([
      'the icons built in differ from those src/ imports: missing Plus',
    ]);
  });
});
