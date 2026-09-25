import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useClass, useSelectedClassRole } from '@/lib/classContext';

type GuardStatus = 'checking' | 'allow' | 'deny';

/**
 * Route guard for the Final Reviews pages (`/app/ta-review/final-reviews…`).
 *
 * The instructor and the TAs of the selected class get through, by your role
 * in that class (useSelectedClassRole), not the account role: an account can
 * teach one class and TA another. This is the direct-URL backstop for the
 * sidebar, which offers Final Reviews only to those roles: without it, a
 * student who navigates (or has an old link) straight to the route reaches
 * the page and gets a raw backend error instead of a friendly bounce.
 *
 * A pathless layout route (`<Route element={<RequireReviewAccess />}>`
 * wrapping both final-reviews routes, rendering `<Outlet />` on allow) —
 * NOT a per-route wrapper around `{children}`. As a layout route it stays
 * mounted while you move between the list and detail pages, which share the
 * same verdict, so only the nested `<Outlet />` content changes.
 */
export const RequireReviewAccess: React.FC = () => {
  const { selectedClass, loading } = useClass();
  const role = useSelectedClassRole();

  let status: GuardStatus;
  // Wait for the class list: treating "classes still loading" as "no class"
  // would flash-redirect a real TA off the page on a hard refresh.
  if (loading || role === undefined) status = 'checking';
  else if (!selectedClass) status = 'deny';
  else status = role === 'instructor' || role === 'ta' ? 'allow' : 'deny';

  if (status === 'checking') {
    return <div className="require-review-access" aria-busy="true" />;
  }
  if (status === 'deny') {
    return <Navigate to="/app" replace />;
  }
  return <Outlet />;
};

export default RequireReviewAccess;
