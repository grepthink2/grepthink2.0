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

// Tie-break groups: each matches its query equally and differs only in the field under test.
const olderTask = item({ id: 't3', type: 'task', title: 'Importer retries', status: 'todo', updated_at: '2026-10-01T00:00:00Z' });
const newerTask = item({ id: 't4', type: 'task', title: 'Importer retries', status: 'todo', updated_at: '2026-10-09T00:00:00Z' });
const newerDoneTask = item({ id: 't5', type: 'task', title: 'Importer retries', status: 'done', updated_at: '2026-10-12T00:00:00Z' });
const olderChat = item({ id: 'c3', type: 'conversation', title: 'Standup notes', unread: 0, last_message_at: '2026-10-01T00:00:00Z' });
const newerChat = item({ id: 'c4', type: 'conversation', title: 'Standup notes', unread: 0, last_message_at: '2026-10-09T00:00:00Z' });
const teammate = item({ id: 'u2', type: 'person', title: 'Sam Ortiz', same_project: true });
const classmate = item({ id: 'u3', type: 'person', title: 'Sam Patel', same_project: false });
const unsetMate = item({ id: 'u4', type: 'person', title: 'Sam Quinn', same_project: null });
const olderProject = item({ id: 'p3', type: 'project', title: 'Roster Radar', updated_at: '2026-10-01T00:00:00Z' });
const newerProject = item({ id: 'p4', type: 'project', title: 'Roster Radar', updated_at: '2026-10-09T00:00:00Z' });

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

  it('scores a subtitle-only match as context (40)', () => {
    // `project` has no keywords, so only its subtitle ('CSE 115B · 4 members') can match.
    expect(matchQuality(project, '115b')).toBe(40);
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

  it('breaks task ties on open before done, then newest updated_at', () => {
    expect(rankResults([olderTask, newerTask], 'importer').map((i) => i.id)).toEqual(['t4', 't3']);
    expect(rankResults([newerDoneTask, olderTask], 'importer').map((i) => i.id)).toEqual(['t3', 't5']);
  });

  it('breaks read chat ties on newest last_message_at', () => {
    expect(rankResults([olderChat, newerChat], 'standup').map((i) => i.id)).toEqual(['c4', 'c3']);
  });

  it('breaks people ties on same_project first; false and null tie', () => {
    expect(rankResults([classmate, unsetMate, teammate], 'sam').map((i) => i.id)).toEqual(['u2', 'u3', 'u4']);
    expect(rankResults([unsetMate, classmate, teammate], 'sam').map((i) => i.id)).toEqual(['u2', 'u4', 'u3']);
  });

  it('breaks ties for every other type on newest updated_at', () => {
    expect(rankResults([olderProject, newerProject], 'roster').map((i) => i.id)).toEqual(['p4', 'p3']);
  });

  it('breaks a score tie between types on entity weight', () => {
    // Substring matches (60): task 60 + 8 × 0.5 = 64; recent project 60 + 4 × 0.5 + 2 = 64.
    const checklist = item({ id: 't6', type: 'task', title: 'Prerelease checklist' });
    const demo = item({ id: 'p5', type: 'project', title: 'Prerelease demo' });
    expect(rankResults([demo, checklist], 'release', { recentKeys: [itemKey(demo)] }).map((i) => i.id)).toEqual(['t6', 'p5']);
  });

  it('ranks match quality above entity weight', () => {
    // Exact title 95 + project 4 × 0.5 = 97 beats word start 75 + task 8 × 0.5 = 79.
    const importer = item({ id: 'p6', type: 'project', title: 'Importer' });
    const fix = item({ id: 't7', type: 'task', title: 'Fix importer' });
    expect(rankResults([fix, importer], 'importer').map((i) => i.id)).toEqual(['p6', 't7']);
    // The closest case: 5 quality points (exact title 95 vs key prefix 90) outweigh the widest
    // weight gap, 3.5 (assignment 1 × 0.5 vs task 8 × 0.5).
    const gt = item({ id: 'a1', type: 'assignment', title: 'GT' });
    expect(rankResults([task, gt], 'gt').map((i) => i.id)).toEqual(['a1', 't1']);
  });

  it('gives a recent item 2 points, enough to pass a person at equal quality', () => {
    // Title prefixes (85): recent project 85 + 4 × 0.5 + 2 = 89; person 85 + 6 × 0.5 = 88.
    const marketplace = item({ id: 'p7', type: 'project', title: 'Marketplace' });
    const maria = item({ id: 'u5', type: 'person', title: 'Maria Lopez' });
    expect(rankResults([maria, marketplace], 'mar', { recentKeys: [itemKey(marketplace)] }).map((i) => i.id)).toEqual(['p7', 'u5']);
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

describe('optional fields', () => {
  /** Every optional field as an explicit null; typed so a new field on the index must be added here. */
  const NULLS: Record<Exclude<keyof SearchItem, 'id' | 'type' | 'title' | 'href'>, null> = {
    key: null, subtitle: null, keywords: null, project_id: null, class_id: null, status: null, tags: null,
    points: null, sprint: null, due_at: null, unread: null, last_message_at: null, same_project: null, updated_at: null,
  };
  const omitted = [
    task, doneTask, person, project, planning, unread, read, olderTask, newerTask, newerDoneTask,
    olderChat, newerChat, teammate, classmate, olderProject, newerProject,
  ];
  const nulled: SearchItem[] = omitted.map((i) => ({ ...NULLS, ...i }));

  it('treats an explicit null like an omitted field', () => {
    const queries = ['gt-12', 'gt-1', 'rosa trinh', 'ro', 'rej', 'ects', 'rtrinh@', '115b', 'importer', 'roster', 'standup', 'sam', 'zzz'];
    for (const q of queries) {
      expect(nulled.map((i) => matchQuality(i, q))).toEqual(omitted.map((i) => matchQuality(i, q)));
      expect(rankResults(nulled, q).map((i) => i.id)).toEqual(rankResults(omitted, q).map((i) => i.id));
    }
  });
});
