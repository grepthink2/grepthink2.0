import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiClass } from '../api';
import type { Class } from '../classContext';
import {
  classesForSchool,
  distinctSchools,
  loadLastClassBySchool,
  rememberClassForSchool,
  reuseUnchangedClasses,
  roleInView,
  toClass,
} from '../classMembership';

const UCSC = { id: 'ucsc', name: 'UC Santa Cruz', slug: 'ucsc' };
const IST = { id: 'ist', name: 'İstinye University', slug: 'istinye' };

function row(id: string, extra: Partial<ApiClass> = {}): ApiClass {
  return { id, name: id, created_by: 'someone', created_at: '2026-01-01', ...extra };
}

function klass(id: string, extra: Partial<Class> = {}): Class {
  return {
    id,
    name: id,
    created_by: 'someone',
    created_at: '2026-01-01',
    my_role: 'student',
    institution: null,
    ...extra,
  };
}

describe('toClass', () => {
  it('keeps the role and school the backend sends', () => {
    const c = toClass(row('a', { my_role: 'ta', institution: UCSC }), 'me');
    expect(c.my_role).toBe('ta');
    expect(c.institution).toEqual(UCSC);
  });

  it('derives the role an older backend omits: instructor of a class you created, else student', () => {
    expect(toClass(row('mine', { created_by: 'me' }), 'me').my_role).toBe('instructor');
    expect(toClass(row('joined'), 'me').my_role).toBe('student');
    expect(toClass(row('mine', { created_by: 'me' }), undefined).my_role).toBe('student');
  });

  it('gives a class with no school a null institution', () => {
    expect(toClass(row('a'), 'me').institution).toBeNull();
  });
});

describe('reuseUnchangedClasses', () => {
  it('returns the previous list when nothing changed', () => {
    const previous = [klass('a'), klass('b')];
    expect(reuseUnchangedClasses(previous, [klass('a'), klass('b')])).toBe(previous);
  });

  it('keeps each unchanged object and takes the changed one, in a new list', () => {
    const previous = [klass('a'), klass('b')];
    const changed = klass('b', { enrolled_count: 3 });
    const next = reuseUnchangedClasses(previous, [klass('a'), changed]);
    expect(next).not.toBe(previous);
    expect(next[0]).toBe(previous[0]);
    expect(next[1]).toBe(changed);
  });

  it('builds a new list when classes are added, removed or reordered', () => {
    const previous = [klass('a'), klass('b')];
    const added = reuseUnchangedClasses(previous, [klass('a'), klass('b'), klass('c')]);
    const removed = reuseUnchangedClasses(previous, [klass('a')]);
    const reordered = reuseUnchangedClasses(previous, [klass('b'), klass('a')]);
    for (const next of [added, removed, reordered]) expect(next).not.toBe(previous);
    expect(added.slice(0, 2)).toEqual(previous);
    expect(added[0]).toBe(previous[0]);
    expect(removed[0]).toBe(previous[0]);
    expect(reordered[0]).toBe(previous[1]);
    expect(reordered[1]).toBe(previous[0]);
  });
});

describe('distinctSchools', () => {
  it('lists each school once, by name, skipping classes with none', () => {
    const schools = distinctSchools([
      klass('a', { institution: UCSC }),
      klass('b', { institution: IST }),
      klass('c', { institution: UCSC }),
      klass('d'),
    ]);
    expect(schools.map((s) => s.id)).toEqual(['ist', 'ucsc']);
  });
});

describe('classesForSchool', () => {
  const atUcsc = klass('a1', { institution: UCSC });
  const atIst = klass('b1', { institution: IST });
  const noSchool = klass('n1');

  it("keeps the school's classes and the classes with no school", () => {
    expect(classesForSchool([atUcsc, atIst, noSchool], 'ucsc')).toEqual([atUcsc, noSchool]);
  });

  it('keeps every class when the school has none of them', () => {
    expect(classesForSchool([atUcsc, atIst, noSchool], 'gatech')).toEqual([atUcsc, atIst, noSchool]);
  });
});

describe('roleInView', () => {
  it('shows the previewed class you teach as a student’s, and every other class as it is', () => {
    const taught = klass('t', { my_role: 'instructor' });
    expect(roleInView(taught, 't')).toBe('student');
    expect(roleInView(taught, null)).toBe('instructor');
    expect(roleInView(taught, 'other')).toBe('instructor');
    expect(roleInView(klass('assisted', { my_role: 'ta' }), 'assisted')).toBe('ta');
  });
});

describe('the last class used at each school', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('remembers one class per school', () => {
    rememberClassForSchool('ucsc', 'a1');
    rememberClassForSchool('ist', 'b1');
    rememberClassForSchool('ucsc', 'a2');
    expect(loadLastClassBySchool()).toEqual({ ucsc: 'a2', ist: 'b1' });
  });

  it('reads unreadable storage as nothing remembered', () => {
    localStorage.setItem('grepthink-last-class-by-school', 'not json');
    expect(loadLastClassBySchool()).toEqual({});
    localStorage.setItem('grepthink-last-class-by-school', 'null');
    expect(loadLastClassBySchool()).toEqual({});
  });

  it('shrugs off storage that refuses writes', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => rememberClassForSchool('ucsc', 'a1')).not.toThrow();
  });
});
