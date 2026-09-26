import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import PageFallback from '@features/app/components/PageFallback';
import {
  classLandingPath,
  isClassScopedPath,
  isPathAllowedForClassRole,
} from '@features/app/config/routePermissions';

/**
 * Keeps class pages to the roles they are for, using your role in the selected class. Lives
 * inside ClassProvider (it needs the class list) and waits for it before deciding. The rules match
 * paths as the router does (percent-decoded, any case, trailing slashes) and hold a detail page to
 * its list's rule.
 */
const ClassRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { selectedClass } = useClass();
  const role = useSelectedClassRole();

  if (!isClassScopedPath(pathname)) return <>{children}</>;
  if (role === undefined) return <PageFallback />;
  if (!selectedClass || role === null) return <Navigate to="/app/my-classes" replace />;
  if (!isPathAllowedForClassRole(pathname, role)) return <Navigate to={classLandingPath(role)} replace />;
  return <>{children}</>;
};

export default ClassRouteGuard;
