import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useIsAuthenticated } from '@/lib/useAuthStore';

export default function RequireAuth() {
  const authed = useIsAuthenticated();
  const loc = useLocation();
  if (!authed) {
    return <Navigate to="/" state={{ from: loc }} replace />;
  }
  return <Outlet />;
}
