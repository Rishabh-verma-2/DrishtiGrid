import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import useAuthStore from './store/authStore';
import useSocket from './hooks/useSocket';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import GISMapPage from './pages/GISMapPage';
import CameraMonitoringPage from './pages/CameraMonitoringPage';
import CameraManagementPage from './pages/CameraManagementPage';
import AlertsPage from './pages/AlertsPage';
import FootageRequestsPage from './pages/FootageRequestsPage';
import UsersPage from './pages/UsersPage';
import SystemHealthPage from './pages/SystemHealthPage';
import AuditLogsPage from './pages/AuditLogsPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import RoleRoute from './components/auth/RoleRoute';

// Protected route wrapper
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// Redirect logged-in users away from login
const PublicRoute = ({ children }) => {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
};

function App() {
  const { fetchMe, isAuthenticated } = useAuthStore();

  // Initialize socket connection (auto-connects when authenticated)
  useSocket();

  useEffect(() => {
    if (isAuthenticated) {
      fetchMe();
    }
  }, [isAuthenticated]);

  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      {/* Protected — all inside Dashboard layout */}
      <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        
        {/* Available to all authenticated roles: Admin, Police, Traffic Police */}
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="gis-map" element={<GISMapPage />} />
        <Route path="map" element={<Navigate to="/gis-map" replace />} />
        <Route path="gis" element={<Navigate to="/gis-map" replace />} />
        <Route path="camera-monitoring" element={<CameraMonitoringPage />} />
        <Route path="footage-requests" element={<FootageRequestsPage />} />
        <Route path="tickets" element={<Navigate to="/footage-requests" replace />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="alerts" element={<AlertsPage />} />

        {/* Restricted strictly to ADMIN role only */}
        <Route
          path="users"
          element={
            <RoleRoute roles={['ADMIN']}>
              <UsersPage />
            </RoleRoute>
          }
        />
        <Route
          path="camera-management"
          element={
            <RoleRoute roles={['ADMIN']}>
              <CameraManagementPage />
            </RoleRoute>
          }
        />
        <Route
          path="system-health"
          element={
            <RoleRoute roles={['ADMIN']}>
              <SystemHealthPage />
            </RoleRoute>
          }
        />
        <Route
          path="audit-logs"
          element={
            <RoleRoute roles={['ADMIN']}>
              <AuditLogsPage />
            </RoleRoute>
          }
        />
        <Route
          path="settings"
          element={
            <RoleRoute roles={['ADMIN']}>
              <SettingsPage />
            </RoleRoute>
          }
        />

        {/* Unauthorized 403 page */}
        <Route path="unauthorized" element={<UnauthorizedPage />} />
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
