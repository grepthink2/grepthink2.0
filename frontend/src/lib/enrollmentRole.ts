/**
 * The caller's role in a class (GET /api/tas/classes/{id}/my-role), shared by
 * the sidebar, the review route guard and the pages that all ask on one load.
 */
import { useEffect, useState } from 'react';
import { api, type EnrollmentRole } from './api';
import { useAuth } from './auth';

/** 'instructor' for the class owner, 'student' or 'ta' when enrolled, otherwise null. */
export type ClassEnrollmentRole = 'instructor' | EnrollmentRole | null;

/** Covers one page load's burst of callers; short enough that a promotion to TA shows up soon. */
const CACHE_MS = 30_000;

const cache = new Map<string, { at: number; promise: Promise<ClassEnrollmentRole> }>();

/** One request per user and class per CACHE_MS; concurrent callers share it and failures are not kept. */
export function fetchEnrollmentRole(
  classId: string,
  userId: string | undefined,
): Promise<ClassEnrollmentRole> {
  const key = `${userId ?? ''}:${classId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = api
    .getMyEnrollmentRole(classId)
    .then(({ enrollment_role }) => enrollment_role ?? null);
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

export function clearEnrollmentRoleCache(): void {
  cache.clear();
}

/**
 * The caller's role in `classId`: `undefined` while loading, and `null` with no
 * class, when not enrolled, or when the request fails. Never returns the role
 * for a previous class while the next one loads.
 */
export function useEnrollmentRole(
  classId: string | null | undefined,
): ClassEnrollmentRole | undefined {
  const { user } = useAuth();
  const userId = user?.id;
  const key = classId ? `${userId ?? ''}:${classId}` : null;
  const [resolved, setResolved] = useState<{ key: string; role: ClassEnrollmentRole } | null>(null);

  useEffect(() => {
    if (!classId || !key) return;
    let cancelled = false;
    fetchEnrollmentRole(classId, userId).then(
      (role) => {
        if (!cancelled) setResolved({ key, role });
      },
      () => {
        if (!cancelled) setResolved({ key, role: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [classId, userId, key]);

  if (!key) return null;
  return resolved?.key === key ? resolved.role : undefined;
}
