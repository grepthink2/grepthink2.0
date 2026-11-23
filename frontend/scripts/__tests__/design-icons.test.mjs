// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { collectLucideIcons, writeIconMap } from '../design-system/icons.mjs';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), 'design-icons-'));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function write(path, source) {
  mkdirSync(dirname(join(scratch, path)), { recursive: true });
  writeFileSync(join(scratch, path), source);
}

write('src/a.tsx', "import { Trash2, Plus as Add } from 'lucide-react';\n");
write(
  'src/features/b.tsx',
  [
    'import {',
    '  ArrowRight,',
    '  type LucideIcon,',
    '  Check, // the done state',
    "} from 'lucide-react';",
    "import type { LucideProps } from 'lucide-react';",
    "import { Plus } from 'lucide-react';",
    "import { Fake } from 'not-lucide';",
    "// import { Commented } from 'lucide-react';",
  ].join('\n'),
);
write('src/c.ts', "export { X } from 'lucide-react';\nimport { Zap } from \"lucide-react\";\n");
write('src/__tests__/d.test.tsx', "import { InTest } from 'lucide-react';\n");
write('src/e.test.tsx', "import { AlsoInTest } from 'lucide-react';\n");
write('src/components/A/A.preview.tsx', "import { InPreview } from 'lucide-react';\n");

describe('collectLucideIcons', () => {
  it('lists the icons imported from lucide-react outside tests and previews, sorted and once each', () => {
    expect(collectLucideIcons(join(scratch, 'src'))).toEqual(['ArrowRight', 'Check', 'Plus', 'Trash2', 'Zap']);
  });

  it('finds the icons the app imports', () => {
    const icons = collectLucideIcons(srcDir);
    expect(icons).toContain('Trash2');
    expect(icons).not.toContain('LucideIcon');
    expect(icons.length).toBeGreaterThan(50);
  });
});

describe('writeIconMap', () => {
  it('writes a module that exports ICONS by name', () => {
    const out = join(scratch, 'gen/icons.ts');
    writeIconMap(['Check', 'Trash2'], out);
    const text = readFileSync(out, 'utf8');
    expect(text).toContain("import { Check, Trash2 } from 'lucide-react';");
    expect(text).toContain("import type { LucideIcon } from 'lucide-react';");
    expect(text).toContain('export const ICONS: Record<string, LucideIcon> = { Check, Trash2 };');
  });
});
