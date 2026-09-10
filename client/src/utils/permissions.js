/**
 * DrishtiGrid RBAC & Feature Permissions System
 * Conforming to Government Security Directives
 */

export const PERMISSION_DEFINITIONS = [
  {
    key: 'gis_map',
    label: 'GIS Camera Map',
    category: 'Surveillance & Geospatial',
    description: 'Interactive GIS map, optical coverage buffers, and spatial layer discovery.',
    defaultRoles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'],
  },
  {
    key: 'camera_monitoring',
    label: 'Live Feeds Monitoring',
    category: 'Surveillance & Geospatial',
    description: 'Multi-pane CCTV video wall and high-definition live streaming grid.',
    defaultRoles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'],
  },
  {
    key: 'anpr',
    label: 'ANPR Surveillance Engine',
    category: 'AI & Analytics',
    description: 'Automatic Number Plate Recognition, hit detection, and vehicle watchlist.',
    defaultRoles: ['ADMIN', 'TRAFFIC_POLICE'],
  },
  {
    key: 'crowd',
    label: 'Crowd & Density AI',
    category: 'AI & Analytics',
    description: 'YOLO-based crowd surge analysis, density heatmaps, and pedestrian thresholds.',
    defaultRoles: ['ADMIN', 'POLICE'],
  },
  {
    key: 'footage_requests',
    label: 'Footage Requisition Management',
    category: 'Inter-Department Workflow',
    description: 'Inter-departmental CCTV footage requests, legal justifications, and evidence chain of custody.',
    defaultRoles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'],
  },
  {
    key: 'camera_add',
    label: 'Add Individual Cameras',
    category: 'Infrastructure & Registry',
    description: 'Manual camera onboarding, RTSP stream URL registration, and geocoding.',
    defaultRoles: ['ADMIN'],
  },
  {
    key: 'bulk_import',
    label: 'Bulk Camera Import',
    category: 'Infrastructure & Registry',
    description: 'Bulk CSV, JSON, and GeoJSON ingestion with automated schema validation.',
    defaultRoles: ['ADMIN'],
  },
  {
    key: 'reports',
    label: 'Department Reports & Escalations',
    category: 'Inter-Department Workflow',
    description: 'Outage notices, compliance reporting, and cross-department incident tickets.',
    defaultRoles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'],
  },
  {
    key: 'system_health',
    label: 'System Health Diagnostics',
    category: 'Administration & Diagnostics',
    description: 'Real-time telemetry, RTSP probe status, packet loss, and CPU/memory metrics.',
    defaultRoles: ['ADMIN'],
  },
  {
    key: 'audit_logs',
    label: 'Security & Access Audit Logs',
    category: 'Administration & Diagnostics',
    description: 'Immutable SHA-256 tamper-evident logs for Section 65B Indian Evidence Act compliance.',
    defaultRoles: ['ADMIN'],
  },
];

export const ROLE_DEFAULT_PERMISSIONS = {
  ADMIN: PERMISSION_DEFINITIONS.map((p) => p.key),
  POLICE: ['gis_map', 'camera_monitoring', 'crowd', 'footage_requests', 'reports'],
  TRAFFIC_POLICE: ['gis_map', 'camera_monitoring', 'anpr', 'footage_requests', 'reports'],
};

/**
 * Check if the user has access to a particular feature permission.
 * ADMIN and SUPERADMIN roles always evaluate to true.
 */
export function hasPermission(user, permissionKey) {
  if (!user) return false;
  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'SUPERADMIN') return true;

  // Check explicit permissions array from user model
  if (Array.isArray(user.permissions) && user.permissions.length > 0) {
    return user.permissions.includes(permissionKey);
  }

  // Check effective permissions from backend
  if (Array.isArray(user.effectivePermissions) && user.effectivePermissions.length > 0) {
    return user.effectivePermissions.includes(permissionKey);
  }

  // Fallback to role defaults
  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || ROLE_DEFAULT_PERMISSIONS.POLICE;
  return defaults.includes(permissionKey);
}

/**
 * Verify whether a camera falls strictly under the logged-in user's department jurisdiction.
 * - ADMIN: Always returns true (Statewide unrestricted command).
 * - Non-admin: Returns true ONLY if camera belongs to their department.
 */
export function isCameraInUserDepartment(user, camera) {
  if (!user || !camera) return false;
  const role = String(user.role || '').toUpperCase();
  if (role === 'ADMIN' || role === 'SUPERADMIN') return true;

  const camDeptCode = String(camera.departmentCode || '').toUpperCase();
  const camDeptName = String(camera.departmentName || camera.department || '').toLowerCase();
  const userDept = String(user.department || '').toLowerCase();

  const isTrafficUser = role === 'TRAFFIC_POLICE' || userDept.includes('traffic');
  const isTrafficCam = camDeptCode === 'TRAFFIC' || camDeptName.includes('traffic');

  if (isTrafficUser && isTrafficCam) return true;
  if (isTrafficUser && !isTrafficCam) return false;

  const isPoliceUser = role === 'POLICE' || userDept.includes('police');
  const isPoliceCam = (camDeptCode === 'POLICE' || camDeptName.includes('police')) && !camDeptName.includes('traffic');

  if (isPoliceUser && isPoliceCam) return true;
  if (isPoliceUser && isTrafficCam) return false;

  if (userDept && camDeptName) {
    if (userDept.includes(camDeptName) || camDeptName.includes(userDept)) {
      return true;
    }
  }

  return false;
}

export default {
  PERMISSION_DEFINITIONS,
  ROLE_DEFAULT_PERMISSIONS,
  hasPermission,
  isCameraInUserDepartment,
};
