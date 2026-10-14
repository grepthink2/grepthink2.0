import { describe, expect, it } from 'vitest';
import type { ClassRole } from '@/lib/api';
import { activeItemPath, buildSidebarConfig, type SidebarSection } from '../sidebar';

// A section as [id, title, groups], a group as [title, items] and an item as [label, path], so a
// moved path fails as loudly as a renamed label or an item filed under another heading.
type PinnedItem = [string, string];
type PinnedGroup = [string | undefined, PinnedItem[]];
type PinnedSection = [string, string | undefined, PinnedGroup[]];
const pin = (section: SidebarSection): PinnedSection => [
  section.id,
  section.title,
  section.groups.map((group) => [group.title, group.items.map((item) => [item.label, item.path])]),
];
const sidebar = (canCreateClasses: boolean, classRole: ClassRole | null | undefined) =>
  buildSidebarConfig({ canCreateClasses, classRole }).map(pin);

const HOME: PinnedItem = ['Home', '/app/home'];
const MESSAGES: PinnedItem = ['Messages', '/app/messages'];
const ANALYTICS: PinnedItem = ['Analytics', '/app/analytics'];
const MY_CLASSES: PinnedItem = ['My Classes', '/app/my-classes'];
const CREATE_CLASS: PinnedItem = ['Create Class', '/app/create-class'];
const JOIN_CLASS: PinnedItem = ['Join Class', '/app/join-class'];

// The top cluster has no heading; the account's cross-class pages live there.
const INSTRUCTOR_MAIN: PinnedSection = ['main', undefined, [[undefined, [HOME, MESSAGES, ANALYTICS]]]];
const STUDENT_MAIN: PinnedSection = ['main', undefined, [[undefined, [HOME, MESSAGES]]]];
const INSTRUCTOR_CLASSES: PinnedSection = ['classes', 'Classes', [[undefined, [MY_CLASSES, CREATE_CLASS]]]];
const STUDENT_CLASSES: PinnedSection = ['classes', 'Classes', [[undefined, [MY_CLASSES, JOIN_CLASS]]]];

// The selected class's pages, under category headings. The section's own title is replaced by the
// class's name when one is selected.
const INSTRUCTOR_CLASS: PinnedSection = [
  'class',
  'Class',
  [
    [undefined, [['Dashboard', '/app/dashboard']]],
    [
      'Teams',
      [
        ['Projects', '/app/projects'],
        ['Roster', '/app/roster'],
      ],
    ],
    [
      'Coursework',
      [
        ['Modules', '/app/modules'],
        ['Final Reviews', '/app/ta-review/final-reviews'],
      ],
    ],
    [
      'TAs',
      [
        ['TA Management', '/app/ta-management'],
        ['TA Meetings', '/app/ta-meetings'],
      ],
    ],
  ],
];
const STUDENT_GROUPS: PinnedGroup[] = [
  [
    'Team',
    [
      ['My Project', '/app/my-project'],
      ['Browse Projects', '/app/browse-projects'],
      ['Create Project', '/app/create-project'],
    ],
  ],
  ['Coursework', [['Assignments', '/app/assignments']]],
  [
    'Class',
    [
      ['Roster', '/app/roster'],
      ['TA Meetings', '/app/ta-meetings'],
    ],
  ],
];
// A TA's extra pages: the former expandable "TA Review" item, now a heading over two plain items.
const TA_REVIEW: PinnedGroup = [
  'TA Review',
  [
    ['TSRs', '/app/ta-review'],
    ['Final Reviews', '/app/ta-review/final-reviews'],
  ],
];
const STUDENT_CLASS: PinnedSection = ['class', 'Class', STUDENT_GROUPS];
const TA_CLASS: PinnedSection = ['class', 'Class', [...STUDENT_GROUPS, TA_REVIEW]];
const FOOTER: PinnedSection = [
  'footer',
  undefined,
  [
    [
      undefined,
      [
        ['Settings', '/app/settings'],
        ['Help Center', '/app/help-center'],
      ],
    ],
  ],
];

describe('buildSidebarConfig', () => {
  it('groups the instructor sidebar for a class you teach', () => {
    expect(sidebar(true, 'instructor')).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASSES, INSTRUCTOR_CLASS, FOOTER]);
  });

  it('groups the student sidebar for a student account in a class it takes', () => {
    expect(sidebar(false, 'student')).toEqual([STUDENT_MAIN, STUDENT_CLASSES, STUDENT_CLASS, FOOTER]);
  });

  it('adds the TA Review group for a student account in a class it TAs', () => {
    expect(sidebar(false, 'ta')).toEqual([STUDENT_MAIN, STUDENT_CLASSES, TA_CLASS, FOOTER]);
  });

  it('shows the student groups plus TA Review in a class you TA, even for an account that can create classes', () => {
    expect(sidebar(true, 'ta')).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASSES, TA_CLASS, FOOTER]);
  });

  it('shows the student groups in a class you take, even for an account that can create classes', () => {
    expect(sidebar(true, 'student')).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASSES, STUDENT_CLASS, FOOTER]);
  });

  it("shows the account's usual class section while the classes load", () => {
    expect(sidebar(true, undefined)).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASSES, INSTRUCTOR_CLASS, FOOTER]);
    expect(sidebar(false, undefined)).toEqual([STUDENT_MAIN, STUDENT_CLASSES, STUDENT_CLASS, FOOTER]);
  });

  it('hides the class section with no class selected', () => {
    expect(sidebar(false, null)).toEqual([STUDENT_MAIN, STUDENT_CLASSES, FOOTER]);
    expect(sidebar(true, null)).toEqual([INSTRUCTOR_MAIN, INSTRUCTOR_CLASSES, FOOTER]);
  });

  it('gives no two items of one sidebar the same icon', () => {
    for (const canCreateClasses of [true, false]) {
      for (const classRole of ['instructor', 'ta', 'student'] as const) {
        const items = buildSidebarConfig({ canCreateClasses, classRole }).flatMap((section) =>
          section.groups.flatMap((group) => group.items),
        );
        const icons = items.map((item) => item.icon);
        expect(new Set(icons).size, `${canCreateClasses ? 'creator' : 'student account'} as ${classRole}`).toBe(
          icons.length,
        );
      }
    }
  });
});

describe('activeItemPath', () => {
  const ta = buildSidebarConfig({ canCreateClasses: false, classRole: 'ta' });
  const instructor = buildSidebarConfig({ canCreateClasses: true, classRole: 'instructor' });
  const student = buildSidebarConfig({ canCreateClasses: false, classRole: 'student' });

  it('lights the item whose page you are on', () => {
    expect(activeItemPath(ta, '/app/home')).toBe('/app/home');
    expect(activeItemPath(ta, '/app/ta-review')).toBe('/app/ta-review');
  });

  it('lights the list for a page nested under it', () => {
    expect(activeItemPath(student, '/app/assignments/asg1')).toBe('/app/assignments');
    expect(activeItemPath(ta, '/app/messages/c1')).toBe('/app/messages');
    expect(activeItemPath(ta, '/app/ta-review/r1')).toBe('/app/ta-review');
  });

  it('prefers the most specific item: Final Reviews over TSRs under /app/ta-review', () => {
    expect(activeItemPath(ta, '/app/ta-review/final-reviews')).toBe('/app/ta-review/final-reviews');
    expect(activeItemPath(ta, '/app/ta-review/final-reviews/p1')).toBe('/app/ta-review/final-reviews');
  });

  it("keeps the instructor's Projects lit on a project, its board and the create-project flow", () => {
    expect(activeItemPath(instructor, '/app/projects/p1')).toBe('/app/projects');
    expect(activeItemPath(instructor, '/app/projects/p1/board')).toBe('/app/projects');
    expect(activeItemPath(instructor, '/app/create-project')).toBe('/app/projects');
  });

  it("lights a student's own Create Project item on that flow", () => {
    expect(activeItemPath(student, '/app/create-project')).toBe('/app/create-project');
  });

  it('lights nothing on a page the sidebar does not list', () => {
    expect(activeItemPath(instructor, '/app/class-settings')).toBeNull();
    expect(activeItemPath(student, '/app/dashboard')).toBeNull();
  });
});
