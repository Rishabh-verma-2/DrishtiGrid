import { useState, useMemo } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Map, Camera, Video, Bell, Settings,
  LogOut, Shield, ChevronLeft, ChevronRight, Activity,
  Users, Menu, X, Sun, Moon, Landmark, FileText, BarChart3, Lock, Car,
  UserCog, ShieldAlert
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useSocketStore from '../../store/socketStore';
import { useThemeStore } from '../../store/themeStore';
import GovernmentLogo from '../common/GovernmentLogo';
import NotificationCenter from '../notifications/NotificationCenter';
import { notificationAPI, footageTicketAPI, investigationAPI } from '../../api';
import { hasPermission } from '../../utils/permissions';
import toast from 'react-hot-toast';
import ErrorBoundary from '../common/ErrorBoundary';

const ALL_NAV_ITEMS = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard',             labelGu: 'ડેશબોર્ડ',           roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'] },
  { to: '/notifications',       icon: Bell,            label: 'Notification Hub',      labelGu: 'સૂચના કેન્દ્ર',        roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], isNotificationTab: true },
  { to: '/gis-map',             icon: Map,             label: 'GIS Camera Map',         labelGu: 'નકશો (GIS)',         roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'gis_map' },
  { to: '/camera-monitoring',   icon: Video,           label: 'Live Monitoring',        labelGu: 'લાઇવ ફીડ્સ',          roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'camera_monitoring' },
  { to: '/anpr',                icon: Car,             label: 'ANPR Surveillance',      labelGu: 'નંબર પ્લેટ (ANPR)',  roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'anpr' },
  { to: '/crowd-detection',     icon: Users,           label: 'Crowd & Density AI',     labelGu: 'ભીડ વિશ્લેષણ (Crowd)', roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'crowd' },
  { to: '/footage-requests',    icon: FileText,        label: 'Footage Requests',       labelGu: 'ફૂટેજ વિનંતી',        roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'footage_requests' },
  { to: '/investigation',       icon: ShieldAlert,     label: 'FIR Investigation',      labelGu: 'તપાસ અને વોચલિસ્ટ',   roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'investigation', isInvestigationTab: true },
  { to: '/reports',             icon: BarChart3,       label: 'Reports',                labelGu: 'અહેવાલો',             roles: ['ADMIN', 'POLICE', 'TRAFFIC_POLICE'], permission: 'reports' },
  { to: '/camera-management',   icon: Camera,          label: 'Camera Management',      labelGu: 'કેમેરા યાદી',         roles: ['ADMIN'] },
  { to: '/users',               icon: Users,           label: 'Users & Roles',          labelGu: 'વપરાશકર્તાઓ',        roles: ['ADMIN'] },
  { to: '/system-health',       icon: Activity,        label: 'System Health',          labelGu: 'સિસ્ટમ સ્થિતિ',       roles: ['ADMIN'], permission: 'system_health' },
  { to: '/audit-logs',          icon: Shield,          label: 'Audit Logs',             labelGu: 'ઓડિટ લોગ',            roles: ['ADMIN'], permission: 'audit_logs' },
  { to: '/settings',            icon: Settings,        label: 'Settings',               labelGu: 'સેટિંગ્સ',            roles: ['ADMIN'] },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { isConnected, onlineUsers } = useSocketStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();
  const location = useLocation();

  // Query unread count for notifications tab badge
  const { data: notifData } = useQuery({
    queryKey: ['notifications-badge'],
    queryFn: () => notificationAPI.getAll({ limit: 1 }).then((r) => r.data),
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });
  const unreadCount = notifData?.unreadCount || 0;

  const isLight = theme === 'light';

  const userRole = String(user?.role || '').toUpperCase();
  const normalizedRole =
    ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
    ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
    ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : 'POLICE';

  const userDepartment = user?.department || (
    normalizedRole === 'ADMIN'
      ? 'Gujarat Home Department'
      : normalizedRole === 'TRAFFIC_POLICE'
      ? 'Gujarat Traffic Police'
      : normalizedRole === 'POLICE'
      ? 'Gujarat Police Department'
      : 'Government of Gujarat'
  );

  // Query pending admin review count for badge if admin
  const { data: ticketStats } = useQuery({
    queryKey: ['footage-tickets-stats-badge'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
    staleTime: 20000,
    refetchInterval: 30000,
    enabled: normalizedRole === 'ADMIN',
  });
  const pendingAdminCount = ticketStats?.pendingAdmin || 0;

  // Query investigation stats for badge
  const { data: invData } = useQuery({
    queryKey: ['investigation-analytics-badge'],
    queryFn: () => investigationAPI.getAnalytics().then((r) => r.data.data),
    staleTime: 25000,
    refetchInterval: 30000,
  });
  const pendingFirCount = invData?.kpis?.pendingFirs || 0;

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const visibleNavItems = useMemo(() => {
    return ALL_NAV_ITEMS.filter((item) => {
      // 1. Role constraint check
      if (item.roles && !item.roles.includes(normalizedRole)) {
        return false;
      }
      // 2. Granular permission check
      if (item.permission && !hasPermission(user, item.permission)) {
        return false;
      }
      return true;
    }).map((item) => {
      // For Admin: Customize Footage Requests tab to "Footage Request Management"
      if (item.to === '/footage-requests' && normalizedRole === 'ADMIN') {
        return {
          ...item,
          label: 'Footage Request Management',
          labelGu: 'ફૂટેજ વિનંતી સંચાલન',
          isFootageAdminTab: true,
        };
      }
      // Role-specific FIR Investigation tab labeling
      if (item.to === '/investigation') {
        if (normalizedRole === 'ADMIN') {
          return {
            ...item,
            label: 'FIR Watchlist & Command',
            labelGu: 'FIR વોચલિસ્ટ અને કમાન્ડ',
          };
        }
        if (normalizedRole === 'TRAFFIC_POLICE') {
          return {
            ...item,
            label: 'Assigned Inquiries & Search',
            labelGu: 'સોંપાયેલ તપાસ અને સર્ચ',
          };
        }
        return {
          ...item,
          label: 'FIR Requests & Results',
          labelGu: 'FIR વિનંતીઓ અને પરિણામો',
        };
      }
      return item;
    });
  }, [normalizedRole, user]);

  const sidebarContent = (
    <div className={`flex flex-col h-full ${isLight ? 'bg-white text-slate-800' : 'bg-[#080c16] text-slate-200'}`}>
      
      {/* Official Government Emblem & Logo */}
      <div className={`flex items-center px-4 py-3.5 border-b shrink-0 ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080c16] border-white/5'
      } ${collapsed ? 'justify-center px-2' : ''}`}>
        <GovernmentLogo size="md" collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 custom-sidebar-scrollbar">
        {!collapsed && (
          <div className="px-3 mb-2 flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${
              isLight ? 'text-slate-500' : 'text-slate-500'
            }`}>
              Surveillance Grid
            </span>
            <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
              isLight ? 'bg-amber-100 text-amber-800' : 'text-amber-400 bg-amber-500/10'
            }`}>
              NIC-GOV
            </span>
          </div>
        )}
        <ul className="space-y-1">
          {visibleNavItems.map(({ to, icon: Icon, label, labelGu, isNotificationTab, isFootageAdminTab, isInvestigationTab }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150 group relative
                  ${collapsed ? 'justify-center' : ''}
                  ${isActive ? 'active' : ''}
                  ${isActive
                    ? isLight
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20'
                      : 'bg-blue-500/15 hover:bg-blue-500/20 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.25)]'
                    : isLight
                      ? 'text-slate-700 hover:bg-blue-50/80 hover:text-blue-700'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
                title={collapsed ? label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <div className="relative shrink-0">
                      <Icon className={`w-4.5 h-4.5 transition-colors ${
                        isActive
                          ? 'text-white'
                          : isLight ? 'text-slate-500 group-hover:text-blue-600' : 'text-slate-500 group-hover:text-blue-400'
                      }`} />
                      {isNotificationTab && unreadCount > 0 && collapsed && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-[#080c16] animate-pulse" />
                      )}
                      {isFootageAdminTab && pendingAdminCount > 0 && collapsed && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 border-2 border-[#080c16] animate-pulse" />
                      )}
                      {isInvestigationTab && pendingFirCount > 0 && collapsed && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-[#080c16]" />
                      )}
                    </div>
                    {!collapsed && (
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className={`truncate leading-tight sidebar-label-main ${
                            isActive
                              ? isLight ? 'text-white font-bold' : 'text-blue-300 font-bold'
                              : isLight ? 'text-slate-800 group-hover:text-slate-900 font-semibold' : 'text-slate-300 group-hover:text-slate-100 font-semibold'
                          }`}>
                            {label}
                          </span>
                          {isNotificationTab && unreadCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-red-500 text-white shadow-sm shadow-red-500/30 shrink-0">
                              {unreadCount}
                            </span>
                          )}
                          {isFootageAdminTab && pendingAdminCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-500 text-amber-950 shadow-sm shadow-amber-500/30 shrink-0 animate-pulse">
                              {pendingAdminCount}
                            </span>
                          )}
                          {isInvestigationTab && pendingFirCount > 0 && (
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-blue-600 text-white shrink-0">
                              {pendingFirCount}
                            </span>
                          )}
                        </div>
                        <span className={`text-[10px] truncate sidebar-label-gu transition-colors ${
                          isActive
                            ? isLight ? 'text-blue-100 font-semibold' : 'text-blue-400 font-semibold'
                            : isLight ? 'text-slate-500 group-hover:text-blue-700 font-medium' : 'text-slate-500 group-hover:text-blue-300 font-medium'
                        }`}>
                          {labelGu}
                        </span>
                      </div>
                    )}
                    {/* Active indicator for dark mode */}
                    {isActive && !isLight && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-400 rounded-r-full" />
                    )}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Status + Profile Footer */}
      <div className={`border-t p-3 shrink-0 space-y-2 ${
        isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#080c16] border-white/5'
      }`}>
        {/* Connection status */}
        {!collapsed && (
          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border ${
            isLight ? 'bg-white border-slate-200 text-slate-700 shadow-sm' : 'bg-white/3 border-transparent text-slate-300'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-500 shadow-[0_0_6px_#10b981] animate-pulse-dot' : 'bg-red-400'
              }`} />
              <span className="text-[11px] font-bold">{isConnected ? 'NIC Grid Connected' : 'Offline'}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <Users className="w-3 h-3" />
              <span className="font-semibold">{onlineUsers}</span>
            </div>
          </div>
        )}

        {/* User profile */}
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black shrink-0 shadow-sm ${
              normalizedRole === 'ADMIN'
                ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white'
                : normalizedRole === 'TRAFFIC_POLICE'
                ? 'bg-gradient-to-br from-amber-600 to-orange-500 text-white'
                : isLight
                ? 'bg-blue-600 text-white'
                : 'bg-gradient-to-br from-blue-700 to-blue-500 text-white'
            }`}
            title={`${user?.name || 'User'} (${userDepartment})`}
          >
            {user?.name?.charAt(0) || 'U'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`} title={user?.name}>
                {user?.name || 'User'}
              </p>
              <p className={`text-[10px] truncate font-semibold ${isLight ? 'text-blue-700' : 'text-blue-400/90'}`} title={userDepartment}>
                {userDepartment}
              </p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className={`p-1.5 rounded-lg transition-all ${
                isLight ? 'text-slate-500 hover:text-red-600 hover:bg-red-50' : 'text-slate-600 hover:text-red-400 hover:bg-red-500/10'
              }`}
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center p-2 text-slate-400 hover:text-red-500 rounded-lg transition-all"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col h-screen ${isLight ? 'bg-slate-100 text-slate-900' : 'bg-[#0a0d14] text-slate-100'} overflow-hidden`}>

      {/* 🇮🇳 National Tricolor Accent Bar (Stretches completely across the top) */}
      <div className="gov-tricolor-strip shrink-0 w-full z-30 shadow-sm" />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-[3100] lg:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar — desktop */}
        <aside
          className={`hidden lg:flex flex-col ${
            isLight ? 'bg-white border-r border-slate-200 shadow-sm' : 'bg-[#080c16] border-r border-white/5'
          } transition-all duration-300 shrink-0 relative z-20
            ${collapsed ? 'w-[70px]' : 'w-[260px]'}`}
        >
          {sidebarContent}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((p) => !p)}
            className={`absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 shadow-md ${
              isLight
                ? 'bg-white border border-slate-300 text-slate-700 hover:bg-blue-600 hover:text-white'
                : 'bg-[#1e2740] border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-blue-500/20'
            }`}
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </aside>

        {/* Sidebar — mobile drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-[3200] w-[260px] flex flex-col ${
            isLight ? 'bg-white border-r border-slate-200 shadow-xl' : 'bg-[#080c16] border-r border-white/5'
          } transition-transform duration-300 lg:hidden
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </aside>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Top Header - High z-index to stay above Leaflet map (Leaflet controls are z-1000) */}
          <header className={`h-16 flex items-center justify-between px-4 lg:px-6 shrink-0 border-b transition-colors relative z-[1100] ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-[#0a0d14]/95 border-white/5 backdrop-blur-sm'
          }`}>
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(true)}
              className={`lg:hidden p-2 rounded-lg transition-all ${
                isLight ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Official Government Page Title */}
            <div className="hidden lg:flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-xs ${
                isLight ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-black ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                    ગુજરાત સરકાર · Government of Gujarat
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    isLight ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    Home Department
                  </span>
                </div>
                <p className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  CCTV Surveillance &amp; Geospatial GIS Command Center
                </p>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">

              {/* 🎨 Theme Toggle (Light Mode vs Dark Mode) */}
              <div className={`flex items-center p-1 rounded-xl border shadow-inner ${
                isLight ? 'bg-slate-100 border-slate-300' : 'bg-white/5 border-white/10'
              }`}>
                <button
                  type="button"
                  onClick={() => {
                    if (!isLight) {
                      toggleTheme();
                      toast('Switched to Light Mode', { icon: '☀️' });
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    isLight
                      ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Switch to Light Mode"
                >
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span className="hidden sm:inline">Light Mode</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (isLight) {
                      toggleTheme();
                      toast('Switched to Dark Mode', { icon: '🌙' });
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    !isLight
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                  title="Switch to Dark Mode"
                >
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </button>
              </div>

              {/* Live Indicator */}
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 border ${
                isLight
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs'
                  : 'bg-emerald-500/8 border-emerald-500/15 text-emerald-400'
              }`}>
                <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_6px_#10b981] animate-pulse-dot" />
                <span className="text-[11px] font-black tracking-wide">GRID LIVE</span>
              </div>

              {/* Real-time Department & Ticket Notification Center */}
              <NotificationCenter />

              {/* User Profile & Role Badge */}
              <div className={`flex items-center gap-2.5 border rounded-2xl px-3.5 py-1.5 ${
                isLight
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-white/4 border-white/8'
              }`}>
                <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black text-white ${
                  normalizedRole === 'ADMIN'
                    ? 'bg-gradient-to-br from-purple-600 to-indigo-600 shadow-sm'
                    : normalizedRole === 'TRAFFIC_POLICE'
                    ? 'bg-gradient-to-br from-amber-600 to-orange-500 shadow-sm'
                    : 'bg-gradient-to-br from-blue-600 to-cyan-600 shadow-sm'
                }`}>
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-xs font-bold leading-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                      {user?.name || 'User'}
                    </p>
                    <span className={`text-[9px] font-mono font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                      normalizedRole === 'ADMIN'
                        ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                        : normalizedRole === 'TRAFFIC_POLICE'
                        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                    }`}>
                      {normalizedRole === 'ADMIN' ? 'ADMIN' : normalizedRole === 'TRAFFIC_POLICE' ? 'TRAFFIC' : 'POLICE'}
                    </span>
                  </div>
                  <p className={`text-[10px] truncate max-w-[140px] font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`} title={userDepartment}>
                    {userDepartment}
                  </p>
                </div>
              </div>

            </div>
          </header>

          {/* Page content */}
          <main className={`flex-1 overflow-y-auto custom-sidebar-scrollbar ${isLight ? 'bg-[#f4f6fa]' : 'bg-[#0a0d14]'}`}>
            <ErrorBoundary key={location.pathname}>
              <Outlet />
            </ErrorBoundary>
          </main>
        </div>

      </div>
    </div>
  );
}
