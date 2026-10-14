/**
 * Pure search model for the ⌘K palette: entity metadata, ranking, scope counts and paging.
 * No React, no DOM. Port of design/components/search/SearchModel.jsx (spec §3), minus the
 * team and action types and with tie-breaks on the fields the index actually carries.
 */
import type { ApiSearchItem, ApiSearchItemType } from '@/lib/api/types';

export type SearchItem = ApiSearchItem;
export type SearchScope = ApiSearchItemType | 'all';

export interface SearchEntityMeta {
  type: ApiSearchItemType;
  label: string;
  /** Orders equal matches: higher first. */
  weight: number;
}

/** Group order = importance when match quality ties. */
export const SEARCH_ENTITIES: readonly SearchEntityMeta[] = [
  { type: 'task', label: 'Tasks', weight: 8 },
  { type: 'story', label: 'Stories', weight: 7 },
  { type: 'person', label: 'People', weight: 6 },
  { type: 'conversation', label: 'Chats', weight: 5 },
  { type: 'project', label: 'Projects', weight: 4 },
  { type: 'class', label: 'Classes', weight: 2 },
  { type: 'assignment', label: 'Assignments', weight: 1 },
];

const META = new Map(SEARCH_ENTITIES.map((e) => [e.type, e] as const));

export const PAGE_SIZE = 8;

export function entityLabel(type: ApiSearchItemType): string {
  return META.get(type)?.label ?? type;
}

/** Identity across types: a project and a conversation could share an id. */
export function itemKey(item: Pick<SearchItem, 'type' | 'id'>): string {
  return `${item.type}:${item.id}`;
}

function weightOf(type: ApiSearchItemType): number {
  return META.get(type)?.weight ?? 0;
}

/** 0–100: exact key > exact title > key prefix > title prefix > word start > substring > context. */
export function matchQuality(item: SearchItem, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const key = (item.key ?? '').toLowerCase();
  const title = item.title.toLowerCase();
  const context = [item.subtitle, ...(item.keywords ?? [])]
    .filter((s): s is string => Boolean(s))
    .join(' ')
    .toLowerCase();
  if (key && key === q) return 100;
  if (title === q) return 95;
  if (key && key.startsWith(q)) return 90;
  if (title.startsWith(q)) return 85;
  if (title.split(/\s+/).some((w) => w.startsWith(q))) return 75;
  if (title.includes(q)) return 60;
  if (context.includes(q)) return 40;
  return 0;
}

const time = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() : 0);

/** Per-type tie-breaks; lower sorts first. */
function tieBreak(item: SearchItem): number[] {
  switch (item.type) {
    case 'task':
      return [item.status === 'done' ? 1 : 0, -time(item.updated_at)];
    case 'conversation':
      return [item.unread ? 0 : 1, -time(item.last_message_at)];
    case 'person':
      return [item.same_project ? 0 : 1];
    default:
      return [-time(item.updated_at)];
  }
}

function compareArrays(a: number[], b: number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export interface RankOptions {
  scope?: SearchScope;
  /** `itemKey`s of recently opened items; they get a small boost. */
  recentKeys?: readonly string[];
}

/** Score = match quality + entity weight × 0.5 (+2 when recent). Quality dominates. */
export function rankResults(
  items: readonly SearchItem[],
  query: string,
  opts: RankOptions = {},
): SearchItem[] {
  const { scope = 'all', recentKeys = [] } = opts;
  const recent = new Set(recentKeys);
  return items
    .filter((it) => scope === 'all' || it.type === scope)
    .map((it) => {
      const quality = matchQuality(it, query);
      const boost = recent.has(itemKey(it)) ? 2 : 0;
      return { item: it, quality, score: quality + weightOf(it.type) * 0.5 + boost };
    })
    .filter((r) => r.quality > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.type !== b.item.type) return weightOf(b.item.type) - weightOf(a.item.type);
      return compareArrays(tieBreak(a.item), tieBreak(b.item));
    })
    .map((r) => r.item);
}

export function countByType(items: readonly SearchItem[]): Partial<Record<ApiSearchItemType, number>> {
  const counts: Partial<Record<ApiSearchItemType, number>> = {};
  for (const it of items) counts[it.type] = (counts[it.type] ?? 0) + 1;
  return counts;
}

export type PaletteRow =
  | { kind: 'group'; type: ApiSearchItemType; label: string; count: number }
  | { kind: 'item'; item: SearchItem };

export interface PageResult {
  rows: PaletteRow[];
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
}

/** One page of a ranked list, with a group label wherever the type changes. */
export function paginate(ranked: readonly SearchItem[], page = 1, pageSize = PAGE_SIZE): PageResult {
  const total = ranked.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * pageSize;
  const slice = ranked.slice(start, start + pageSize);
  const counts = countByType(ranked);
  const rows: PaletteRow[] = [];
  let prev: ApiSearchItemType | null = null;
  for (const it of slice) {
    if (it.type !== prev) {
      rows.push({ kind: 'group', type: it.type, label: entityLabel(it.type), count: counts[it.type] ?? 0 });
      prev = it.type;
    }
    rows.push({ kind: 'item', item: it });
  }
  return { rows, page: p, pages, total, from: total ? start + 1 : 0, to: Math.min(start + pageSize, total) };
}
