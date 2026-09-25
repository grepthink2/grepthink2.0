import {
  CircleQuestionMark,
  ClipboardCheck,
  ClipboardList,
  Folder,
  GraduationCap,
  House,
  LayoutDashboard,
  LayoutList,
  List,
  Settings,
  SquarePen,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ClassRole } from '@/lib/api';

// Custom SVG icons
import MessagesIcon from '@assets/icon_messages.svg?url';
import MyClassesIcon from '@assets/fluent_class-24-filled.svg?url';
import RosterIcon from '@assets/solar_clipboard-bold.svg?url';
import ModulesIcon from '@assets/streamline-ultimate_module-three-bold.svg?url';
import TaManagementIcon from '@assets/fluent_person-settings-20-filled.svg?url';

export type UserRole = 'instructor' | 'student';

export interface SidebarItem {
  label: string;
  path: string;
  icon?: LucideIcon;
  iconSvg?: string; // For custom SVG icons
  /** Expandable item: chevron + nested child links (children have no icons). */
  children?: SidebarItem[];
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

const HOME: SidebarItem = { label: 'Home', path: '/app/home', icon: House };
const MESSAGES: SidebarItem = { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon };
const MY_CLASSES: SidebarItem = { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon };
const CREATE_CLASS: SidebarItem = { label: 'Create Class', path: '/app/create-class', icon: SquarePen };
const JOIN_CLASS: SidebarItem = { label: 'Join Class', path: '/app/join-class', icon: GraduationCap };

export const instructorClassItems: SidebarItem[] = [
  { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
  { label: 'Projects', path: '/app/projects', icon: List },
  { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
  { label: 'Modules', path: '/app/modules', iconSvg: ModulesIcon },
  { label: 'TA Management', path: '/app/ta-management', iconSvg: TaManagementIcon },
  { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
  { label: 'Final Reviews', path: '/app/ta-review/final-reviews', icon: ClipboardCheck },
];

export const studentClassItems: SidebarItem[] = [
  { label: 'Create Project', path: '/app/create-project', icon: SquarePen },
  { label: 'Browse Projects', path: '/app/browse-projects', icon: LayoutList },
  { label: 'My Project', path: '/app/my-project', icon: Folder },
  { label: 'Assignments', path: '/app/assignments', icon: ClipboardList },
  { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
  { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
];

export const taReviewItem: SidebarItem = {
  label: 'TA Review',
  path: '/app/ta-review',
  iconSvg: ModulesIcon,
  children: [
    { label: 'TSRs', path: '/app/ta-review' },
    { label: 'Final Reviews', path: '/app/ta-review/final-reviews' },
  ],
};

const SETTINGS_SECTION: SidebarSection = {
  title: 'Settings',
  items: [
    { label: 'Settings', path: '/app/settings', icon: Settings },
    { label: 'Help Center', path: '/app/help-center', icon: CircleQuestionMark },
  ],
};

/**
 * @deprecated Built from the account role, so a class you TA in still shows the
 * instructor sidebar to its owner and never adds "TA Review". Use `buildSidebarConfig`
 * with the class role instead. Removed once Sidebar.tsx reads it directly (Task 14).
 */
export const instructorSidebarConfig: SidebarSection[] = [
  { title: 'Main', items: [HOME, MESSAGES, MY_CLASSES, CREATE_CLASS] },
  { title: 'Class', items: instructorClassItems },
  SETTINGS_SECTION,
];

/**
 * @deprecated See `instructorSidebarConfig`. Removed once Sidebar.tsx reads
 * `buildSidebarConfig` directly (Task 14).
 */
export const studentSidebarConfig: SidebarSection[] = [
  { title: 'Main', items: [HOME, MESSAGES, JOIN_CLASS, MY_CLASSES] },
  { title: 'Class', items: studentClassItems },
  SETTINGS_SECTION,
];

/**
 * The sidebar for an account and its role in the selected class. The main section keeps each
 * account's familiar order; the class section follows the class role and is hidden with no class.
 */
export function buildSidebarConfig({
  canCreateClasses,
  classRole,
}: {
  canCreateClasses: boolean;
  classRole: ClassRole | null | undefined;
}): SidebarSection[] {
  const main = canCreateClasses
    ? [HOME, MESSAGES, MY_CLASSES, CREATE_CLASS]
    : [HOME, MESSAGES, JOIN_CLASS, MY_CLASSES];
  const sections: SidebarSection[] = [{ title: 'Main', items: main }];
  if (classRole === 'instructor') sections.push({ title: 'Class', items: instructorClassItems });
  else if (classRole === 'ta') sections.push({ title: 'Class', items: [...studentClassItems, taReviewItem] });
  else if (classRole === 'student') sections.push({ title: 'Class', items: studentClassItems });
  sections.push(SETTINGS_SECTION);
  return sections;
}
