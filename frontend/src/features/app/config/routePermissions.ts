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
 * Detail pages (`<prefix><id>`) and the list each belongs to, whose rule they follow. They pair the
 * id in the path with the selected class, so after a class switch the id means nothing.
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

/**
 * `path` as the rules compare it: lower-case, without trailing slashes. React Router matches paths
 * case-insensitively and accepts a trailing slash, so `/app/Dashboard/` opens the Dashboard too.
 */
function normalizePath(path: string): string {
  return path.toLowerCase().replace(/\/+$/, '') || '/';
}

function isFinalReviewsPath(path: string): boolean {
  return path === FINAL_REVIEWS_PATH || path.startsWith(`${FINAL_REVIEWS_PATH}/`);
}

/** The list a detail page belongs to; null for every other page. */
export function detailPageList(path: string): string | null {
  const normalized = normalizePath(path);
  if (isFinalReviewsPath(normalized)) return null;
  const page = DETAIL_PAGES.find(
    ({ prefix }) => normalized.startsWith(prefix) && normalized.length > prefix.length,
  );
  return page?.list ?? null;
}

/** The page whose rule applies to `path`: a detail page follows its list. */
function rulePath(path: string): string {
  return detailPageList(path) ?? normalizePath(path);
}

/** A page that only makes sense with a class selected and a matching role in it. */
export function isClassScopedPath(path: string): boolean {
  const page = rulePath(path);
  return instructorOnlyPaths.includes(page) || learnerOnlyPaths.includes(page) || taOnlyPaths.includes(page);
}

/** True if your role in the selected class may open `path` (every other page is shared). */
export function isPathAllowedForClassRole(path: string, role: ClassRole | null | undefined): boolean {
  const page = rulePath(path);
  if (instructorOnlyPaths.includes(page)) return role === 'instructor';
  if (learnerOnlyPaths.includes(page)) return role === 'student' || role === 'ta';
  if (taOnlyPaths.includes(page)) return role === 'ta';
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
