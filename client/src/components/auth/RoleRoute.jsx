import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/authStore';
import UnauthorizedPage from '../../pages/UnauthorizedPage';
import { hasPermission } from '../../utils/permissions';

/**
 * RoleRoute Guard
 * Protects frontend routes against unauthorized roles or missing permissions
 * If unauthorized, immediately renders UnauthorizedPage (403)
 */
export default function RoleRoute({ roles = [], permission, children }) {
  const { user, isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 1. If a granular permission is required, verify permission
  if (permission && !hasPermission(user, permission)) {
    return <UnauthorizedPage />;
  }

  // 2. If roles array is specified, verify role
  if (roles.length > 0) {
    const userRole = String(user?.role || '').toUpperCase();
    const allowed = roles.map((r) => String(r).toUpperCase());

    // Normalize legacy aliases
    const normalizedRole =
      ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
      ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
      ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : userRole;

    const hasAccess = allowed.includes(normalizedRole) || normalizedRole === 'ADMIN';

    if (!hasAccess) {
      return <UnauthorizedPage />;
    }
  }

  return children;
}
