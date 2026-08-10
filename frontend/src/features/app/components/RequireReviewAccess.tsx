import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useClass } from '@/lib/classContext';
import { api } from '@/lib/api';

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
  const [status, setStatus] = useState<GuardStatus>(role === 'instructor' ? 'allow' : 'checking');

  useEffect(() => {
    let cancelled = false;
    // Every branch's setState lives inside this async IIFE (rather than
    // directly in the effect body) so none of them are lexically direct
    // statements of the effect callback — same pattern as Sidebar.tsx's
    // isTaForClass check, which satisfies react-hooks/set-state-in-effect
    // without changing timing (the synchronous branches below still run
    // before any await, on the same tick as every other render-phase effect).
    void (async () => {
      if (role === 'instructor') {
        if (!cancelled) setStatus('allow');
        return;
      }

      // ClassProvider hasn't resolved `selectedClass` yet — wait, rather
      // than treating "no class" as a verdict. Otherwise every hard refresh
      // would flash-redirect a real TA off the page while classes load.
      if (classesLoading) {
        if (!cancelled) setStatus('checking');
        return;
      }

      const classId = selectedClass?.id;
      if (!classId) {
        // No class selected and nothing left to load — same "not a TA for
        // this class" signal Sidebar.tsx falls back to.
        if (!cancelled) setStatus('deny');
        return;
      }

      if (!cancelled) setStatus('checking');
      try {
        const { enrollment_role } = await api.getMyEnrollmentRole(classId);
        if (!cancelled) setStatus(enrollment_role === 'ta' ? 'allow' : 'deny');
      } catch {
        if (!cancelled) setStatus('deny');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [role, selectedClass?.id, classesLoading]);

  if (status === 'checking') {
    return <div className="require-review-access" aria-busy="true" />;
  }
  if (status === 'deny') {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
};

export default RequireReviewAccess;
