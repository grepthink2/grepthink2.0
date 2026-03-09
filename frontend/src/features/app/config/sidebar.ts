import { GoHomeFill } from "react-icons/go";
import { BiSolidDashboard } from "react-icons/bi";
import { RiGraduationCapFill } from "react-icons/ri";
import { IoIosCreate } from "react-icons/io";
import { TiThList } from "react-icons/ti";
import { FaFolder, FaListUl } from "react-icons/fa6";
import { TbSettingsFilled } from "react-icons/tb";
import { IoHelpCircle } from "react-icons/io5";
import { MdAssignment } from "react-icons/md";
import type { IconType } from 'react-icons';

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
  icon?: IconType;
  iconSvg?: string; // For custom SVG icons
}

export interface SidebarSection {
  title: string;
  items: SidebarItem[];
}

export const instructorSidebarConfig: SidebarSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', path: '/app/home', icon: GoHomeFill },
      { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon },
      { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon },
      { label: 'Create Class', path: '/app/create-class', icon: IoIosCreate },
    ],
  },
  {
    title: 'Class',
    items: [
      { label: 'Dashboard', path: '/app/dashboard', icon: BiSolidDashboard },
      { label: 'Projects', path: '/app/projects', icon: FaListUl },
      { label: 'Roster', path: '/app/roster', iconSvg: RosterIcon },
      { label: 'Modules', path: '/app/modules', iconSvg: ModulesIcon },
      { label: 'TA Management', path: '/app/ta-management', iconSvg: TaManagementIcon },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', path: '/app/settings', icon: TbSettingsFilled },
      { label: 'Help Center', path: '/app/help-center', icon: IoHelpCircle },
    ],
  },
];

export const studentSidebarConfig: SidebarSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', path: '/app/home', icon: GoHomeFill },
      { label: 'Messages', path: '/app/messages', iconSvg: MessagesIcon },
      { label: 'Join Class', path: '/app/join-class', icon: RiGraduationCapFill },
      { label: 'My Classes', path: '/app/my-classes', iconSvg: MyClassesIcon },
    ],
  },
  {
    title: 'Class',
    items: [
      { label: 'Create Project', path: '/app/create-project', icon: IoIosCreate },
      { label: 'Browse Projects', path: '/app/browse-projects', icon: TiThList },
      { label: 'My Project', path: '/app/my-project', icon: FaFolder },
      { label: 'Assignments', path: '/app/assignments', icon: MdAssignment},
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Settings', path: '/app/settings', icon: TbSettingsFilled },
      { label: 'Help Center', path: '/app/help-center', icon: IoHelpCircle },
    ],
  },
];
