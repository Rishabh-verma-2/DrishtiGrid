import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { cameraAPI, alertAPI, footageTicketAPI, userAPI, auditLogAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import {
  Camera, Wifi, WifiOff, AlertTriangle, AlertCircle, Activity,
  TrendingUp, MapPin, Clock, Eye, Radio, Users, FileText,
  Shield, ShieldCheck, CheckCircle2, ArrowRight, ExternalLink, Send,
  Car, Compass, BarChart3, Plus, ChevronRight, Layers, Lock,
  Server, Users2, FileSpreadsheet, UserCheck, FileCheck, Video
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

// ─── Professional Stat Card Component ─────────────────────────────
function StatCard({ icon: Icon, label, value, sub, isLight = false }) {
  return (
    <div
      className={`relative border rounded-xl p-4 transition-all duration-150 group overflow-hidden ${
        isLight
          ? 'bg-white border-slate-200/90 shadow-xs hover:border-slate-300'
          : 'bg-slate-900 border-slate-800/90 shadow-md hover:border-slate-700'
      }`}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span
          className={`text-[11px] font-bold uppercase tracking-wider ${
            isLight ? 'text-slate-500' : 'text-slate-400'
          }`}
        >
          {label}
        </span>
        <div
          className={`w-7 h-7 rounded-md flex items-center justify-center border ${
            isLight
              ? 'bg-slate-50 border-slate-200 text-slate-700'
              : 'bg-slate-800/90 border-slate-700 text-slate-300'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      <p
        className={`text-2xl font-black font-mono tracking-tight ${
          isLight ? 'text-slate-900' : 'text-slate-100'
        }`}
      >
        {value ?? '—'}
      </p>
      {sub && (
        <p
          className={`text-[10px] font-medium mt-1 ${
            isLight ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const userRole = String(user?.role || '').toUpperCase();
  const normalizedRole =
    ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
      ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
        ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : 'POLICE';

  // Common Queries
  const { data: camStats, isLoading: loadingCam } = useQuery({
    queryKey: ['cameraStats'],
    queryFn: () => cameraAPI.getStats().then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: ticketStats } = useQuery({
    queryKey: ['footage-ticket-stats'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
    refetchInterval: 30000,
  });

  const { data: recentTickets = [] } = useQuery({
    queryKey: ['footage-tickets-recent'],
    queryFn: () => footageTicketAPI.getAll({ limit: 5 }).then((r) => r.data.data || []),
    refetchInterval: 30000,
  });

  // Admin-Only Queries
  const { data: usersData } = useQuery({
    queryKey: ['users-list-summary'],
    queryFn: () => userAPI.getAll({ limit: 5 }).then((r) => r.data),
    enabled: normalizedRole === 'ADMIN',
  });

  const { data: recentAuditLogs = [] } = useQuery({
    queryKey: ['audit-logs-recent'],
    queryFn: () => auditLogAPI.getAll({ limit: 5 }).then((r) => r.data.data || []),
    enabled: normalizedRole === 'ADMIN',
  });

  // Pie chart data
  const pieData = useMemo(() => {
    if (!camStats) return [];
    return [
      { name: 'Online', value: camStats.online || 0, color: '#10b981' },
      { name: 'Offline', value: camStats.offline || 0, color: '#ef4444' },
      { name: 'Maintenance', value: camStats.maintenance || 0, color: '#f59e0b' },
    ].filter((d) => d.value > 0);
  }, [camStats]);

  const totalCams = camStats?.total || 500;
  const onlineCams = camStats?.online || 0;
  const offlineCams = camStats?.offline || 0;
  const totalUsers = usersData?.pagination?.total || 4;
  const pendingRequests = ticketStats?.pendingAction || 0;
  const dispatchedRequests = ticketStats?.dispatched || 0;

  return (
    <div className="p-6 space-y-6">

      {/* ─── Official Command Center Operational Header ──────────────────────── */}
      <div
        className={`p-5 rounded-xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${
          isLight
            ? 'bg-white border-slate-200/90 shadow-xs'
            : 'bg-slate-900 border-slate-800 shadow-xl'
        }`}
      >
        <div className="flex items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-lg flex items-center justify-center font-bold border shadow-xs ${
              normalizedRole === 'ADMIN'
                ? isLight
                  ? 'bg-slate-900 text-amber-400 border-slate-700'
                  : 'bg-slate-950 text-amber-400 border-amber-500/30'
                : normalizedRole === 'TRAFFIC_POLICE'
                ? isLight
                  ? 'bg-slate-900 text-emerald-400 border-slate-700'
                  : 'bg-slate-950 text-emerald-400 border-emerald-500/30'
                : isLight
                ? 'bg-slate-900 text-blue-400 border-slate-700'
                : 'bg-slate-950 text-blue-400 border-blue-500/30'
            }`}
          >
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className={`text-base font-bold tracking-tight uppercase ${
                  isLight ? 'text-slate-900' : 'text-slate-100'
                }`}
              >
                {normalizedRole === 'ADMIN'
                  ? 'State Surveillance & Command Center · Gujarat Command Terminal'
                  : normalizedRole === 'TRAFFIC_POLICE'
                  ? 'Traffic Enforcement & Junction Command Center'
                  : 'Gujarat Police Operational Surveillance Terminal'}
              </h1>
              <span
                className={`text-[10px] font-mono font-bold uppercase px-2.5 py-0.5 rounded border inline-flex items-center gap-1.5 ${
                  isLight
                    ? 'bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CLEARANCE: {normalizedRole}
              </span>
            </div>
            <p
              className={`text-xs mt-0.5 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Terminal Session: <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>{user?.name}</strong> ({user?.department || 'Government of Gujarat'}) · Verified Secure Network
            </p>
          </div>
        </div>

        {/* Tactical Quick Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/gis-map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
              isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>GIS Surveillance Grid</span>
          </button>

          <button
            onClick={() => navigate('/camera-monitoring')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer shadow-xs ${
              isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700'
            }`}
          >
            <Video className="w-3.5 h-3.5 text-emerald-500" />
            <span>Live CCTV Feeds</span>
          </button>

          <button
            onClick={() => navigate('/footage-requests')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer ${
              isLight
                ? 'bg-slate-900 hover:bg-slate-800 text-white border border-slate-900'
                : 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{normalizedRole === 'ADMIN' ? 'Footage Requisition Desk' : 'Evidence Requests'}</span>
          </button>
        </div>
      </div>

      {/* ─── Role-Specific KPI Cards ──────────────────────────────── */}
      {normalizedRole === 'ADMIN' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          <StatCard icon={Camera} label="Total Cameras" value={totalCams} sub="State surveillance units" isLight={isLight} />
          <StatCard icon={Activity} label="Online Units" value={onlineCams} sub={`${Math.round((onlineCams / totalCams) * 100)}% active uptime`} isLight={isLight} />
          <StatCard icon={AlertCircle} label="Offline Units" value={offlineCams} sub="Intervention required" isLight={isLight} />
          <StatCard icon={UserCheck} label="Authorized Users" value={totalUsers} sub="RBAC state accounts" isLight={isLight} />
          <StatCard icon={Clock} label="Pending Requests" value={pendingRequests} sub="Awaiting nodal review" isLight={isLight} />
          <StatCard icon={FileCheck} label="Dispatched Evidence" value={dispatchedRequests} sub="Section 65B certified" isLight={isLight} />
        </div>
      )}

      {normalizedRole === 'POLICE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard icon={Camera} label="Available Cameras" value={totalCams} sub="Gujarat Police Grid" isLight={isLight} />
          <StatCard icon={Activity} label="Online Units" value={onlineCams} sub="Active live feeds" isLight={isLight} />
          <StatCard icon={Clock} label="My Pending Requests" value={pendingRequests} sub="Under review / processing" isLight={isLight} />
          <StatCard icon={FileCheck} label="Completed Requisitions" value={dispatchedRequests} sub="Certified evidence ready" isLight={isLight} />
        </div>
      )}

      {normalizedRole === 'TRAFFIC_POLICE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <StatCard icon={Camera} label="Traffic Cameras" value={totalCams} sub="Junction & highway units" isLight={isLight} />
          <StatCard icon={Activity} label="Online Units" value={onlineCams} sub="Live stream operational" isLight={isLight} />
          <StatCard icon={Clock} label="Violation Requisitions" value={pendingRequests} sub="Traffic FIRs / e-challan" isLight={isLight} />
          <StatCard icon={FileCheck} label="Dispatched Evidence" value={dispatchedRequests} sub="Vehicle tracking archived" isLight={isLight} />
        </div>
      )}

      {/* ─── Main Grid Layout ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 & 2: Charts or Role Operations */}
        <div className="lg:col-span-2 space-y-6">

          {/* Camera Grid Health / Status Distribution */}
          <div className={`p-5 rounded-xl border transition-colors ${isLight ? 'bg-white border-slate-200/90 shadow-xs' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-sm font-bold tracking-tight uppercase ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {normalizedRole === 'ADMIN' ? 'Statewide Camera Health & Connectivity Distribution' : 'Jurisdictional Camera Network Overview'}
                </h3>
                <p className="text-xs text-slate-500">Real-time status breakdown across 500 surveillance endpoints</p>
              </div>
              <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md">
                {Math.round((onlineCams / totalCams) * 100)}% Grid Active
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
              <div className="h-44 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={65}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="md:col-span-2 space-y-2.5">
                <div className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                  isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Online & Streaming</span>
                  </div>
                  <strong className="font-mono text-emerald-600 dark:text-emerald-400">{onlineCams} Units</strong>
                </div>

                <div className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                  isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Offline / Network Disconnected</span>
                  </div>
                  <strong className="font-mono text-rose-600 dark:text-rose-400">{offlineCams} Units</strong>
                </div>

                <div className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                  isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="font-semibold text-slate-700 dark:text-slate-200">Scheduled Maintenance</span>
                  </div>
                  <strong className="font-mono text-amber-600 dark:text-amber-400">{camStats?.maintenance || 0} Units</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Footage Requisitions Table */}
          <div className={`p-5 rounded-xl border transition-colors ${isLight ? 'bg-white border-slate-200/90 shadow-xs' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-sm font-bold tracking-tight uppercase ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {normalizedRole === 'ADMIN' ? 'Upcoming Footage Requests for Review' : 'Departmental Footage Requisitions'}
                </h3>
                <p className="text-xs text-slate-500">
                  {normalizedRole === 'ADMIN'
                    ? 'State Nodal Queue for vetting and routing CCTV footage requests'
                    : 'Official evidence requests lodged across Gujarat'}
                </p>
              </div>
              <Link
                to="/footage-requests"
                className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentTickets.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No recent footage requests.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className={`border-b text-[10px] uppercase font-bold text-slate-400 ${isLight ? 'border-slate-200' : 'border-white/6'}`}>
                      <th className="pb-2">Ticket ID</th>
                      <th className="pb-2">Target Camera</th>
                      <th className="pb-2">Requesting Dept</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
                    {recentTickets.map((t) => (
                      <tr key={t._id} className="hover:bg-slate-50 dark:hover:bg-white/2 cursor-pointer" onClick={() => navigate('/footage-requests')}>
                        <td className="py-2.5 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {t.ticketId}
                        </td>
                        <td className="py-2.5 font-medium truncate max-w-[150px]">
                          {t.cameraId} · {t.locationName}
                        </td>
                        <td className="py-2.5 text-slate-500 truncate max-w-[140px]">
                          {t.requestingDepartment}
                        </td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                            t.status === 'dispatched' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                            t.status === 'under_review' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' :
                            t.status === 'approved' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                            t.status === 'rejected' ? 'bg-rose-500/10 text-rose-600 border-rose-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>

        {/* Column 3: Role-Specific Shortcuts & Admin Logs */}
        <div className="space-y-6">

          {/* Admin Management Shortcuts */}
          {normalizedRole === 'ADMIN' && (
            <div className={`p-5 rounded-xl border space-y-3.5 transition-colors ${isLight ? 'bg-white border-slate-200/90 shadow-xs' : 'bg-slate-900 border-slate-800'}`}>
              <h3 className={`text-sm font-bold tracking-tight uppercase ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Administrative Controls
              </h3>

              <div className="space-y-2">
                <Link
                  to="/users"
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Users className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Manage Officers & RBAC</p>
                      <p className="text-[10px] text-slate-500">Assign roles, badges & clearances</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  to="/camera-management"
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Camera className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Camera Node Management</p>
                      <p className="text-[10px] text-slate-500">Edit metadata, streams & nodal status</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  to="/system-health"
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Server className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">System Infrastructure Health</p>
                      <p className="text-[10px] text-slate-500">Gateway latency & server clusters</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  to="/crowd-detection"
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Users2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Crowd & Density Surveillance</p>
                      <p className="text-[10px] text-slate-500">KDE heatmaps & pedestrian count</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>

                <Link
                  to="/audit-logs"
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Forensic System Audit Trail</p>
                      <p className="text-[10px] text-slate-500">Immutable access and dispatch records</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>
            </div>
          )}

          {/* Police / Traffic Police Shortcuts */}
          {normalizedRole !== 'ADMIN' && (
            <div className={`p-5 rounded-xl border space-y-3.5 transition-colors ${isLight ? 'bg-white border-slate-200/90 shadow-xs' : 'bg-slate-900 border-slate-800'}`}>
              <h3 className={`text-sm font-bold tracking-tight uppercase ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Surveillance Operations Shortcuts
              </h3>

              <div className="space-y-2">
                <button
                  onClick={() => navigate('/gis-map')}
                  className="w-full flex items-center justify-between p-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xs transition-all cursor-pointer text-left border border-slate-800"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-800 flex items-center justify-center text-blue-400">
                      <Layers className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Launch Gujarat GIS Grid</p>
                      <p className="text-[10px] text-slate-400">Spatial nodal surveillance map</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate('/camera-monitoring')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer text-left ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Video className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Live Monitoring Matrix</p>
                      <p className="text-[10px] text-slate-500">Direct RTSP & low-latency feeds</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate('/crowd-detection')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer text-left ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <Users2 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Crowd & Density Analytics</p>
                      <p className="text-[10px] text-slate-500">Heatmaps & congestion telemetry</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate('/reports')}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer text-left ${
                    isLight
                      ? 'bg-slate-50/70 hover:bg-slate-100/90 border-slate-200 text-slate-800'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700 text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded bg-slate-200/70 dark:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300">
                      <BarChart3 className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Official Incident Reports</p>
                      <p className="text-[10px] text-slate-500">Forensic logs and audit summaries</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          )}

          {/* Recent Audit Log Snapshot (Admin Only) */}
          {normalizedRole === 'ADMIN' && (
            <div className={`p-5 rounded-xl border transition-colors ${isLight ? 'bg-white border-slate-200/90 shadow-xs' : 'bg-slate-900 border-slate-800'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-bold tracking-tight uppercase ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Recent System Activity
                </h3>
                <Link to="/audit-logs" className="text-xs text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                  All Logs
                </Link>
              </div>

              {recentAuditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No recent activity logged.</p>
              ) : (
                <div className="space-y-3">
                  {recentAuditLogs.map((log) => (
                    <div key={log._id} className="text-xs space-y-0.5 pb-2 border-b border-slate-100 dark:border-slate-800/60 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {log.userName || 'User'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{log.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
