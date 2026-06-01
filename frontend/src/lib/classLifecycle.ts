import { addDays, isAfter, parseISO, startOfDay } from 'date-fns';
import type { Class } from './classContext';
import type { ClassLifecycleStatus, ClassPreferenceMap } from './classPreferences';

const FULL_TERM_NAMES = new Set(['fall', 'winter', 'spring']);

/** Last day of auto-generated TSR cycle — aligns with backend class controller. */
export function getEstimatedCourseEnd(classItem: Class): Date | null {
  const raw = classItem.start_date;
  if (!raw) return null;
  const day = raw.slice(0, 10);
  const start = startOfDay(parseISO(day));
  const termLower = (classItem.term ?? '').trim().toLowerCase();
  const tsrCount = FULL_TERM_NAMES.has(termLower) ? 8 : 3;
  const firstTsrOpen = addDays(start, 14);
  return addDays(firstTsrOpen, (tsrCount - 1) * 7 + 6);
}

export function isClassCompletedByDate(classItem: Class): boolean {
  const end = getEstimatedCourseEnd(classItem);
  if (!end) return false;
  return isAfter(startOfDay(new Date()), end);
}

export function getClassDisplayStatus(
  classItem: Class,
  preferences: ClassPreferenceMap,
): ClassLifecycleStatus {
  const pref = preferences[classItem.id];
  if (pref?.status) return pref.status;
  return isClassCompletedByDate(classItem) ? 'completed' : 'active';
}

export function isClassHidden(classId: string, preferences: ClassPreferenceMap): boolean {
  return Boolean(preferences[classId]?.hidden);
}
