// Intentional addition: SEARCH_ENTITIES, SearchModel — confirmed, no counterpart in the Figma kit; named after the codebase (readme.md → Intentional additions).
import type { SearchEntityType } from './EntityIcon';

export type { SearchEntityType };

/** One searchable thing. Only `id`, `type`, `title` are required; the rest feeds context lines, ranking and routing. */
export interface SearchItem {
  id: string;
  type: SearchEntityType;
  title: string;
  /** Short key shown in mono (GT-12, US-4). Exact key match ranks first. */
  key?: string;
  /** One-line context (role · class · team, sprint, members…). */
  subtitle?: string;
  email?: string;
  keywords?: string[];
  /** Task / story */
  projectId?: string;
  status?: 'todo' | 'in_progress' | 'done';
  dueAt?: string;          // ISO
  points?: number;
  estimateHours?: number;
  tags?: string[];
  assignedToMe?: boolean;
  /** Story only */
  tasksDone?: number; tasksTotal?: number; sprint?: string;
  /** Conversation */
  unread?: number; lastMessageAt?: string;
  /** Person */
  role?: string; sameTeam?: boolean; sameClass?: boolean; conversationId?: string;
  /** Team / project / class */
  memberCount?: number; archived?: boolean; updatedAt?: string; term?: string;
  /** Assignment */
  kind?: 'tsr' | 'feedback' | 'interest_form';
  /** Action */
  href?: string;
}

export interface SearchEntityMeta { type: SearchEntityType; label: string; plural: string; weight: number; }

export type PaletteRow =
  | { kind: 'group'; type: SearchEntityType; label: string; count: number }
  | { kind: 'item'; item: SearchItem };

export interface PageResult { rows: PaletteRow[]; page: number; pages: number; total: number; from: number; to: number; }

export const SEARCH_ENTITIES: SearchEntityMeta[];
export function rankResults(items: SearchItem[], query: string, opts?: { scope?: SearchEntityType | 'all'; recentIds?: string[] }): SearchItem[];
export function countByType(items: SearchItem[]): Partial<Record<SearchEntityType, number>>;
export function paginate(ranked: SearchItem[], page?: number, pageSize?: number): PageResult;
export function routeFor(item: SearchItem, opts?: { role?: 'student' | 'ta' | 'instructor' }): string | null;
export function useDebounced<T>(value: T, ms?: number): T;
export const SearchModel: {
  rankResults: typeof rankResults; countByType: typeof countByType; paginate: typeof paginate; routeFor: typeof routeFor; entities: SearchEntityMeta[];
};
