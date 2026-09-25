import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useClass, useSelectedClassRole } from '@/lib/classContext';
import {
  classLandingPath,
  isClassScopedPath,
  isPathAllowedForClassRole,
} from '@features/app/config/routePermissions';

/**
 * Keeps class pages to the roles they are for, using your role in the selected class. Lives
 * inside ClassProvider (it needs the class list) and waits for it before deciding.
 */
const ClassRouteGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { selectedClass } = useClass();
  const role = useSelectedClassRole();

  if (!isClassScopedPath(pathname)) return <>{children}</>;
  if (role === undefined) return <div className="class-route-guard" aria-busy="true" />;
  if (!selectedClass || role === null) return <Navigate to="/app/my-classes" replace />;
  if (!isPathAllowedForClassRole(pathname, role)) return <Navigate to={classLandingPath(role)} replace />;
  return <>{children}</>;
};

export default ClassRouteGuard;
