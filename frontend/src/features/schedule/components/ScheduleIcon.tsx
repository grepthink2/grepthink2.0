import {
  ArrowRight, BookOpen, CalendarDays, CalendarPlus, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, ClipboardCheck,
  Clock, DoorOpen, Flag, Globe, MapPin, RefreshCw, Users, Video, type LucideIcon,
} from 'lucide-react';

/** The glyphs the schedule family draws, by the names `kindMeta` and the design's components use. */
const ICONS: Partial<Record<string, LucideIcon>> = {
  video: Video,
  'clipboard-check': ClipboardCheck,
  users: Users,
  'book-open': BookOpen,
  'door-open': DoorOpen,
  flag: Flag,
  clock: Clock,
  'calendar-days': CalendarDays,
  'calendar-plus': CalendarPlus,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-down': ChevronDown,
  'map-pin': MapPin,
  'refresh-cw': RefreshCw,
  'circle-alert': CircleAlert,
  globe: Globe,
  'arrow-right': ArrowRight,
};

export interface ScheduleIconProps {
  /** video · clipboard-check · users · book-open · door-open · flag · clock · calendar-days · calendar-plus · chevron-left/right/down · map-pin · refresh-cw · circle-alert · globe · arrow-right */
  name: string;
  /** @default 16 */
  size?: number;
  className?: string;
}

/** A lucide glyph by name. A name this client does not know (a newer server's kind) draws a calendar. */
export function ScheduleIcon({ name, size = 16, className }: ScheduleIconProps) {
  const Icon = ICONS[name] ?? CalendarDays;
  return <Icon size={size} className={className} aria-hidden="true" focusable="false" />;
}
