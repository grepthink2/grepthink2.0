// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { joinDeclarations, propsNotes } from '../design-system/types.mjs';

const files = [
  {
    path: 'src/components/Alpha/Alpha.d.ts',
    text: [
      "import type { ReactNode, Ref as ElementRef } from 'react';",
      "import { type LinkProps } from 'react-router-dom';",
      "import { type AlphaSize } from './alphaHelpers';",
      "import './Alpha.scss';",
      'export interface AlphaProps {',
      '    size?: AlphaSize;',
      '    children: ReactNode;',
      '    ref?: ElementRef<HTMLDivElement>;',
      "    to?: LinkProps['to'];",
      '}',
      'export declare function Alpha(props: AlphaProps): import("react").JSX.Element;',
      'export {};',
      '',
    ].join('\n'),
  },
  {
    path: 'src/components/Alpha/alphaHelpers.d.ts',
    text: "export type AlphaSize = 'sm' | 'md';\nexport declare const ALPHA_PX: Record<AlphaSize, number>;\n",
  },
  {
    path: 'src/components/Beta/Beta.d.ts',
    text: "import React from 'react';\nimport { Alpha } from '@/components/Alpha/Alpha';\nexport declare const Beta: React.FC<{ a: typeof Alpha }>;\nexport default Beta;\n",
  },
  {
    path: 'src/components/Note/Note.d.ts',
    text: 'interface Props {\n    text: string;\n}\nexport default function Note({ text }: Props): import("react/jsx-runtime").JSX.Element;\nexport {};\n',
  },
];

const exports = [
  { name: 'ALPHA_PX', file: 'src/components/Alpha/alphaHelpers.ts', kind: 'helper' },
  { name: 'Alpha', file: 'src/components/Alpha/Alpha.tsx', kind: 'component' },
  { name: 'Note', file: 'src/components/Note/Note.tsx', kind: 'component' },
];

describe('joinDeclarations', () => {
  const text = joinDeclarations(files, exports);

  it('imports React once and drops every other import', () => {
    expect(text.match(/^import /gm)).toEqual(['import ']);
    expect(text).toContain("import * as React from 'react';");
    expect(text).not.toMatch(/from '\.\.?\//);
    expect(text).not.toContain("from '@/");
    expect(text).not.toContain('.scss');
    expect(text).not.toContain('import(');
    expect(text).not.toContain('export {};');
  });

  it('names the React types through the React namespace', () => {
    expect(text).toContain('children: React.ReactNode;');
    expect(text).toContain('ref?: React.Ref<HTMLDivElement>;');
    expect(text).toContain('export declare function Alpha(props: AlphaProps): React.JSX.Element;');
    expect(text).toContain('export declare function Note({ text }: Props): React.JSX.Element;');
  });

  it('declares the router and icon types it refers to', () => {
    expect(text).toMatch(/^type LinkProps = /m);
    expect(text).not.toMatch(/^type LucideIcon = /m);
  });

  it("puts each file under its source path, in the export list's order, leaving out files with no export", () => {
    const helpers = text.indexOf('// ── src/components/Alpha/alphaHelpers.ts ──');
    const alpha = text.indexOf('// ── src/components/Alpha/Alpha.tsx ──');
    expect(helpers).toBeGreaterThan(0);
    expect(alpha).toBeGreaterThan(helpers);
    expect(text).not.toContain('Beta');
    expect(text).toContain('export interface AlphaProps {');
  });
});

describe('propsNotes', () => {
  it('names the props of a component whose props type is not <Name>Props', () => {
    expect(propsNotes(joinDeclarations(files, exports), exports)).toEqual(['Note takes Props']);
  });

  it('refuses a component with no declaration', () => {
    const missing = [...exports, { name: 'Gamma', file: 'src/components/Gamma/Gamma.tsx', kind: 'component' }];
    expect(() => propsNotes(joinDeclarations(files, exports), missing)).toThrow('Gamma has no declaration in index.d.ts');
  });
});
