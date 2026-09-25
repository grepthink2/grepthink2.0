/**
 * What a class membership means to the UI: the API row → `Class` mapping, the role the UI shows,
 * the schools, and the class switcher's per-school list. Pure helpers for ClassProvider, plus the
 * last-class-per-school storage the school switcher reads.
 */
import type { ApiClass, ClassRole } from './api';
import type { Class, School } from './classContext';

/** API row → Class. An older backend omits `my_role`: a class you created is yours to teach. */
export function toClass(raw: ApiClass, userId: string | undefined): Class {
  return {
    ...raw,
    my_role: raw.my_role ?? (userId !== undefined && raw.created_by === userId ? 'instructor' : 'student'),
    institution: raw.institution ?? null,
  };
}

/**
 * `next`, keeping each object of `previous` whose row did not change (and `previous` itself when
 * nothing changed), so pages that compare classes by identity do not reload on a refresh.
 */
export function reuseUnchangedClasses(previous: Class[], next: Class[]): Class[] {
  const before = new Map(previous.map((c) => [c.id, c]));
  const merged = next.map((c) => {
    const old = before.get(c.id);
    return old && JSON.stringify(old) === JSON.stringify(c) ? old : c;
  });
  const unchanged = merged.length === previous.length && merged.every((c, i) => c === previous[i]);
  return unchanged ? previous : merged;
}

/** The schools of `classes`, once each, by name. Classes with no school add none. */
export function distinctSchools(classes: Class[]): School[] {
  const byId = new Map<string, School>();
  for (const c of classes) {
    if (c.institution && !byId.has(c.institution.id)) byId.set(c.institution.id, c.institution);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The class switcher's list at `schoolId`: that school's classes plus the classes with no school,
 * or every class when none of them is at that school, so the list is never empty.
 */
export function classesForSchool(classes: Class[], schoolId: string): Class[] {
  const listed = classes.filter((c) => c.institution === null || c.institution.id === schoolId);
  return listed.some((c) => c.institution !== null) ? listed : classes;
}

/** The role the UI shows: the class "view class as student" previews shows as a student's. */
export function roleInView(cls: Class, previewClassId: string | null): ClassRole {
  return cls.id === previewClassId && cls.my_role === 'instructor' ? 'student' : cls.my_role;
}

const LAST_CLASS_BY_SCHOOL_KEY = 'grepthink-last-class-by-school';

/** The class last used at each school (school id → class id). */
export function loadLastClassBySchool(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(LAST_CLASS_BY_SCHOOL_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function rememberClassForSchool(schoolId: string, classId: string): void {
  try {
    localStorage.setItem(
      LAST_CLASS_BY_SCHOOL_KEY,
      JSON.stringify({ ...loadLastClassBySchool(), [schoolId]: classId }),
    );
  } catch {
    // Storage full or unavailable — the switcher falls back to the school's first class.
  }
}
