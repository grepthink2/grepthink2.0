import React from 'react';

/**
 * Pure search model: entity metadata, ranking, routing and pagination.
 * No UI. The codebase ports this to `features/search/searchModel.ts`.
 */

/** Group order = importance when match quality ties (brief: tasks → people → chats → projects → teams). */
export const SEARCH_ENTITIES = [
  { type: 'task',         label: 'Tasks',         plural: 'tasks',         weight: 8 },
  { type: 'story',        label: 'Stories',       plural: 'stories',       weight: 7 },
  { type: 'person',       label: 'People',        plural: 'people',        weight: 6 },
  { type: 'conversation', label: 'Chats',         plural: 'chats',         weight: 5 },
  { type: 'project',      label: 'Projects',      plural: 'projects',      weight: 4 },
  { type: 'team',         label: 'Teams',         plural: 'teams',         weight: 3 },
  { type: 'class',        label: 'Classes',       plural: 'classes',       weight: 2 },
  { type: 'assignment',   label: 'Assignments',   plural: 'assignments',   weight: 1 },
  { type: 'action',       label: 'Actions',       plural: 'actions',       weight: 0 },
];

const ENTITY_BY_TYPE = Object.fromEntries(SEARCH_ENTITIES.map((e) => [e.type, e]));

/** 0–100 match quality: exact key > exact title > prefix > word start > substring > none. */
function matchQuality(item, q) {
  if (!q) return 50;
  const ql = q.toLowerCase();
  const key = (item.key || '').toLowerCase();
  const title = (item.title || '').toLowerCase();
  const hay = [item.subtitle, item.email, ...(item.keywords || [])].filter(Boolean).join(' ').toLowerCase();
  if (key && key === ql) return 100;
  if (title === ql) return 95;
  if (key && key.startsWith(ql)) return 90;
  if (title.startsWith(ql)) return 85;
  if (title.split(/\s+/).some((w) => w.startsWith(ql))) return 75;
  if (title.includes(ql)) return 60;
  if (hay.includes(ql)) return 40;
  return 0;
}

/** Entity-specific tie-breaks, lower = earlier. */
function tieBreak(item) {
  switch (item.type) {
    case 'task':
    case 'story': {
      const done = item.status === 'done' ? 1 : 0;                       // open work first
      const due = item.dueAt ? new Date(item.dueAt).getTime() : Infinity; // soonest due first
      const est = Number.isFinite(item.estimateHours) ? item.estimateHours : 999; // then smaller estimates
      return [done, due, est];
    }
    case 'conversation':
      return [item.unread ? 0 : 1, -(item.lastMessageAt ? new Date(item.lastMessageAt).getTime() : 0)];
    case 'person':
      return [item.sameTeam ? 0 : 1, item.sameClass ? 0 : 1];
    default:
      return [item.archived ? 1 : 0, -(item.updatedAt ? new Date(item.updatedAt).getTime() : 0)];
  }
}

function cmpArrays(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * Rank: score = matchQuality + entityWeight (small) + recency boost (small).
 * Match quality dominates; entity order only decides among equal matches.
 */
export function rankResults(items, query, { scope = 'all', recentIds = [] } = {}) {
  const q = String(query || '').trim();
  const recent = new Set(recentIds);
  return items
    .filter((it) => scope === 'all' || it.type === scope)
    .map((it) => {
      const mq = matchQuality(it, q);
      const w = (ENTITY_BY_TYPE[it.type] || { weight: 0 }).weight;
      const mine = it.assignedToMe ? 3 : 0;
      const rec = recent.has(it.id) ? 2 : 0;
      return { item: it, mq, score: mq + w * 0.5 + mine + rec };
    })
    .filter((r) => r.mq > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.type !== b.item.type) return (ENTITY_BY_TYPE[b.item.type]?.weight ?? 0) - (ENTITY_BY_TYPE[a.item.type]?.weight ?? 0);
      return cmpArrays(tieBreak(a.item), tieBreak(b.item));
    })
    .map((r) => r.item);
}

/** Counts per entity type for the scope chips. */
export function countByType(items) {
  return items.reduce((acc, it) => { acc[it.type] = (acc[it.type] || 0) + 1; return acc; }, {});
}

/** Slice a ranked list into a page; returns rows with group labels inserted at type boundaries. */
export function paginate(ranked, page = 1, pageSize = 8) {
  const total = ranked.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * pageSize;
  const slice = ranked.slice(start, start + pageSize);
  const rows = [];
  let prev = null;
  slice.forEach((it) => {
    if (it.type !== prev) {
      rows.push({ kind: 'group', type: it.type, label: (ENTITY_BY_TYPE[it.type] || {}).label || it.type, count: ranked.filter((r) => r.type === it.type).length });
      prev = it.type;
    }
    rows.push({ kind: 'item', item: it });
  });
  return { rows, page: p, pages, total, from: total ? start + 1 : 0, to: Math.min(start + pageSize, total) };
}

/**
 * Route for an entity — mirrors App.tsx. `role` picks the instructor/student
 * assignment route. Returns null where the codebase has no route yet (see NOTES).
 */
export function routeFor(item, { role = 'student' } = {}) {
  switch (item.type) {
    case 'project':      return `/app/projects/${item.projectId || item.id}`;
    case 'team':         return item.projectId ? `/app/projects/${item.projectId}` : null;      // no team route — gap
    case 'task':         return `/app/projects/${item.projectId}/board?task=${item.id}`;
    case 'story':        return `/app/projects/${item.projectId}/board?view=backlog&story=${item.id}`; // ?story= is new — gap
    case 'conversation': return `/app/messages/${item.id}`;
    case 'person':       return item.conversationId ? `/app/messages/${item.conversationId}` : `/app/messages/compose?to=${item.id}`;
    case 'class':        return role === 'student' ? '/app/my-classes' : `/app/dashboard?class=${item.id}`; // class select is sidebar state — gap
    case 'assignment':   return role === 'student' ? `/app/assignments/${item.id}` : `/app/modules/${item.kind || 'tsr'}/${item.id}`;
    case 'action':       return item.href || null;
    default:             return null;
  }
}

export const SearchModel = { rankResults, countByType, paginate, routeFor, entities: SEARCH_ENTITIES };

/** Tiny hook: debounced value (250ms default) for async sources. */
export function useDebounced(value, ms = 250) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
