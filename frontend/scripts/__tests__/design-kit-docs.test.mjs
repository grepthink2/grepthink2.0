// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { checkKitDocs } from '../design-system/kitDocs.mjs';

const frontend = fileURLToPath(new URL('../../', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'design-kit-docs-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const PREVIEW = (folder) =>
  [
    `import { ${folder} } from './${folder}';`,
    `export const meta = { group: 'Display', height: 120 };`,
    `export default function ${folder}Preview() {`,
    `  return <${folder} tone="calm" />;`,
    '}',
    '',
  ].join('\n');
const GUIDE = (folder) => `A ${folder.toLowerCase()} for a test.\n\n## Use\n\n\`\`\`jsx\n<${folder} tone="calm" />\n\`\`\`\n`;

let kits = 0;
/** A kit with an Alpha and a Beta folder, each with a component, a guide and a preview, changed by `change`. */
function kit(change = {}) {
  const root = join(scratch, `kit-${kits++}`);
  const files = {
    'components/Alpha/Alpha.tsx': 'export function Alpha() { return null; }\n',
    'components/Alpha/README.md': GUIDE('Alpha'),
    'components/Alpha/Alpha.preview.tsx': PREVIEW('Alpha'),
    'components/Beta/Beta.tsx': 'export function Beta() { return null; }\n',
    'components/Beta/README.md': GUIDE('Beta'),
    'components/Beta/Beta.preview.tsx': PREVIEW('Beta'),
    'components/hooks/useGamma.ts': 'export function useGamma() { return 1; }\n',
    'components/ErrorBoundary/ErrorBoundary.tsx': 'export class ErrorBoundary {}\n',
    'runtime/Icon.tsx': 'export function Icon() { return null; }\n',
    'runtime/README.md': 'Places an icon by name.\n\n## Use\n\n```jsx\n<Icon name="Plus" />\n```\n',
    'runtime/Icon.preview.tsx': [
      "import { Icon } from './Icon';",
      "export const meta = { group: 'Display', height: 120 };",
      'export default function IconPreview() {',
      '  return <Icon name="Plus" />;',
      '}',
      '',
    ].join('\n'),
    ...change,
  };
  for (const [path, text] of Object.entries(files)) {
    if (text === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return checkKitDocs({ componentsDir: join(root, 'components'), runtimeDir: join(root, 'runtime') });
}

const MISSING = (folder, file) =>
  `design-adherence: ${folder} has no ${file} (every kit component carries a guide and a preview; see docs/agents/frontend.md)`;

describe('checkKitDocs', () => {
  it('passes a kit whose every component folder carries its guide and preview, and leaves out hooks and ErrorBoundary', () => {
    expect(kit()).toEqual([]);
  });

  it('names the folder and the file it lacks', () => {
    expect(kit({ 'components/Beta/README.md': null })).toEqual([MISSING('Beta', 'README.md')]);
    expect(kit({ 'components/Alpha/Alpha.preview.tsx': null })).toEqual([MISSING('Alpha', 'Alpha.preview.tsx')]);
    expect(kit({ 'components/Delta/Delta.tsx': 'export function Delta() { return null; }\n' })).toEqual([
      MISSING('Delta', 'README.md'),
      MISSING('Delta', 'Delta.preview.tsx'),
    ]);
    expect(kit({ 'runtime/README.md': null })).toEqual([MISSING('Icon', 'README.md')]);
  });

  it("holds each guide to its preview and each preview's meta to the contract", () => {
    expect(kit({ 'components/Beta/README.md': GUIDE('Beta').replace('tone="calm"', 'tone="loud"') })).toEqual([
      'design-adherence: Beta/README.md: an example\'s <Beta tone="loud" /> is not in the preview as written',
    ]);
    expect(kit({ 'components/Alpha/Alpha.preview.tsx': PREVIEW('Alpha').replace("group: 'Display'", "group: 'Other'") })).toEqual([
      'design-adherence: Alpha/Alpha.preview.tsx: unknown group "Other"',
    ]);
  });

  it("passes the kit's own components", () => {
    expect(checkKitDocs({ componentsDir: join(frontend, 'src/components'), runtimeDir: join(frontend, 'design-system/runtime') })).toEqual([]);
  });
});
