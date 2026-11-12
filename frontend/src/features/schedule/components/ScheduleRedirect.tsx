import { Navigate, useLocation } from 'react-router-dom';

/**
 * /app/schedule, the week's old page: the week is on Home now. Its query string comes along, so an
 * old link or bookmark with `?day=` opens the same week there.
 */
export function ScheduleRedirect() {
  const { search } = useLocation();
  return <Navigate to={{ pathname: '/app/home', search }} replace />;
}
