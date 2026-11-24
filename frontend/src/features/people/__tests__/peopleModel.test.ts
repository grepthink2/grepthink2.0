import { describe, expect, it } from 'vitest';
import type { ApiPersonProfile, ApiPersonSharedClass } from '@/lib/api';
import {
  classLabel,
  classRoleLabel,
  displayName,
  githubLink,
  isSparse,
  linkedinLink,
  orderShared,
  profilePath,
  roleLine,
  schoolEmailOf,
  schoolsOf,
  staffGroups,
  teamLine,
  teamPath,
  termLabel,
} from '../peopleModel';

const cls = (over: Partial<ApiPersonSharedClass> = {}): ApiPersonSharedClass => ({
  class_id: 'c1',
  class_name: 'Software Engineering',
  course_code: 'CSE 115A',
  term: 'Fall',
  year: 2026,
  status: 'active',
  institution: { id: 'i1', name: 'UC Santa Cruz' },
  role: 'student',
  viewer_role: 'student',
  team: { project_id: 'p1', name: 'Trailhead', project_role: 'product owner', members: [] },
  ...over,
});

const person: ApiPersonProfile['person'] = { id: 'u', name: 'Bo Park', image_url: null, github: null, linkedin: null };

const profile = (shared: ApiPersonSharedClass[], isSelf = false): ApiPersonProfile => ({
  person,
  shared,
  is_self: isSelf,
});

describe('peopleModel', () => {
  it('words names, roles, classes and terms', () => {
    expect(displayName('Bo Park')).toBe('Bo Park');
    expect(displayName('')).toBe('No name yet');
    expect(displayName('   ')).toBe('No name yet');
    expect(displayName(null)).toBe('No name yet');
    expect(classRoleLabel('student')).toBe('Student');
    expect(classRoleLabel('ta')).toBe('TA');
    expect(classRoleLabel('instructor')).toBe('Instructor');
    expect(classLabel(cls())).toBe('CSE 115A');
    expect(classLabel(cls({ course_code: null }))).toBe('Software Engineering');
    expect(termLabel('Fall', 2026)).toBe('Fall 2026');
    expect(termLabel(null, 2026)).toBe('2026');
    expect(termLabel('Fall', null)).toBe('Fall');
    expect(termLabel(null, null)).toBeNull();
  });

  it('builds the paths', () => {
    expect(profilePath('u1')).toBe('/app/people/u1');
    expect(teamPath('p1')).toBe('/app/projects/p1');
  });

  it("writes the hover card's two lines", () => {
    expect(roleLine('student', 'CSE 115A')).toBe('Student · CSE 115A');
    expect(teamLine('Trailhead', 'product owner')).toBe('Trailhead · Product Owner');
    expect(teamLine('Trailhead', 'something else')).toBe('Trailhead');
    expect(teamLine('Trailhead', null)).toBe('Trailhead');
    expect(teamLine('Trailhead')).toBe('Trailhead');
    expect(teamLine(null)).toBeNull();
    expect(teamLine(undefined, 'member')).toBeNull();
  });

  it('names each school once, and none for a class without one', () => {
    const sjsu = { id: 'i2', name: 'San José State' };
    expect(
      schoolsOf([
        cls(),
        cls({ class_id: 'c2' }),
        cls({ class_id: 'c3', institution: null }),
        cls({ class_id: 'c4', institution: sjsu }),
      ]),
    ).toEqual(['UC Santa Cruz', 'San José State']);
    expect(schoolsOf([])).toEqual([]);
  });

  it('orders the selected class first, then active classes, then completed ones', () => {
    const list = [cls({ class_id: 'done', status: 'complete' }), cls({ class_id: 'a' }), cls({ class_id: 'sel' })];
    expect(orderShared(list, 'sel').map((s) => s.class_id)).toEqual(['sel', 'a', 'done']);
    expect(orderShared(list).map((s) => s.class_id)).toEqual(['a', 'sel', 'done']);
    expect(orderShared(list, 'done').map((s) => s.class_id)).toEqual(['done', 'a', 'sel']);
  });

  it('gives staff two links, for a class where the person is a student on a team', () => {
    const staffed = cls({ viewer_role: 'ta' });
    const groups = staffGroups(profile([staffed, cls({ class_id: 'c2' })]), false);
    expect(groups).toHaveLength(1);
    expect(groups[0].entry.class_id).toBe('c1');
    expect(groups[0].links).toEqual([
      { key: 'board', label: 'Team board', detail: 'Trailhead', to: '/app/projects/p1/board' },
      {
        key: 'documents',
        label: 'Documents',
        detail: 'Reports and test plans',
        to: '/app/projects/p1/board?view=documents',
      },
    ]);
    expect(staffGroups(profile([cls({ viewer_role: 'instructor' })]), false)).toHaveLength(1);
  });

  it('gives no staff links in preview, on your own page, to a classmate, or without a student on a team', () => {
    const staffed = cls({ viewer_role: 'ta' });
    expect(staffGroups(profile([staffed]), true)).toEqual([]);
    expect(staffGroups(profile([staffed], true), false)).toEqual([]);
    expect(staffGroups(profile([cls()]), false)).toEqual([]);
    expect(staffGroups(profile([cls({ viewer_role: 'instructor', role: 'ta' })]), false)).toEqual([]);
    expect(staffGroups(profile([cls({ viewer_role: 'ta', team: null })]), false)).toEqual([]);
  });

  it('shows the school email only when the answer carries it, and never in preview', () => {
    const carried: ApiPersonProfile = { person: { ...person, school_email: 'bo@ucsc.edu' }, shared: [], is_self: false };
    expect(schoolEmailOf(carried, false)).toBe('bo@ucsc.edu');
    expect(schoolEmailOf(carried, true)).toBeNull();
    expect(schoolEmailOf(profile([]), false)).toBeNull();
    expect(schoolEmailOf({ ...carried, person: { ...person, school_email: null } }, false)).toBeNull();
  });

  it('calls a profile sparse when it has no photo, GitHub or LinkedIn', () => {
    expect(isSparse(person)).toBe(true);
    expect(isSparse({ ...person, github: 'bopark' })).toBe(false);
    expect(isSparse({ ...person, image_url: 'https://img/bo.png' })).toBe(false);
  });

  it.each([
    ['bopark', 'https://github.com/bopark'],
    ['  bopark  ', 'https://github.com/bopark'],
    ['@bopark', 'https://github.com/bopark'],
    ['https://github.com/bopark/', 'https://github.com/bopark'],
    ['http://www.github.com/bopark', 'https://github.com/bopark'],
    ['github.com/bopark?tab=repositories', 'https://github.com/bopark'],
    ['GitHub.com/BoPark#readme', 'https://github.com/BoPark'],
    ['https://evil.example/bopark', null],
    ['https://github.com.evil.example/bopark', null],
    ['javascript:alert(1)', null],
    ['bo park', null],
    ['bopark/repo', null],
    ['-bopark', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('githubLink(%j) leads to %j', (value, href) => {
    expect(githubLink(value)?.href ?? null).toBe(href);
  });

  it.each([
    ['maya-chen', 'https://www.linkedin.com/in/maya-chen'],
    ['in/maya-chen', 'https://www.linkedin.com/in/maya-chen'],
    ['https://www.linkedin.com/in/maya-chen/', 'https://www.linkedin.com/in/maya-chen'],
    ['linkedin.com/in/maya-chen?trk=x', 'https://www.linkedin.com/in/maya-chen'],
    ['https://evil.example/in/maya-chen', null],
    ['javascript:alert(1)', null],
    ['maya chen', null],
    ['ab', null],
    [null, null],
  ])('linkedinLink(%j) leads to %j', (value, href) => {
    expect(linkedinLink(value)?.href ?? null).toBe(href);
  });

  it('labels a link with its host and handle', () => {
    expect(githubLink('bopark')).toEqual({ href: 'https://github.com/bopark', label: 'github.com/bopark' });
    expect(linkedinLink('maya-chen')).toEqual({
      href: 'https://www.linkedin.com/in/maya-chen',
      label: 'linkedin.com/in/maya-chen',
    });
  });
});
