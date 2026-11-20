// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { NAMESPACE, collectKitExports, writeEntry } from '../design-system/exports.mjs';

const kitDir = fileURLToPath(new URL('../../src/components/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'design-exports-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

/** Writes `files` ({ 'Folder/File.tsx': source }) under a fresh directory and returns it. */
function tree(name, files) {
  const root = join(scratch, name);
  for (const [path, source] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), source);
  }
  return root;
}

const fixture = tree('kit', {
  'Beta/Beta.tsx': [
    "import type { ReactNode } from 'react';",
    '// export function NotInCode() {}',
    "const label = 'export function NotInAString() {}';",
    'export type BetaProps = { children?: ReactNode };',
    'export interface BetaThing { id: string }',
    'function BetaPanel() { return label; }',
    'export function Beta() { return null; }',
    'export { BetaPanel, type BetaThing as Thing };',
  ].join('\n'),
  'Beta/betaHelpers.ts': 'export const BETA_SIZES = [1, 2];\nexport function shade(n: number) { return n; }\n',
  'Beta/useBeta.ts': 'export function useBeta() { return 1; }\n',
  'Beta/__tests__/Beta.test.tsx': 'export function Leaked() { return null; }\n',
  'Alpha/Alpha.tsx': 'export const Alpha = () => null;\nexport default Alpha;\nexport const ALPHA_PX = 4;\n',
  'Alpha/AlphaNote.tsx': 'export default function AlphaNote() { return null; }\n',
  'Alpha/Alpha.test.tsx': 'export function AlsoLeaked() { return null; }\n',
  'ErrorBoundary/ErrorBoundary.tsx': 'export class ErrorBoundary {}\n',
  'icons/BrandIcons.tsx': 'export function GithubIcon() { return null; }\n',
  'hooks/useGamma.ts': 'export function useGamma() { return 2; }\n',
  'Gamma.tsx': 'export function Loose() { return null; }\n',
});

describe('collectKitExports', () => {
  it('lists the value exports of each component folder and hooks/, sorted by folder then name', () => {
    expect(collectKitExports(fixture)).toEqual([
      { name: 'ALPHA_PX', file: 'Alpha/Alpha.tsx', kind: 'helper' },
      { name: 'Alpha', file: 'Alpha/Alpha.tsx', kind: 'component' },
      { name: 'AlphaNote', file: 'Alpha/AlphaNote.tsx', kind: 'component', isDefault: true },
      { name: 'BETA_SIZES', file: 'Beta/betaHelpers.ts', kind: 'helper' },
      { name: 'Beta', file: 'Beta/Beta.tsx', kind: 'component' },
      { name: 'BetaPanel', file: 'Beta/Beta.tsx', kind: 'component' },
      { name: 'shade', file: 'Beta/betaHelpers.ts', kind: 'helper' },
      { name: 'useBeta', file: 'Beta/useBeta.ts', kind: 'hook' },
      { name: 'useGamma', file: 'hooks/useGamma.ts', kind: 'hook' },
    ]);
  });

  it('refuses a name exported by two files, naming both', () => {
    const duplicated = tree('duplicated', {
      'One/one.ts': 'export const shared = 1;\n',
      'Two/two.ts': 'export function shared() { return 2; }\n',
    });
    expect(() => collectKitExports(duplicated)).toThrow('shared is exported by both One/one.ts and Two/two.ts');
  });

  it('finds the kit pieces a canvas needs, and leaves out ErrorBoundary', () => {
    const names = collectKitExports(kitDir).map((entry) => entry.name);
    for (const name of ['Button', 'TableSkeleton', 'useTableSort', 'useDialog', 'useRovingFocus', 'FilterChipGroup', 'TabPanel']) {
      expect(names).toContain(name);
    }
    expect(names).not.toContain('ErrorBoundary');
    expect(names).not.toContain('GithubIcon');
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('writeEntry', () => {
  it('imports each export and assigns the namespace, components through wrapExport', () => {
    const out = join(scratch, 'gen/entry.ts');
    writeEntry(
      [
        { name: 'Alpha', file: 'Alpha/Alpha.tsx', kind: 'component' },
        { name: 'AlphaNote', file: 'Alpha/AlphaNote.tsx', kind: 'component', isDefault: true },
        { name: 'shade', file: 'Beta/betaHelpers.ts', kind: 'helper' },
        { name: 'useBeta', file: 'Beta/useBeta.ts', kind: 'hook' },
      ],
      out,
      { runtimeDir: '/abs/runtime' },
    );
    const entry = readFileSync(out, 'utf8');
    expect(entry).toContain("import { Alpha } from '@components/Alpha/Alpha';");
    expect(entry).toContain("import AlphaNote from '@components/Alpha/AlphaNote';");
    expect(entry).toContain("import { shade } from '@components/Beta/betaHelpers';");
    expect(entry).toContain("import { wrapExport } from '/abs/runtime/adapt';");
    expect(entry).toContain("import { Icon } from '/abs/runtime/Icon';");
    expect(entry).toContain(`(window as unknown as Record<string, unknown>).${NAMESPACE} = {`);
    expect(entry).toContain('  Alpha: wrapExport(Alpha),');
    expect(entry).toContain('  AlphaNote: wrapExport(AlphaNote),');
    expect(entry).toContain('  shade,');
    expect(entry).toContain('  useBeta,');
    expect(entry).toContain('  Icon: wrapExport(Icon),');
  });
});
