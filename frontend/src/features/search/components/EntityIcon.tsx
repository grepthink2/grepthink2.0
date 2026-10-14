import {
  BookOpen, ClipboardList, FolderOpen, GraduationCap, ListChecks, MessageSquare, type LucideIcon,
} from 'lucide-react';
import type { ApiSearchItemType } from '@/lib/api/types';
import { initialsOf } from '../format';

/** Keyed by string so a type this client doesn't know yet looks up as undefined. */
const ICONS: Partial<Record<string, LucideIcon>> = {
  project: FolderOpen,
  task: ListChecks,
  story: BookOpen,
  conversation: MessageSquare,
  class: GraduationCap,
  assignment: ClipboardList,
} satisfies Record<Exclude<ApiSearchItemType, 'person'>, LucideIcon>;

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
  // An unknown type (a newer server) falls back to the task glyph, as the design does.
  const Icon = ICONS[type] ?? ListChecks;
  return (
    <span className={`gt-entity gt-entity--${type}`} aria-hidden="true">
      <Icon size={15} />
    </span>
  );
}
