import { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Camera, Video, Bell, Settings,
  LogOut, Shield, ChevronLeft, ChevronRight, Activity,
  Users, Menu, X, Sun, Moon, Landmark
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useSocketStore from '../../store/socketStore';
import { useThemeStore } from '../../store/themeStore';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard',             labelGu: 'ડેશબોર્ડ' },
  { to: '/gis-map',             icon: Map,             label: 'GIS Camera Map',         labelGu: 'નકશો (GIS)' },
  { to: '/camera-monitoring',   icon: Video,           label: 'Live Monitoring',        labelGu: 'લાઇવ ફીડ્સ' },
  { to: '/camera-management',   icon: Camera,          label: 'Camera Management',      labelGu: 'કેમેરા યાદી' },
  { to: '/alerts',              icon: Bell,            label: 'Alerts & Incidents',     labelGu: 'ચેતવણીઓ' },
  { to: '/settings',            icon: Settings,        label: 'System Settings',        labelGu: 'સેટિંગ્સ' },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { isConnected, onlineUsers } = useSocketStore();
  const { theme, toggleTheme } = useThemeStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const isLight = theme === 'light';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Official Government Emblem & Logo */}
      <div className={`flex items-center gap-3 px-4 py-4 border-b ${isLight ? 'border-white/10' : 'border-white/5'} shrink-0 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className={`w-10 h-10 ${isLight ? 'bg-amber-500/20 border border-amber-400/40 text-amber-300' : 'bg-gradient-to-br from-blue-600 to-cyan-500 text-white shadow-[0_0_14px_rgba(59,130,246,0.5)]'} rounded-xl flex items-center justify-center shrink-0 font-bold`}>
          <Shield className="w-5 h-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className={`font-black text-sm tracking-tight ${isLight ? 'text-white' : 'gradient-text'}`}>
              DrishtiGrid
            </p>
            <p className="text-[10px] text-amber-300/90 font-medium truncate">
              ગુજરાત સરકાર · Gov of Gujarat
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {!collapsed && (
          <div className="px-3 mb-2 flex items-center justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-slate-400' : 'text-slate-600'}`}>
              Surveillance Grid
            </span>
            <span className="text-[9px] font-mono text-amber-400 font-semibold">NIC-GOV</span>
          </div>
        )}
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, icon: Icon, label, labelGu }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative
                  ${collapsed ? 'justify-center' : ''}
                  ${isActive
                    ? isLight
                      ? 'bg-amber-500 text-[#0a2240] font-bold shadow-md'
                      : 'bg-blue-500/15 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]'
                    : isLight
                      ? 'text-slate-200 hover:bg-white/10 hover:text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
                title={collapsed ? label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${
                      isActive
                        ? isLight ? 'text-[#0a2240]' : 'text-blue-400'
                        : isLight ? 'text-slate-300 group-hover:text-white' : 'text-slate-500 group-hover:text-slate-300'
                    }`} />
                    {!collapsed && (
                      <div className="flex flex-col min-w-0">
                        <span className="truncate leading-tight">{label}</span>
                        <span className={`text-[9px] ${isActive ? (isLight ? 'text-[#0a2240]/80' : 'text-blue-300/70') : 'text-slate-400'} truncate`}>{labelGu}</span>
                      </div>
                    )}
                    {/* Active indicator */}
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

      {/* Status + Profile */}
      <div className={`border-t ${isLight ? 'border-white/10' : 'border-white/5'} p-3 shrink-0 space-y-2`}>
        {/* Connection status */}
        {!collapsed && (
          <div className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg ${isLight ? 'bg-white/5 text-slate-200' : 'bg-white/3'}`}>
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse-dot' : 'bg-red-400'}`} />
              <span className="text-[11px] font-medium">{isConnected ? 'NIC Grid Online' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400">
              <Users className="w-3 h-3" />
              <span>{onlineUsers}</span>
            </div>
          </div>
        )}

        {/* User profile */}
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className={`w-8 h-8 ${isLight ? 'bg-amber-500 text-[#0a2240]' : 'bg-gradient-to-br from-blue-700 to-blue-500 text-white'} rounded-lg flex items-center justify-center text-xs font-bold shrink-0 shadow-sm`}>
            {user?.name?.charAt(0) || 'A'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className={`text-xs font-semibold truncate ${isLight ? 'text-white' : 'text-slate-300'}`}>{user?.name || 'Admin'}</p>
              <p className={`text-[10px] truncate capitalize ${isLight ? 'text-amber-300' : 'text-slate-500'}`}>Gujarat Home Dept</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className={`p-1.5 rounded-lg transition-all ${isLight ? 'text-slate-300 hover:text-red-300 hover:bg-red-500/20' : 'text-slate-600 hover:text-red-400 hover:bg-red-500/10'}`}
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
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

      {/* 🇮🇳 National Tricolor Accent Bar */}
      <div className="gov-tricolor-strip shrink-0" />

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* Mobile overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
        )}

        {/* Sidebar — desktop */}
        <aside
          className={`hidden lg:flex flex-col ${isLight ? 'bg-[#0a2240] text-white border-r border-[#0e2f57]' : 'bg-[#080c16] border-r border-white/5'} transition-all duration-300 shrink-0 relative
            ${collapsed ? 'w-[70px]' : 'w-[260px]'}`}
        >
          {sidebarContent}

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((p) => !p)}
            className={`absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center transition-all z-10 shadow-md ${
              isLight
                ? 'bg-[#0a2240] border border-amber-500/40 text-amber-300 hover:bg-amber-500 hover:text-[#0a2240]'
                : 'bg-[#1e2740] border border-white/10 text-slate-400 hover:text-slate-200 hover:bg-blue-500/20'
            }`}
          >
            {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
          </button>
        </aside>

        {/* Sidebar — mobile drawer */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-[260px] flex flex-col ${isLight ? 'bg-[#0a2240] text-white' : 'bg-[#080c16]'} border-r border-white/5 transition-transform duration-300 lg:hidden
            ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
          {sidebarContent}
        </aside>

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Top Header */}
          <header className={`h-16 flex items-center justify-between px-4 lg:px-6 shrink-0 border-b transition-colors ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm'
              : 'bg-[#0a0d14]/95 border-white/5 backdrop-blur-sm'
          }`}>
            {/* Mobile menu button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Official Government Page Title */}
            <div className="hidden lg:flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLight ? 'bg-amber-50 border border-amber-200 text-amber-700' : 'bg-blue-500/10 text-blue-400'}`}>
                <Landmark className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${isLight ? 'text-[#0a2240]' : 'text-slate-200'}`}>
                    ગુજરાત સરકાર · Government of Gujarat
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    isLight ? 'bg-blue-50 text-blue-800 border border-blue-200' : 'bg-blue-500/10 text-blue-400'
                  }`}>
                    Home Dept
                  </span>
                </div>
                <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
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
                      ? 'bg-white text-slate-800 shadow-sm border border-slate-200'
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
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                  title="Switch to Dark Mode"
                >
                  <Moon className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden sm:inline">Dark Mode</span>
                </button>
              </div>

              {/* Live Indicator */}
              <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                isLight
                  ? 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                  : 'bg-emerald-500/8 border border-emerald-500/15 text-emerald-400'
              }`}>
                <span className="w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_6px_#10b981] animate-pulse-dot" />
                <span className="text-[11px] font-bold">GRID LIVE</span>
              </div>

              {/* Alert Bell */}
              <button
                onClick={() => navigate('/alerts')}
                className={`relative p-2 rounded-xl transition-all ${
                  isLight ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-900' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
                title="Security Alerts"
              >
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_6px_#ef4444]" />
              </button>

              {/* User Chip */}
              <div className={`flex items-center gap-2 border rounded-xl px-3 py-1.5 ${
                isLight
                  ? 'bg-white border-slate-200 shadow-sm'
                  : 'bg-white/4 border-white/7'
              }`}>
                <div className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold ${
                  isLight ? 'bg-[#0a2240] text-amber-300' : 'bg-gradient-to-br from-blue-700 to-blue-500 text-white'
                }`}>
                  {user?.name?.charAt(0) || 'A'}
                </div>
                <div className="hidden sm:block text-left">
                  <p className={`text-xs font-bold leading-tight ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{user?.name || 'Admin'}</p>
                </div>
              </div>

            </div>
          </header>

          {/* Page content */}
          <main className={`flex-1 overflow-y-auto ${isLight ? 'bg-[#f4f6fa]' : 'bg-[#0a0d14]'}`}>
            <Outlet />
          </main>
        </div>

      </div>
    </div>
  );
}
