// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { collectKitExports } from '../design-system/exports.mjs';
import { GUIDE_CAP, checkGuide, collectGuides } from '../design-system/guides.mjs';
import { collectPreviews, iconPreview } from '../design-system/previews.mjs';

const kitDir = fileURLToPath(new URL('../../src/components/', import.meta.url));
const runtimeDir = fileURLToPath(new URL('../../design-system/runtime/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'design-guides-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const EXPORTS = [{ name: 'Button' }, { name: 'Modal' }, { name: 'Tabs' }];
const PREVIEW = [
  "import { Trash2 } from 'lucide-react';",
  "import { Button } from './Button';",
  'export default function ButtonPreview() {',
  '  return (',
  '    <div>',
  '      <Button',
  '        variant="danger-ghost"',
  '        size="sm"',
  '        iconLeft={<Trash2 size={14} />}',
  '      >',
  '        Remove',
  '      </Button>',
  '      <Button variant="outline" onClick={() => setOpen(!open)}>Cancel</Button>',
  '    </div>',
  '  );',
  '}',
].join('\n');

const fence = (code) => `\`\`\`jsx\n${code}\n\`\`\``;
/** A guide with a good summary and `body` after it. */
const guide = (body) => `The button for every clickable action.\n\n## Use\n\n${body}\n`;
const check = (text) => checkGuide({ text, previewSource: PREVIEW, exports: EXPORTS });

describe('checkGuide', () => {
  it('passes a guide whose examples appear in its preview, prop for prop, whatever the line breaks', () => {
    expect(check(guide(fence('<Button variant="danger-ghost" size="sm" iconLeft={<Trash2 size={14} />}>Remove</Button>')))).toEqual([]);
    expect(check(guide(fence('<Button variant="outline"\n  onClick={() => setOpen(!open)}>\n  Cancel\n</Button>')))).toEqual([]);
  });

  it('refuses an empty guide and one over 64 KB', () => {
    expect(check('')).toEqual(['the guide is empty']);
    expect(check(guide(`${fence('<Button variant="outline" onClick={() => setOpen(!open)}>Cancel</Button>')}\n\n${'x'.repeat(GUIDE_CAP)}`))).toEqual([
      'the guide is over 64 KB',
    ]);
  });

  it('needs a one-sentence summary first, under 200 characters and ending with a period', () => {
    const example = fence('<Button variant="outline" onClick={() => setOpen(!open)}>Cancel</Button>');
    const SUMMARY = 'the first paragraph is not a one-sentence summary ending with a period, under 200 characters';
    expect(check(`## Use\n\nThe button.\n\n${example}\n`)).toEqual([SUMMARY]);
    expect(check(`The button for every clickable action\n\n${example}\n`)).toEqual([SUMMARY]);
    expect(check(`The button. It does things.\n\n${example}\n`)).toEqual([SUMMARY]);
    expect(check(`${'A very long summary '.repeat(10)}is long.\n\n${example}\n`)).toEqual([SUMMARY]);
    expect(check(`The button for every action, with \`variant\` and \`size\` (sm, md, lg).\n\n${example}\n`)).toEqual([]);
  });

  it('refuses a leading # heading: the page adds the name', () => {
    expect(check(`# Button\n\n${guide(fence('<Button variant="outline" onClick={() => setOpen(!open)}>Cancel</Button>'))}`)).toEqual([
      'the guide starts with a # heading; the page adds the component name',
    ]);
  });

  it('needs a jsx example', () => {
    expect(check(guide('Use it.'))).toEqual(['the guide has no ```jsx example']);
  });

  it('refuses an element that is neither a bundle export nor an icon the preview imports', () => {
    expect(check(guide(fence('<Combobox options={[]} />')))).toEqual([
      'an example uses <Combobox>, which is neither a bundle export nor a lucide icon the preview imports',
    ]);
    expect(check(guide(fence('<Button variant="danger-ghost" size="sm" iconLeft={<Plus size={14} />}>Remove</Button>')))).toContain(
      'an example uses <Plus>, which is neither a bundle export nor a lucide icon the preview imports',
    );
  });

  it("refuses an example element the preview does not render with the same props", () => {
    expect(check(guide(fence('<Button tone="outline">Cancel</Button>')))).toEqual([
      'an example\'s <Button tone="outline"> is not in the preview as written',
    ]);
    expect(check(guide(fence('<Button variant="outline" onClick={close}>Cancel</Button>')))).toEqual([
      'an example\'s <Button variant="outline" onClick={close}> is not in the preview as written',
    ]);
  });

  it('refuses a mention of design/ paths, Claude Design or a pull request number', () => {
    const example = fence('<Button variant="outline" onClick={() => setOpen(!open)}>Cancel</Button>');
    expect(check(guide(`${example}\n\nPorted from design/components/primitives/Button.jsx.`))).toEqual([
      'the guide mentions design/components/primitives/Button.jsx; a guide speaks of the shipped kit only',
    ]);
    expect(check(guide(`${example}\n\nAs drawn in Claude Design.`))).toEqual([
      'the guide mentions Claude Design; a guide speaks of the shipped kit only',
    ]);
    expect(check(guide(`${example}\n\nChanged in PR #344.`))).toEqual(['the guide mentions PR #344; a guide speaks of the shipped kit only']);
    expect(check(guide(`${example}\n\nSee pull request 342.`))).toEqual([
      'the guide mentions pull request 342; a guide speaks of the shipped kit only',
    ]);
  });
});

describe('collectGuides', () => {
  it("reads each preview's README.md, under the preview's component", () => {
    const root = join(scratch, 'kit');
    for (const [path, text] of Object.entries({
      'Markdown/README.md': 'Renders Markdown.\n',
      'Alpha/README.md': 'Alpha.\n',
    })) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
    const previews = [
      { folder: 'Markdown', component: 'MarkdownText', file: 'Markdown/Markdown.preview.tsx', path: join(root, 'Markdown/Markdown.preview.tsx') },
      { folder: 'Beta', component: 'Beta', file: 'Beta/Beta.preview.tsx', path: join(root, 'Beta/Beta.preview.tsx') },
    ];
    expect(collectGuides(root, previews)).toEqual([
      { component: 'MarkdownText', file: 'Markdown/README.md', path: join(root, 'Markdown/README.md'), text: 'Renders Markdown.\n' },
    ]);
  });
});

describe("the kit's guides", () => {
  it('pass against their previews', () => {
    const exports = [...collectKitExports(kitDir), { name: 'Icon' }];
    const previews = [...collectPreviews(kitDir, exports), iconPreview(runtimeDir, exports)].filter(Boolean);
    const guides = collectGuides(kitDir, previews);
    for (const name of ['Button', 'Modal', 'Icon']) expect(guides.map((g) => g.component)).toContain(name);
    for (const { component, text } of guides) {
      const preview = previews.find((p) => p.component === component);
      const problems = checkGuide({ text, previewSource: readFileSync(preview.path, 'utf8'), exports });
      expect({ component, problems }).toEqual({ component, problems: [] });
    }
  });
});
