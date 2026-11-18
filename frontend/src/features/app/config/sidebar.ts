import {
  Blocks,
  BookOpen,
  CalendarCheck,
  ChartColumn,
  CirclePlus,
  CircleQuestionMark,
  ClipboardCheck,
  ClipboardList,
  Compass,
  Folder,
  FolderKanban,
  FolderPlus,
  House,
  LayoutDashboard,
  ListChecks,
  ListTodo,
  LogIn,
  MessageSquare,
  Settings,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ClassRole } from '@/lib/api';

export type UserRole = 'instructor' | 'student';

export interface SidebarItem {
  label: string;
  /** The item's page, or for an `external` item the address it opens. */
  path: string;
  icon: LucideIcon;
  /** Pages this item also stays lit on, besides its own page and the pages under it. */
  alsoActiveOn?: readonly string[];
  /** A link to another site, opened in a new tab (the class's "Tasks - External" board). */
  external?: boolean;
}

/** Items under one category heading; a group without a title leads its section. */
export interface SidebarGroup {
  title?: string;
  items: SidebarItem[];
}

export type SidebarSectionId = 'main' | 'classes' | 'class' | 'footer';

export interface SidebarSection {
  id: SidebarSectionId;
  /** The section's heading. The class section has none: its category headings carry it, and a
   *  heading would only add a blank 28px band to the closed rail. */
  title?: string;
  groups: SidebarGroup[];
}

/**
 * How the desktop rail answers the pointer: it opens once the pointer has rested on it, so one only
 * passing through does not flicker it, and closes a moment after the pointer leaves.
 */
export const SIDEBAR_HOVER = { openDelayMs: 150, closeDelayMs: 300 } as const;

const HOME: SidebarItem = { label: 'Home', path: '/app/home', icon: House };
const MESSAGES: SidebarItem = { label: 'Messages', path: '/app/messages', icon: MessageSquare };
const ANALYTICS: SidebarItem = { label: 'Analytics', path: '/app/analytics', icon: ChartColumn };
const MY_CLASSES: SidebarItem = { label: 'My Classes', path: '/app/my-classes', icon: BookOpen };
const CREATE_CLASS: SidebarItem = { label: 'Create Class', path: '/app/create-class', icon: CirclePlus };
const JOIN_CLASS: SidebarItem = { label: 'Join Class', path: '/app/join-class', icon: LogIn };

const COURSEWORK = 'Coursework';

const instructorClassGroups: SidebarGroup[] = [
  { items: [{ label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard }] },
  {
    title: 'Teams',
    items: [
      // The instructor has no Create Project item, so Projects owns that flow too.
      { label: 'Projects', path: '/app/projects', icon: FolderKanban, alsoActiveOn: ['/app/create-project'] },
      { label: 'Roster', path: '/app/roster', icon: Users },
    ],
  },
  {
    title: COURSEWORK,
    items: [
      { label: 'Modules', path: '/app/modules', icon: Blocks },
      { label: 'Final Reviews', path: '/app/ta-review/final-reviews', icon: ClipboardCheck },
    ],
  },
  {
    title: 'TAs',
    items: [
      { label: 'TA Management', path: '/app/ta-management', icon: UserCog },
      { label: 'TA Meetings', path: '/app/ta-meetings', icon: CalendarCheck },
    ],
  },
];

const studentClassGroups: SidebarGroup[] = [
  {
    title: 'Team',
    items: [
      { label: 'My Project', path: '/app/my-project', icon: Folder },
      { label: 'Browse Projects', path: '/app/browse-projects', icon: Compass },
      { label: 'Create Project', path: '/app/create-project', icon: FolderPlus },
    ],
  },
  { title: COURSEWORK, items: [{ label: 'Assignments', path: '/app/assignments', icon: ClipboardList }] },
  {
    title: 'Class',
    items: [
      { label: 'Roster', path: '/app/roster', icon: Users },
      { label: 'TA Meetings', path: '/app/ta-meetings', icon: CalendarCheck },
    ],
  },
];

/** A TA's review pages. TSRs sits on /app/ta-review and owns each review under it. */
const taReviewGroup: SidebarGroup = {
  title: 'TA Review',
  items: [
    { label: 'TSRs', path: '/app/ta-review', icon: ListChecks },
    { label: 'Final Reviews', path: '/app/ta-review/final-reviews', icon: ClipboardCheck },
  ],
};

const FOOTER: SidebarSection = {
  id: 'footer',
  groups: [
    {
      items: [
        { label: 'Settings', path: '/app/settings', icon: Settings },
        { label: 'Help Center', path: '/app/help-center', icon: CircleQuestionMark },
      ],
    },
  ],
};

/** The class's groups, Coursework closing with the class's own task board when it has one. */
function withTasksLink(groups: SidebarGroup[], externalTasksUrl: string | null): SidebarGroup[] {
  if (!externalTasksUrl) return groups;
  const tasks: SidebarItem = { label: 'Tasks - External', path: externalTasksUrl, icon: ListTodo, external: true };
  return groups.map((group) => (group.title === COURSEWORK ? { ...group, items: [...group.items, tasks] } : group));
}

/**
 * The sidebar for an account and its role in the selected class (`undefined` while the classes
 * load, `null` with no class selected). The top sections keep each account's familiar pages. The
 * class section follows the class role; while the classes load it is the account's usual one, so
 * it does not pop in, and with no class selected it is hidden. `externalTasksUrl` is the selected
 * class's "Tasks - External" link, already checked to be http(s); every role sees it.
 */
export function buildSidebarConfig({
  canCreateClasses,
  classRole,
  externalTasksUrl = null,
}: {
  canCreateClasses: boolean;
  classRole: ClassRole | null | undefined;
  externalTasksUrl?: string | null;
}): SidebarSection[] {
  const sections: SidebarSection[] = [
    { id: 'main', groups: [{ items: canCreateClasses ? [HOME, MESSAGES, ANALYTICS] : [HOME, MESSAGES] }] },
    { id: 'classes', title: 'Classes', groups: [{ items: [MY_CLASSES, canCreateClasses ? CREATE_CLASS : JOIN_CLASS] }] },
  ];
  const role = classRole === undefined ? (canCreateClasses ? 'instructor' : 'student') : classRole;
  const classSection = (groups: SidebarGroup[]): SidebarSection => ({
    id: 'class',
    groups: withTasksLink(groups, externalTasksUrl),
  });
  if (role === 'instructor') sections.push(classSection(instructorClassGroups));
  else if (role === 'ta') sections.push(classSection([...studentClassGroups, taReviewGroup]));
  else if (role === 'student') sections.push(classSection(studentClassGroups));
  sections.push(FOOTER);
  return sections;
}

/**
 * The path of the item lit on `pathname`: the item whose page it is, or whose page it sits under (a
 * project under Projects, a review under TSRs). The most specific item wins when several match, so
 * Final Reviews, which lives under /app/ta-review/, beats TSRs. Null on a page no item lists.
 */
export function activeItemPath(sections: SidebarSection[], pathname: string): string | null {
  let best: { path: string; specificity: number } | null = null;
  for (const section of sections) {
    for (const group of section.groups) {
      for (const item of group.items) {
        for (const root of [item.path, ...(item.alsoActiveOn ?? [])]) {
          if (pathname !== root && !pathname.startsWith(`${root}/`)) continue;
          if (!best || root.length > best.specificity) best = { path: item.path, specificity: root.length };
        }
      }
    }
  }
  return best?.path ?? null;
}
