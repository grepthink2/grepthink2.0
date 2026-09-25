import type { ClassRole } from '@/lib/api';

/** Class pages only the class instructor may open. */
export const instructorOnlyPaths: string[] = [
  '/app/dashboard',
  '/app/projects',
  '/app/assign-projects',
  '/app/modules',
  '/app/ta-management',
  '/app/class-settings',
];

/** Class pages for students and TAs (TAs keep the student pages). */
export const learnerOnlyPaths: string[] = ['/app/browse-projects', '/app/my-project', '/app/assignments'];

export const CLASS_ROLE_LABELS: Record<ClassRole, string> = {
  instructor: 'Instructor',
  ta: 'TA',
  student: 'Student',
};

/** A page that only makes sense with a class selected and a matching role in it. */
export function isClassScopedPath(path: string): boolean {
  return instructorOnlyPaths.includes(path) || learnerOnlyPaths.includes(path);
}

/** True if your role in the selected class may open `path` (every other page is shared). */
export function isPathAllowedForClassRole(path: string, role: ClassRole | null | undefined): boolean {
  if (instructorOnlyPaths.includes(path)) return role === 'instructor';
  if (learnerOnlyPaths.includes(path)) return role === 'student' || role === 'ta';
  return true;
}

/** Where a class opens for your role in it. */
export function classLandingPath(role: ClassRole): string {
  if (role === 'instructor') return '/app/dashboard';
  if (role === 'ta') return '/app/ta-meetings';
  return '/app/my-project';
}

/** After switching to a class where you are `role`: stay (null) or go to its landing page. */
export function pathAfterClassSwitch(currentPath: string, role: ClassRole): string | null {
  return isPathAllowedForClassRole(currentPath, role) ? null : classLandingPath(role);
}
