import type { ClassRole } from '@/lib/api';

/** Class pages only the class instructor may open. */
export const instructorOnlyPaths: readonly string[] = [
  '/app/dashboard',
  '/app/projects',
  '/app/assign-projects',
  '/app/staff-projects',
  '/app/modules',
  '/app/ta-management',
  '/app/class-settings',
];

/** Class pages for students and TAs (TAs keep the student pages). */
export const learnerOnlyPaths: readonly string[] = ['/app/browse-projects', '/app/my-project', '/app/assignments'];

/**
 * Class pages only a TA of the class may open: TA Review, and each review in it
 * (`/app/ta-review/<id>`). Final Reviews, also under `/app/ta-review/`, is for instructors and TAs
 * alike, and RequireReviewAccess guards it.
 */
export const taOnlyPaths: readonly string[] = ['/app/ta-review'];

const FINAL_REVIEWS_PATH = '/app/ta-review/final-reviews';

/**
 * Detail pages (`<prefix><id>`) and the list each belongs to. They pair the id in the path with the
 * selected class, so after a class switch the id means nothing.
 */
const DETAIL_PAGES: readonly { prefix: string; list: string }[] = [
  { prefix: '/app/assignments/', list: '/app/assignments' },
  { prefix: '/app/modules/tsr/', list: '/app/modules' },
  { prefix: '/app/modules/feedback/', list: '/app/modules' },
  { prefix: '/app/ta-review/', list: '/app/ta-review' },
];

export const CLASS_ROLE_LABELS: Record<ClassRole, string> = {
  instructor: 'Instructor',
  ta: 'TA',
  student: 'Student',
};

function isFinalReviewsPath(path: string): boolean {
  return path === FINAL_REVIEWS_PATH || path.startsWith(`${FINAL_REVIEWS_PATH}/`);
}

/** The list a detail page belongs to; null for every other page. */
function detailPageList(path: string): string | null {
  if (isFinalReviewsPath(path)) return null;
  const page = DETAIL_PAGES.find(({ prefix }) => path.startsWith(prefix) && path.length > prefix.length);
  return page?.list ?? null;
}

function isTaOnlyPath(path: string): boolean {
  return taOnlyPaths.includes(path) || detailPageList(path) === '/app/ta-review';
}

/** A page that only makes sense with a class selected and a matching role in it. */
export function isClassScopedPath(path: string): boolean {
  return instructorOnlyPaths.includes(path) || learnerOnlyPaths.includes(path) || isTaOnlyPath(path);
}

/** True if your role in the selected class may open `path` (every other page is shared). */
export function isPathAllowedForClassRole(path: string, role: ClassRole | null | undefined): boolean {
  if (instructorOnlyPaths.includes(path)) return role === 'instructor';
  if (learnerOnlyPaths.includes(path)) return role === 'student' || role === 'ta';
  if (isTaOnlyPath(path)) return role === 'ta';
  return true;
}

/** Where a class opens for your role in it. */
export function classLandingPath(role: ClassRole): string {
  if (role === 'instructor') return '/app/dashboard';
  if (role === 'ta') return '/app/ta-meetings';
  return '/app/my-project';
}

/**
 * After switching to a class where you are `role`: stay (null) or go to its landing page. A detail
 * page of the class you left goes to its list instead, when your role may open that list.
 */
export function pathAfterClassSwitch(currentPath: string, role: ClassRole): string | null {
  const list = detailPageList(currentPath);
  if (isPathAllowedForClassRole(list ?? currentPath, role)) return list;
  return classLandingPath(role);
}
