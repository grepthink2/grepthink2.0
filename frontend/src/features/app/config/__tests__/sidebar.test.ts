import { describe, expect, it } from 'vitest';
import type { ClassRole } from '@/lib/api';
import { buildSidebarConfig, type SidebarItem } from '../sidebar';

// Items as [label, path, children?], so a moved path fails as loudly as a renamed label.
type Pinned = [string, string] | [string, string, Pinned[]];
const pin = (item: SidebarItem): Pinned =>
  item.children ? [item.label, item.path, item.children.map(pin)] : [item.label, item.path];
const sidebar = (canCreateClasses: boolean, classRole: ClassRole | null | undefined) =>
  buildSidebarConfig({ canCreateClasses, classRole }).map((s) => [s.title, s.items.map(pin)]);

// The sidebars from before the class role decided them: the instructor and student configs, and
// the "TA Review" group Sidebar.tsx appended to the student one for a TA.
const INSTRUCTOR_MAIN = [
  'Main',
  [
    ['Home', '/app/home'],
    ['Messages', '/app/messages'],
    ['My Classes', '/app/my-classes'],
    ['Create Class', '/app/create-class'],
  ],
];
const STUDENT_MAIN = [
  'Main',
  [
    ['Home', '/app/home'],
    ['Messages', '/app/messages'],
    ['Join Class', '/app/join-class'],
    ['My Classes', '/app/my-classes'],
  ],
];
const INSTRUCTOR_CLASS = [
  'Class',
  [
    ['Dashboard', '/app/dashboard'],
    ['Projects', '/app/projects'],
    ['Roster', '/app/roster'],
    ['Modules', '/app/modules'],
    ['TA Management', '/app/ta-management'],
    ['TA Meetings', '/app/ta-meetings'],
    ['Final Reviews', '/app/ta-review/final-reviews'],
  ],
];
const STUDENT_ITEMS = [
  ['Create Project', '/app/create-project'],
  ['Browse Projects', '/app/browse-projects'],
  ['My Project', '/app/my-project'],
  ['Assignments', '/app/assignments'],
  ['Roster', '/app/roster'],
  ['TA Meetings', '/app/ta-meetings'],
];
const TA_REVIEW = [
  'TA Review',
  '/app/ta-review',
  [
    ['TSRs', '/app/ta-review'],
    ['Final Reviews', '/app/ta-review/final-reviews'],
  ],
];
const SETTINGS = [
  'Settings',
  [
    ['Settings', '/app/settings'],
    ['Help Center', '/app/help-center'],
  ],
];

describe('buildSidebarConfig', () => {
  it('keeps the instructor sidebar for a class you teach', () => {
    expect(sidebar(true, 'instructor')).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASS, SETTINGS]);
  });

  it('keeps the student sidebar for a student account in a class it takes', () => {
    expect(sidebar(false, 'student')).toEqual([STUDENT_MAIN, ['Class', STUDENT_ITEMS], SETTINGS]);
  });

  it('keeps the student sidebar plus TA Review for a student account in a class it TAs', () => {
    expect(sidebar(false, 'ta')).toEqual([STUDENT_MAIN, ['Class', [...STUDENT_ITEMS, TA_REVIEW]], SETTINGS]);
  });

  it('shows the student items plus TA Review in a class you TA, even for an account that can create classes', () => {
    expect(sidebar(true, 'ta')).toEqual([INSTRUCTOR_MAIN, ['Class', [...STUDENT_ITEMS, TA_REVIEW]], SETTINGS]);
  });

  it('shows the student items in a class you take, even for an account that can create classes', () => {
    expect(sidebar(true, 'student')).toEqual([INSTRUCTOR_MAIN, ['Class', STUDENT_ITEMS], SETTINGS]);
  });

  it("shows the account's usual class section while the classes load", () => {
    expect(sidebar(true, undefined)).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASS, SETTINGS]);
    expect(sidebar(false, undefined)).toEqual([STUDENT_MAIN, ['Class', STUDENT_ITEMS], SETTINGS]);
  });

  it('hides the class section with no class selected', () => {
    expect(sidebar(false, null)).toEqual([STUDENT_MAIN, SETTINGS]);
    expect(sidebar(true, null)).toEqual([INSTRUCTOR_MAIN, SETTINGS]);
  });

  it('gives every top-level item an icon', () => {
    for (const classRole of ['instructor', 'ta', 'student'] as const) {
      for (const section of buildSidebarConfig({ canCreateClasses: false, classRole })) {
        for (const item of section.items) expect(item.icon ?? item.iconSvg, item.label).toBeTruthy();
      }
    }
  });
});
