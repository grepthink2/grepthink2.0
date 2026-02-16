import type { UserRole } from './sidebar';

/** Paths only instructors may access. Students are redirected to /app/home if they hit these. */
export const instructorOnlyPaths: string[] = [
  '/app/dashboard',
  '/app/projects',
  '/app/roster',
  '/app/modules',
  '/app/ta-management',
];

/** Paths only students may access. Instructors are redirected to /app/home if they hit these. */
export const studentOnlyPaths: string[] = [
  '/app/join-class',
  '/app/browse-projects',
  '/app/my-project',
];

/** Returns true if the given path is allowed for the given role. */
export function isPathAllowedForRole(path: string, role: UserRole): boolean {
  if (instructorOnlyPaths.includes(path)) return role === 'instructor';
  if (studentOnlyPaths.includes(path)) return role === 'student';
  return true; // shared paths (home, messages, my-classes, settings, help-center)
}
