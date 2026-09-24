import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useClass } from '@/lib/classContext';
import { useEnrollmentRole } from '@/lib/enrollmentRole';

type GuardStatus = 'checking' | 'allow' | 'deny';

/**
 * Route guard for the Final Reviews pages (`/app/ta-review/final-reviews…`).
 *
 * Instructors always get through. A student only gets through when they're
 * the class TA for the selected class — the same `getMyEnrollmentRole`
 * signal Sidebar.tsx uses to decide whether to show the "TA Review" nav
 * group at all. This is the direct-URL backstop for that same check: without
 * it, a plain student who navigates (or has an old link) straight to the
 * route reaches the page and gets a raw backend error instead of a friendly
 * bounce.
 *
 * A pathless layout route (`<Route element={<RequireReviewAccess />}>`
 * wrapping both final-reviews routes, rendering `<Outlet />` on allow) —
 * NOT a per-route wrapper around `{children}`. Wrapping each route
 * individually would mount a fresh RequireReviewAccess (and re-run its
 * enrollment-role fetch) on every navigation between the list and detail
 * pages, even though both share the exact same access verdict; as a layout
 * route it stays mounted across that navigation so only the nested
 * `<Outlet />` content changes.
 */
export const RequireReviewAccess: React.FC = () => {
  const { role } = useAuth();
  const { selectedClass, loading: classesLoading } = useClass();
  // Ask only once ClassProvider has settled: treating "classes still loading"
  // as "no class" would flash-redirect a real TA off the page on a hard refresh.
  const classRole = useEnrollmentRole(
    role === 'instructor' || classesLoading ? undefined : selectedClass?.id,
  );

  let status: GuardStatus;
  if (role === 'instructor') status = 'allow';
  else if (classesLoading) status = 'checking';
  // No class selected and nothing left to load: the same "not a TA for this
  // class" signal Sidebar.tsx falls back to.
  else if (!selectedClass?.id) status = 'deny';
  else if (classRole === undefined) status = 'checking';
  else status = classRole === 'ta' ? 'allow' : 'deny';

  if (status === 'checking') {
    return <div className="require-review-access" aria-busy="true" />;
  }
  if (status === 'deny') {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
};

export default RequireReviewAccess;
