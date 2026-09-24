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

export const instructorSidebarConfig: SidebarSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', path: '/app/home', icon: House },
      { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon },
      { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon },
      { label: 'Create Class', path: '/app/create-class', icon: SquarePen },
    ],
  },
  {
    title: 'Class',
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: LayoutDashboard },
      { label: 'Projects', path: '/app/projects', icon: List },
      { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
      { label: 'Modules', path: '/app/modules', iconSvg: ModulesIcon },
      { label: 'TA Management', path: '/app/ta-management', iconSvg: TaManagementIcon },
      { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
      { label: 'Final Reviews', path: '/app/ta-review/final-reviews', icon: ClipboardCheck },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', path: '/app/settings', icon: Settings },
      { label: 'Help Center', path: '/app/help-center', icon: CircleQuestionMark },
    ],
  },
];

export const studentSidebarConfig: SidebarSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', path: '/app/home', icon: House },
      { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon },
      { label: 'Join Class', path: '/app/join-class', icon: GraduationCap },
      { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon },
    ],
  },
  {
    title: 'Class',
    items: [
      { label: 'Create Project', path: '/app/create-project', icon: SquarePen },
      { label: 'Browse Projects', path: '/app/browse-projects', icon: LayoutList },
      { label: 'My Project', path: '/app/my-project', icon: Folder },
      { label: 'Assignments', path: '/app/assignments', icon: ClipboardList },
      { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
      { label: 'TA Meetings', path: '/app/ta-meetings', icon: Users },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', path: '/app/settings', icon: Settings },
      { label: 'Help Center', path: '/app/help-center', icon: CircleQuestionMark },
    ],
  },
];
