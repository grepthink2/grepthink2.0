// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { FEATURE_HOMES, KIT_FAMILIES, NAME_STATUSES, NAMES_ALLOWLIST, checkNames, declarationsOf } from '../names.mjs';

const manifest = (...pairs) => ({ components: pairs.map(([name, sourcePath]) => ({ name, sourcePath })) });
// A source file that exports a component under each name.
const exporting = (path, ...names) => ({ path, source: names.map((n) => `export function ${n}() { return null; }`).join('\n') });
const failures = (r) => r.failures.map((f) => [f.rule, f.subject]);
const warnings = (r) => r.warnings.map((f) => [f.rule, f.subject]);
const statusOf = (r, name) => r.audit.find((row) => row.name === name)?.status;

const KIT = manifest(
  ['ConfirmDialog', 'components/feedback/ConfirmDialog.jsx'],
  ['InlineConfirm', 'components/feedback/ConfirmDialog.jsx'],
  ['EmptyState', 'components/feedback/EmptyState.jsx'],
  ['Skeleton', 'components/feedback/EmptyState.jsx'],
  ['FilterChip', 'components/navigation/FilterChip.jsx'],
  ['FilterChipGroup', 'components/navigation/FilterChip.jsx'],
  ['Combobox', 'components/primitives/Combobox.jsx'],
  ['Avatar', 'components/display/Avatar.jsx'],
  ['AVATAR_COLORS', 'components/display/Avatar.jsx'],
);
const PORTED = [
  exporting('src/components/ConfirmDialog/ConfirmDialog.tsx', 'ConfirmDialog', 'InlineConfirm'),
  exporting('src/components/EmptyState/EmptyState.tsx', 'EmptyState'),
  exporting('src/components/Skeleton/Skeleton.tsx', 'Skeleton'),
  exporting('src/components/FilterChip/FilterChip.tsx', 'FilterChip'),
  exporting('src/components/FilterChip/FilterChipGroup.tsx', 'FilterChipGroup'),
  exporting('src/components/Avatar/Avatar.tsx', 'Avatar'),
  { path: 'src/components/Avatar/avatarHelpers.ts', source: "export const AVATAR_COLORS = ['var(--gt-avatar-1)'];" },
  { path: 'src/components/Avatar/Avatar.scss' },
];
const COMBOBOX_LATER = [{ design: 'Combobox', status: 'not ported', reason: 'a test' }];

describe('declarationsOf', () => {
  it('reads the top-level declarations and which of them are exported', () => {
    const source = [
      'export function Badge() {}',
      'export const Skeleton: React.FC = () => null;',
      'export class ErrorBoundary extends React.Component {}',
      'export default function MarkdownText() {}',
      'export async function load() {}',
      'const Hero: React.FC = () => null;',
      'export default Hero;',
      'function local() {}',
      'let counter = 0;',
      'const a = 1;',
      'const b = 2;',
      'export { a, b as B };',
      'const c = 3;',
      'export { c as default };',
    ].join('\n');
    const { exported, declared } = declarationsOf(source);
    expect([...exported].sort()).toEqual(['B', 'Badge', 'ErrorBoundary', 'Hero', 'MarkdownText', 'Skeleton', 'a', 'c', 'load']);
    expect([...declared].sort()).toEqual(
      ['Badge', 'ErrorBoundary', 'Hero', 'MarkdownText', 'Skeleton', 'a', 'b', 'c', 'counter', 'load', 'local'],
    );
  });

  it('reads no re-export, type, nested declaration, comment or string as a declaration', () => {
    const source = [
      "export { Table } from './Table';",
      "export * from './Card';",
      "export type Tone = 'info';",
      'export interface CardProps {}',
      'export type { Row };',
      'function outer() {',
      '  const Nested = 1;',
      '  function Inner() {}',
      '}',
      '// export function Commented() {}',
      '/* export const Blocked = 1; */',
      'const sample = `',
      'export function Quoted() {}',
      '`;',
    ].join('\n');
    const { exported, declared } = declarationsOf(source);
    expect([...exported]).toEqual([]);
    expect([...declared].sort()).toEqual(['outer', 'sample']);
  });
});

describe('checkNames: the kit', () => {
  it('passes each kit component in its place, a grouped export with its group or in a folder of its own', () => {
    const r = checkNames(KIT, PORTED, COMBOBOX_LATER);
    expect(r.failures).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(statusOf(r, 'InlineConfirm')).toBe('same name'); // in ConfirmDialog.tsx
    expect(statusOf(r, 'FilterChipGroup')).toBe('same name'); // beside FilterChip.tsx
    expect(statusOf(r, 'Skeleton')).toBe('same name'); // src/components/Skeleton/Skeleton.tsx
    expect(statusOf(r, 'AVATAR_COLORS')).toBe('same name'); // any file in Avatar's folder
    expect(statusOf(r, 'Combobox')).toBe('not ported');
  });

  it('fails a file that exports a kit component anywhere else, in the kit or in a feature', () => {
    const files = [
      ...PORTED.filter((f) => !f.path.startsWith('src/components/ConfirmDialog/')),
      exporting('src/components/ConfirmDialog/ConfirmDialog.tsx', 'ConfirmDialog'),
      exporting('src/components/Modal/InlineConfirm.tsx', 'InlineConfirm'),
      exporting('src/features/scrum/components/Combobox.tsx', 'Combobox'),
    ];
    const r = checkNames(KIT, files, []);
    expect(failures(r)).toEqual([
      ['kit-place', 'src/components/Modal/InlineConfirm.tsx'],
      ['kit-place', 'src/features/scrum/components/Combobox.tsx'],
      ['kit-folder', 'src/components/Modal/'],
    ]);
    expect(r.failures[0].message).toContain(
      'src/components/InlineConfirm/InlineConfirm.tsx, or beside ConfirmDialog in src/components/ConfirmDialog/',
    );
    expect(statusOf(r, 'InlineConfirm')).toBe('misplaced');
  });

  it("passes a folder named after the design file that groups its exports, though no export bears that name", () => {
    const r = checkNames(
      manifest(['MarkdownText', 'components/display/Markdown.jsx']),
      [{ path: 'src/components/Markdown/MarkdownText.tsx', source: 'export default function MarkdownText() {}' }],
      [],
    );
    expect(r.failures).toEqual([]);
    expect(statusOf(r, 'MarkdownText')).toBe('same name');
  });

  it('fails a folder named after no kit component, and names the near miss', () => {
    const r = checkNames(KIT, [...PORTED, exporting('src/components/ComboBox/ComboBox.tsx', 'ComboBox')], COMBOBOX_LATER);
    expect(failures(r)).toEqual([['kit-folder', 'src/components/ComboBox/']]);
    expect(r.failures[0].message).toContain('the design calls it Combobox');
  });

  it('fails a component file named after neither its folder nor an export the design groups under it', () => {
    const files = [
      ...PORTED,
      exporting('src/components/FilterChip/ChipRow.tsx', 'ChipRow'),
      exporting('src/components/EmptyState/Avatar.tsx', 'AvatarBadge'),
    ];
    const r = checkNames(KIT, files, []);
    expect(failures(r)).toEqual([
      ['kit-file', 'src/components/FilterChip/ChipRow.tsx'],
      ['kit-export', 'src/components/EmptyState/Avatar.tsx'],
      ['kit-file', 'src/components/EmptyState/Avatar.tsx'],
    ]);
    expect(r.failures[2].message).toContain('Avatar is a kit component of its own');
  });

  it("fails a file named after a design export that does not export it", () => {
    const files = [
      ...PORTED.filter((f) => !f.path.endsWith('/FilterChipGroup.tsx')),
      exporting('src/components/FilterChip/FilterChipGroup.tsx', 'ChipGroup'),
    ];
    const r = checkNames(KIT, files, COMBOBOX_LATER);
    expect(failures(r)).toEqual([['kit-export', 'src/components/FilterChip/FilterChipGroup.tsx']]);
    expect(warnings(r)).toEqual([['kit-missing', 'FilterChipGroup']]);
  });

  it('fails a component file directly in src/components/', () => {
    const r = checkNames(KIT, [...PORTED, exporting('src/components/Banner.tsx', 'Banner')], COMBOBOX_LATER);
    expect(failures(r)).toEqual([['kit-loose', 'src/components/Banner.tsx']]);
  });

  it('reads no lowercase folder or file, test or entry file', () => {
    const files = [
      ...PORTED,
      exporting('src/components/hooks/useRovingFocus.ts', 'useRovingFocus'),
      exporting('src/components/icons/BrandIcons.tsx', 'GithubIcon'),
      exporting('src/components/Avatar/avatarColors.ts', 'pick'),
      exporting('src/components/Avatar/__tests__/Avatar.test.tsx', 'Combobox'),
      exporting('src/components/__tests__/Fixture.tsx', 'Fixture'),
      exporting('src/kit-mock.tsx', 'Combobox'),
    ];
    expect(checkNames(KIT, files, COMBOBOX_LATER).failures).toEqual([]);
  });

  it('warns for a kit component the codebase lacks, and for a kit constant outside its folder', () => {
    const files = [
      ...PORTED.filter((f) => !f.path.endsWith('avatarHelpers.ts')),
      { path: 'src/lib/avatarColors.ts', source: 'export const AVATAR_COLORS = [];' },
    ];
    const r = checkNames(KIT, files, []);
    expect(r.failures).toEqual([]);
    expect(warnings(r)).toEqual([
      ['kit-missing', 'Combobox'],
      ['kit-constant', 'AVATAR_COLORS'],
    ]);
    expect(r.warnings[1].message).toContain('src/lib/avatarColors.ts, outside src/components/Avatar/');
  });
});

describe('checkNames: the feature layers', () => {
  const FEATURES = manifest(
    ['ScalePicker', 'components/scrum/ScalePicker.jsx'],
    ['PointPicker', 'components/scrum/ScalePicker.jsx'],
    ['ESTIMATE_SCALES', 'components/scrum/ScalePicker.jsx'],
    ['ScheduleModel', 'components/schedule/ScheduleModel.jsx'],
    ['ScheduleIcon', 'components/schedule/ScheduleItem.jsx'],
    ['MarkdownText', 'components/scrum/CommentThread.jsx'],
    ['PointsChip', 'components/scrum/PointsChip.jsx'],
    ['BurnupChart', 'components/scrum/BurnupChart.jsx'],
  );
  const FOUND = [
    exporting('src/features/scrum/components/ScalePicker.tsx', 'ScalePicker', 'PointPicker'),
    { path: 'src/features/scrum/config/scrumTags.ts', source: 'export const ESTIMATE_SCALES = {};' },
    { path: 'src/features/schedule/scheduleModel.ts', source: 'export function kindMeta() {}' },
    { path: 'src/features/schedule/components/ScheduleIcon.tsx', source: 'const ScheduleIcon = () => null;\nexport default ScheduleIcon;' },
    { path: 'src/components/Markdown/MarkdownText.tsx', source: 'export default function MarkdownText() {}' },
  ];
  const MARKDOWN_FOLDER = { path: 'src/components/Markdown', reason: 'a test' };

  it('finds an export in a file named like it or like its design file, a constant anywhere, a model by its module', () => {
    const files = [
      ...FOUND,
      exporting('src/features/scrum/components/PointsChip.tsx', 'PointsChip'),
      exporting('src/features/scrum/components/BurnupChart.tsx', 'BurnupChart'),
    ];
    const r = checkNames(FEATURES, files, [MARKDOWN_FOLDER]);
    expect(r.failures).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.audit.every((row) => row.status === 'same name')).toBe(true);
    expect(r.audit.find((row) => row.name === 'MarkdownText').note).toBe('taken over by the kit');
  });

  it('warns, and never fails, for an export filed elsewhere in its feature or missing from it', () => {
    const files = [...FOUND, exporting('src/features/scrum/components/Chips.tsx', 'PointsChip')];
    const r = checkNames(FEATURES, files, [MARKDOWN_FOLDER]);
    expect(r.failures).toEqual([]);
    expect(warnings(r)).toEqual([
      ['feature-file', 'PointsChip'],
      ['feature-missing', 'BurnupChart'],
    ]);
    expect(r.warnings[0].message).toContain('src/features/scrum/components/Chips.tsx');
  });

  it('notes a family whose folder does not exist yet, and warns for a family it does not know', () => {
    const r = checkNames(
      manifest(['SlotBoard', 'components/finalreviews/SlotBoard.jsx'], ['Gizmo', 'components/widgets/Gizmo.jsx']),
      [],
      [],
    );
    expect(r.notes.map((n) => n.subject)).toEqual(['finalreviews']);
    expect(statusOf(r, 'SlotBoard')).toBe('not ported');
    expect(warnings(r)).toEqual([['family-unknown', 'widgets']]);
  });
});

describe('checkNames: NAMES_ALLOWLIST', () => {
  it("gives an allowlisted export the entry's status, and leaves an allowlisted folder or file alone", () => {
    const allowlist = [
      { design: 'Combobox', status: 'not ported', reason: 'a test' },
      { path: 'src/components/ErrorBoundary', reason: 'a test' },
      { path: 'src/components/Skeleton/TableSkeleton.tsx', reason: 'a test' },
    ];
    const files = [
      ...PORTED,
      exporting('src/components/ErrorBoundary/ErrorBoundary.tsx', 'ErrorBoundary'),
      exporting('src/components/Skeleton/TableSkeleton.tsx', 'TableSkeleton'),
    ];
    const r = checkNames(KIT, files, allowlist);
    expect(r.failures).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.audit.find((row) => row.name === 'Combobox')).toMatchObject({ status: 'not ported', note: 'a test' });
  });

  it('warns for an entry that hides nothing any more', () => {
    const allowlist = [
      { design: ['Combobox', 'Gone'], status: 'not ported', reason: 'a test' },
      { design: 'Avatar', status: 'different name', keeps: 'Portrait', reason: 'a test' },
      { path: 'src/components/Removed', reason: 'a test' },
      { path: 'src/components/FilterChip/FilterChipGroup.tsx', reason: 'a test' },
    ];
    const files = [...PORTED, exporting('src/components/Combobox/Combobox.tsx', 'Combobox')];
    const r = checkNames(KIT, files, allowlist);
    expect(r.failures).toEqual([]);
    expect(warnings(r)).toEqual([
      ['allowlist-stale', 'Combobox'],
      ['allowlist-stale', 'Avatar'],
      ['allowlist-stale', 'Gone'],
      ['allowlist-stale', 'Portrait'],
      ['allowlist-stale', 'src/components/Removed'],
      ['allowlist-stale', 'src/components/FilterChip/FilterChipGroup.tsx'],
    ]);
  });

  it('fails an entry it cannot use', () => {
    const allowlist = [
      { design: 'Combobox', status: 'later', reason: 'a test' },
      { design: 'Avatar', status: 'different name', reason: 'a test' },
      { design: 'Skeleton', path: 'src/components/Skeleton', reason: 'a test' },
      { path: 'lib/x.ts', reason: 'a test' },
      { design: 'EmptyState', status: 'design-only', reason: '' },
      { design: 'Toast', status: 'not ported', reason: 'a test' },
      { design: ['Toast'], status: 'design-only', reason: 'a test' },
    ];
    expect(failures(checkNames(KIT, PORTED, allowlist))).toEqual([
      ['allowlist', 'NAMES_ALLOWLIST[0]'],
      ['allowlist', 'NAMES_ALLOWLIST[1]'],
      ['allowlist', 'NAMES_ALLOWLIST[2]'],
      ['allowlist', 'NAMES_ALLOWLIST[3]'],
      ['allowlist', 'NAMES_ALLOWLIST[4]'],
      ['allowlist', 'NAMES_ALLOWLIST[6]'],
    ]);
  });

  it('gives every entry a reason, and a design entry its status and the name the codebase keeps', () => {
    for (const entry of NAMES_ALLOWLIST) {
      expect(entry.reason).toBeTruthy();
      if ('path' in entry) {
        expect(entry.path).toMatch(/^src\//);
        expect('design' in entry).toBe(false);
      } else {
        expect([entry.design].flat().length).toBeGreaterThan(0);
        expect(NAME_STATUSES).toContain(entry.status);
        if (entry.status === 'same name' || entry.status === 'different name') expect(entry.keeps).toBeTruthy();
      }
    }
  });
});

describe('checkNames: the manifest', () => {
  it('refuses a manifest with no components list', () => {
    expect(() => checkNames({}, [], [])).toThrow('no components[] list');
    expect(() => checkNames({ components: [{ name: 'Button' }] }, [], [])).toThrow('components[0]');
  });

  it('knows every family design/PORTING.md maps', () => {
    expect(KIT_FAMILIES).toEqual(['primitives', 'display', 'feedback', 'navigation']);
    expect(Object.keys(FEATURE_HOMES).sort()).toEqual(
      ['analytics', 'assistant', 'domain', 'finalreviews', 'marketing', 'releases', 'schedule', 'scrum', 'search'],
    );
  });
});
