/**
 * The profile page's pure logic. The page renders only what the answer of
 * `GET /api/profiles/{user_id}` carries: the server decides who may read which field, and nothing
 * here adds to it.
 */
import { PROJECT_ROLES, toProjectRoleKey } from '@components/Badge/badgeStatus';
import { boardDocumentsPath } from '@features/documents/utils/documentLinks';
import type { ApiPersonProfile, ApiPersonSharedClass, ClassRole } from '@/lib/api';

/** What stands in for a person who has entered no name. Never their email. */
export const NO_NAME = 'No name yet';

export function displayName(name: string | null | undefined): string {
  return name?.trim() || NO_NAME;
}

const CLASS_ROLE_LABELS: Record<ClassRole, string> = { student: 'Student', ta: 'TA', instructor: 'Instructor' };

export function classRoleLabel(role: ClassRole): string {
  return CLASS_ROLE_LABELS[role];
}

export function profilePath(userId: string): string {
  return `/app/people/${userId}`;
}

export function teamPath(projectId: string): string {
  return `/app/projects/${projectId}`;
}

/** A class as a short label: its course code ("CSE 115A"), or its name when it has none. */
export function classLabel(entry: Pick<ApiPersonSharedClass, 'course_code' | 'class_name'>): string {
  return entry.course_code?.trim() || entry.class_name;
}

/** "Fall 2026", from whichever of the two the class has; null when it has neither. */
export function termLabel(term: string | null, year: number | null): string | null {
  return [term?.trim(), year == null ? '' : String(year)].filter(Boolean).join(' ') || null;
}

/** The schools of the classes shared, each named once, in the order met. */
export function schoolsOf(shared: ApiPersonSharedClass[]): string[] {
  const names: string[] = [];
  for (const entry of shared) {
    const name = entry.institution?.name;
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** The selected class first, then the active classes, then the completed ones, each in the answer's order. */
export function orderShared(shared: ApiPersonSharedClass[], currentClassId?: string | null): ApiPersonSharedClass[] {
  const rank = (entry: ApiPersonSharedClass) => {
    if (entry.class_id === currentClassId) return 0;
    return entry.status === 'complete' ? 2 : 1;
  };
  return shared
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
    .map(({ entry }) => entry);
}

export interface StaffLink {
  key: 'board' | 'documents';
  label: string;
  detail: string;
  to: string;
}

/** The staff views of one team: its board, and its documents. */
export function staffLinksFor(entry: ApiPersonSharedClass): StaffLink[] {
  if (!entry.team) return [];
  const id = entry.team.project_id;
  return [
    { key: 'board', label: 'Team board', detail: entry.team.name, to: `${teamPath(id)}/board` },
    { key: 'documents', label: 'Documents', detail: 'Reports and test plans', to: boardDocumentsPath(id) },
  ];
}

const isStaff = (role: ClassRole) => role === 'ta' || role === 'instructor';

/**
 * A "For staff" group for each shared class where the viewer is staff and the person is a student
 * on a team. None on a person's own page, and none while a class is previewed as a student.
 */
export function staffGroups(
  profile: ApiPersonProfile,
  isPreviewing: boolean,
): { entry: ApiPersonSharedClass; links: StaffLink[] }[] {
  if (isPreviewing || profile.is_self) return [];
  return profile.shared
    .filter((entry) => isStaff(entry.viewer_role) && entry.role === 'student' && entry.team)
    .map((entry) => ({ entry, links: staffLinksFor(entry) }));
}

/** The school email, when the answer carries one and no class is being previewed as a student. */
export function schoolEmailOf(profile: ApiPersonProfile, isPreviewing: boolean): string | null {
  return isPreviewing ? null : profile.person.school_email || null;
}

const GITHUB_HANDLE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;
const LINKEDIN_HANDLE = /^[A-Za-z0-9_%.-]{3,100}$/;

/**
 * What a person typed, as a handle on `host`: without a scheme, `www.`, the host itself, a query, a
 * fragment and a trailing slash. Null for a value that names any other site, or carries a scheme
 * that is not http.
 */
function handleOn(host: string, value: string | null | undefined): string | null {
  let rest = (value ?? '').trim();
  if (!rest) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(rest);
  if (scheme) {
    if (!/^https?:\/\//i.test(rest)) return null;
    rest = rest.replace(/^https?:\/\//i, '');
  }
  rest = rest.replace(/^www\./i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (rest.toLowerCase().startsWith(`${host}/`)) return rest.slice(host.length + 1) || null;
  // Anything else with a dot before its first slash names a site, and it is not this one.
  const first = rest.split('/')[0];
  if (scheme || (first.includes('.') && rest.includes('/')) || rest.toLowerCase() === host) return null;
  return rest;
}

/** "bopark", "@bopark" or its github.com address → the profile's link; null for anything else. */
export function githubLink(value: string | null | undefined): { href: string; label: string } | null {
  const handle = handleOn('github.com', value)?.replace(/^@/, '');
  if (!handle || !GITHUB_HANDLE.test(handle)) return null;
  return { href: `https://github.com/${handle}`, label: `github.com/${handle}` };
}

/** "maya-chen", "in/maya-chen" or its linkedin.com address → the profile's link; null for anything else. */
export function linkedinLink(value: string | null | undefined): { href: string; label: string } | null {
  const handle = handleOn('linkedin.com', value)?.replace(/^in\//i, '');
  if (!handle || !LINKEDIN_HANDLE.test(handle)) return null;
  return { href: `https://www.linkedin.com/in/${handle}`, label: `linkedin.com/in/${handle}` };
}

/** Nothing filled in beyond the name: no photo, GitHub or LinkedIn. */
export function isSparse(person: ApiPersonProfile['person']): boolean {
  return !person.image_url && !person.github && !person.linkedin;
}

/** The hover card's first line: "Student · CSE 115A". */
export function roleLine(role: ClassRole, label: string): string {
  return `${classRoleLabel(role)} · ${label}`;
}

/** The hover card's second line: "Trailhead · Product Owner", the team alone for a role with no name. */
export function teamLine(teamName: string | null | undefined, projectRole?: string | null): string | null {
  if (!teamName) return null;
  const key = toProjectRoleKey(projectRole);
  return key ? `${teamName} · ${PROJECT_ROLES[key][1]}` : teamName;
}
