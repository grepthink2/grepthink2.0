import {
  BookOpen, ClipboardList, FolderOpen, GraduationCap, ListChecks, MessageSquare, type LucideIcon,
} from 'lucide-react';
import type { ApiSearchItemType } from '@/lib/api/types';
import { initialsOf } from '../format';

const ICONS: Record<Exclude<ApiSearchItemType, 'person'>, LucideIcon> = {
  project: FolderOpen,
  task: ListChecks,
  story: BookOpen,
  conversation: MessageSquare,
  class: GraduationCap,
  assignment: ClipboardList,
};

interface EntityIconProps {
  type: ApiSearchItemType;
  /** The row title; people show its initials. */
  name: string;
}

/** 28 px type disc: initials for people, a glyph on the type's tint for everything else. */
export function EntityIcon({ type, name }: EntityIconProps) {
  if (type === 'person') {
    return <span className="gt-entity gt-entity--person" aria-hidden="true">{initialsOf(name)}</span>;
  }
  const Icon = ICONS[type];
  return (
    <span className={`gt-entity gt-entity--${type}`} aria-hidden="true">
      <Icon size={15} />
    </span>
  );
}
