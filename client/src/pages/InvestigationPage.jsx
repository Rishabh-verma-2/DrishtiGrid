import useAuthStore from '../store/authStore';
import AdminInvestigationPortal from '../components/investigation/AdminInvestigationPortal';
import UnifiedDepartmentPortal from '../components/investigation/UnifiedDepartmentPortal';

/**
 * Unified Role-Based Investigation Page:
 * - ADMIN / SUPERADMIN: Admin Command Center (Centralized review, Master Watchlist creation & direct distribution)
 * - ALL LAW ENFORCEMENT DEPARTMENTS (Police Stations, Traffic Police, Crime Branch, Highway Patrol, SOG):
 *   Unified Department Investigation Portal (Case requisitions, AI surveillance searches, evidence submission & resolution)
 */
export default function InvestigationPage() {
  const { user } = useAuthStore();

  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  if (isAdmin) {
    return <AdminInvestigationPortal user={user} />;
  }

  return <UnifiedDepartmentPortal user={user} />;
}
