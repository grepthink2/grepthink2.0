// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { collectKitExports } from '../design-system/exports.mjs';
import { PREVIEW_FOLDERS_LEFT_OUT, collectPreviews } from '../design-system/previews.mjs';

const kitDir = fileURLToPath(new URL('../../src/components/', import.meta.url));

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
