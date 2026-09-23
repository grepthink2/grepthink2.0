import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/**
 * Renders child routes only when the user has a session and a role.
 * No session: redirects to /login and stores the current path for redirect-after-login.
 * A session whose profile has no role yet (a Google signup that has not chosen one):
 * redirects to /select, because every role-gated endpoint would refuse them in here.
 */
export const ProtectedRoute: React.FC = () => {
  const { session, loading, needsRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="protected-route-loading" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        Loading...
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (needsRole) {
    return <Navigate to="/select" replace />;
  }

  return <Outlet />;
};
