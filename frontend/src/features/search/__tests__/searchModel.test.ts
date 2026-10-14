import { describe, expect, it } from 'vitest';
import {
  countByType, itemKey, matchQuality, paginate, rankResults, SEARCH_ENTITIES, type SearchItem,
} from '../searchModel';

const item = (over: Partial<SearchItem> & Pick<SearchItem, 'id' | 'type' | 'title'>): SearchItem => ({
  href: '/app/home',
  ...over,
});

const task = item({ id: 't1', type: 'task', key: 'GT-12', title: 'Importer rejects BOM', status: 'todo' });
const doneTask = item({ id: 't2', type: 'task', key: 'GT-7', title: 'Importer docs', status: 'done' });
const person = item({ id: 'u1', type: 'person', title: 'Rosa Trinh', subtitle: 'TA · CSE 115B', keywords: ['rtrinh@ucsc.edu'] });
const project = item({ id: 'p1', type: 'project', title: 'Rosa Trinh', subtitle: 'CSE 115B · 4 members' });
const planning = item({ id: 'p2', type: 'project', title: 'gt-12 planning' });
const unread = item({ id: 'c1', type: 'conversation', title: 'Roster thread', unread: 2, last_message_at: '2026-10-01T00:00:00Z' });
const read = item({ id: 'c2', type: 'conversation', title: 'Roster sync', unread: 0, last_message_at: '2026-10-09T00:00:00Z' });

describe('matchQuality', () => {
  it('scores exact key > exact title > key prefix > title prefix > word start > substring > context', () => {
    expect(matchQuality(task, 'gt-12')).toBe(100);
    expect(matchQuality(project, 'rosa trinh')).toBe(95);
    expect(matchQuality(task, 'gt-1')).toBe(90);
    expect(matchQuality(person, 'ros')).toBe(85);
    expect(matchQuality(task, 'rej')).toBe(75);
    expect(matchQuality(task, 'ects')).toBe(60);
    expect(matchQuality(person, 'rtrinh@')).toBe(40);
    expect(matchQuality(task, 'zzz')).toBe(0);
  });

  it('treats a blank or whitespace query as no match', () => {
    expect(matchQuality(task, '')).toBe(0);
    expect(matchQuality(task, '   ')).toBe(0);
  });
});

describe('rankResults', () => {
  it('puts an exact key match above a title prefix in another type', () => {
    expect(rankResults([planning, task], 'gt-12').map((i) => i.id)).toEqual(['t1', 'p2']);
  });

  it('orders equal matches by entity weight: tasks, stories, people, chats, projects, classes, assignments', () => {
    expect(SEARCH_ENTITIES.map((e) => e.type)).toEqual(['task', 'story', 'person', 'conversation', 'project', 'class', 'assignment']);
    expect(rankResults([project, person], 'rosa trinh').map((i) => i.id)).toEqual(['u1', 'p1']);
  });

  it('breaks ties within a type: open tasks before done, unread chats before read', () => {
    expect(rankResults([doneTask, task], 'importer').map((i) => i.id)).toEqual(['t1', 't2']);
    expect(rankResults([read, unread], 'roster').map((i) => i.id)).toEqual(['c1', 'c2']);
  });

  it('filters by scope and drops non-matches', () => {
    expect(rankResults([task, person, project], 'ros', { scope: 'person' }).map((i) => i.id)).toEqual(['u1']);
    expect(rankResults([task, person], 'zzz')).toEqual([]);
  });

  it('returns nothing for a whitespace-only query', () => {
    expect(rankResults([task, person], '   ')).toEqual([]);
  });

  it('lifts a recently opened item over an otherwise equal one', () => {
    const a = item({ id: 'p1', type: 'project', title: 'Roster Radar' });
    const b = item({ id: 'p2', type: 'project', title: 'Roster Robot' });
    expect(rankResults([a, b], 'roster', { recentKeys: [itemKey(b)] })[0].id).toBe('p2');
  });
});

describe('countByType and paginate', () => {
  const many = [
    ...Array.from({ length: 6 }, (_, i) => item({ id: `t${i}`, type: 'task', title: `Task ${i}` })),
    ...Array.from({ length: 5 }, (_, i) => item({ id: `p${i}`, type: 'project', title: `Project ${i}` })),
  ];

  it('counts per type', () => {
    expect(countByType(many)).toEqual({ task: 6, project: 5 });
  });

  it('pages 8 at a time and labels each type boundary with the whole-list count', () => {
    const first = paginate(many, 1);
    expect([first.from, first.to, first.total, first.pages]).toEqual([1, 8, 11, 2]);
    expect(first.rows.map((r) => (r.kind === 'group' ? `${r.label}:${r.count}` : r.item.id))).toEqual([
      'Tasks:6', 't0', 't1', 't2', 't3', 't4', 't5', 'Projects:5', 'p0', 'p1',
    ]);
    const second = paginate(many, 2);
    expect(second.rows.map((r) => (r.kind === 'group' ? r.label : r.item.id))).toEqual(['Projects', 'p2', 'p3', 'p4']);
  });

  it('clamps the page and reports 0–0 of 0 for an empty list', () => {
    expect(paginate(many, 9).page).toBe(2);
    expect(paginate([], 3)).toMatchObject({ rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
  });
});
