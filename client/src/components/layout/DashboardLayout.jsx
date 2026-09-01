import { useState } from 'react';
import { Outlet, useLocation, useNavigate, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Map, Camera, Video, Bell, Settings,
  LogOut, Shield, ChevronLeft, ChevronRight, Activity,
  Users, Menu, X
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import useSocketStore from '../../store/socketStore';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { to: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/gis-map',             icon: Map,             label: 'GIS Camera Map' },
  { to: '/camera-monitoring',   icon: Video,           label: 'Camera Monitoring' },
  { to: '/camera-management',   icon: Camera,          label: 'Camera Management' },
  { to: '/alerts',              icon: Bell,            label: 'Alerts', badge: true },
  { to: '/settings',            icon: Settings,        label: 'Settings' },
];

export default function DashboardLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const { isConnected, onlineUsers } = useSocketStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-white/5 shrink-0 ${collapsed ? 'justify-center px-2' : ''}`}>
        <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-xl flex items-center justify-center shrink-0 shadow-[0_0_14px_rgba(59,130,246,0.5)]">
          <Shield className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-black text-sm gradient-text tracking-tight">DrishtiGrid</p>
            <p className="text-[10px] text-slate-600 font-medium truncate">Gujarat Gov · CCTV</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {!collapsed && (
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest px-2 mb-2">Main Menu</p>
        )}
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <li key={to}>
              <NavLink
                to={to}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150 group relative
                  ${collapsed ? 'justify-center' : ''}
                  ${isActive
                    ? 'bg-blue-500/15 text-blue-400 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.2)]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`
                }
                title={collapsed ? label : undefined}
              >
                {({ isActive }) => (
                  <>
                    <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`} />
                    {!collapsed && <span className="truncate">{label}</span>}
                    {/* Active indicator */}
                    {isActive && (
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
      <div className="border-t border-white/5 p-3 shrink-0 space-y-2">
        {/* Connection status */}
        {!collapsed && (
          <div className="flex items-center justify-between px-2 py-1.5 bg-white/3 rounded-lg">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse-dot' : 'bg-red-400'}`} />
              <span className="text-[11px] text-slate-500 font-medium">{isConnected ? 'Live Connected' : 'Disconnected'}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-600">
              <Users className="w-3 h-3" />
              <span>{onlineUsers}</span>
            </div>
          </div>
        )}

        {/* User profile */}
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 bg-gradient-to-br from-blue-700 to-blue-500 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.name?.charAt(0) || 'A'}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-300 truncate">{user?.name || 'Admin'}</p>
              <p className="text-[10px] text-slate-600 truncate capitalize">{user?.role || 'superadmin'}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={handleLogout}
            className="w-full flex justify-center p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#0a0d14] overflow-hidden">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop */}
      <aside
        className={`hidden lg:flex flex-col bg-[#080c16] border-r border-white/5 transition-all duration-300 shrink-0 relative
          ${collapsed ? 'w-[70px]' : 'w-[260px]'}`}
      >
        {sidebarContent}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((p) => !p)}
          className="absolute -right-3 top-20 w-6 h-6 bg-[#1e2740] border border-white/10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-blue-500/20 transition-all z-10"
        >
          {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Sidebar — mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[260px] flex flex-col bg-[#080c16] border-r border-white/5 transition-transform duration-300 lg:hidden
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {sidebarContent}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="h-16 bg-[#0a0d14]/95 border-b border-white/5 flex items-center justify-between px-4 lg:px-6 shrink-0 backdrop-blur-sm">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-all"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Page title area */}
          <div className="hidden lg:flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-slate-300">Gujarat State CCTV Surveillance &amp; GIS Command Center</span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {/* Live indicator */}
            <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/15 rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full shadow-[0_0_6px_#34d399] animate-pulse-dot" />
              <span className="text-[11px] font-semibold text-emerald-400">LIVE</span>
            </div>

            {/* Alert bell */}
            <button className="relative p-2 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-all">
              <Bell className="w-4.5 h-4.5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_6px_#ef4444]" />
            </button>

            {/* User chip */}
            <div className="flex items-center gap-2 bg-white/4 border border-white/7 rounded-xl px-3 py-1.5">
              <div className="w-6 h-6 bg-gradient-to-br from-blue-700 to-blue-500 rounded-md flex items-center justify-center text-[10px] font-bold text-white">
                {user?.name?.charAt(0) || 'A'}
              </div>
              <span className="text-xs font-medium text-slate-300 hidden sm:block">{user?.name || 'Admin'}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
