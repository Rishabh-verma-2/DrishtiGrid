import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { cameraAPI, alertAPI, footageTicketAPI, userAPI, auditLogAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import {
  Camera, Wifi, WifiOff, Wrench, AlertTriangle, Activity,
  TrendingUp, MapPin, Clock, Eye, Radio, Users, FileText,
  Shield, CheckCircle2, ArrowRight, ExternalLink, Send,
  Car, Compass, BarChart3, Plus, ChevronRight, Layers, Lock, Flame
} from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

// ─── Stat Card Component ──────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'blue', isLight = false }) {
  const colorMap = {
    blue: {
      bg: isLight ? 'bg-blue-50' : 'bg-blue-950/40',
      border: isLight ? 'border-blue-200' : 'border-blue-500/30',
      icon: isLight ? 'text-blue-600' : 'text-blue-400',
      val: isLight ? 'text-blue-700' : 'text-blue-300',
    },
    mono: {
      bg: isLight ? 'bg-slate-100' : 'bg-slate-800/80',
      border: isLight ? 'border-slate-200' : 'border-slate-700/60',
      icon: isLight ? 'text-slate-800' : 'text-white',
      val: isLight ? 'text-slate-900' : 'text-white',
    },
    green: {
      bg: isLight ? 'bg-slate-100' : 'bg-slate-800/60',
      border: isLight ? 'border-slate-200' : 'border-slate-700/60',
      icon: isLight ? 'text-blue-600' : 'text-blue-400',
      val: isLight ? 'text-emerald-700' : 'text-emerald-400',
    },
    red: {
      bg: isLight ? 'bg-slate-100' : 'bg-slate-800/60',
      border: isLight ? 'border-slate-200' : 'border-slate-700/60',
      icon: isLight ? 'text-slate-800' : 'text-white',
      val: isLight ? 'text-red-700' : 'text-red-400',
    },
    amber: {
      bg: isLight ? 'bg-blue-50' : 'bg-blue-950/30',
      border: isLight ? 'border-blue-200' : 'border-blue-500/30',
      icon: isLight ? 'text-blue-600' : 'text-blue-400',
      val: isLight ? 'text-amber-700' : 'text-amber-400',
    },
    purple: {
      bg: isLight ? 'bg-slate-100' : 'bg-slate-800/60',
      border: isLight ? 'border-slate-200' : 'border-slate-700/60',
      icon: isLight ? 'text-blue-600' : 'text-blue-400',
      val: isLight ? 'text-slate-900' : 'text-blue-300',
    },
    cyan: {
      bg: isLight ? 'bg-blue-50' : 'bg-blue-950/40',
      border: isLight ? 'border-blue-200' : 'border-blue-500/30',
      icon: isLight ? 'text-blue-600' : 'text-blue-400',
      val: isLight ? 'text-blue-700' : 'text-blue-300',
    },
  };
  const c = colorMap[color] || colorMap.blue;

  return (
    <div className={`relative border ${c.border} rounded-2xl p-5 transition-all duration-200 group overflow-hidden ${isLight ? 'bg-white shadow-xs hover:shadow-md' : 'bg-[#141929] hover:bg-[#1a2035]'
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 ${c.bg} border ${c.border} rounded-xl flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${c.icon}`} />
        </div>
        <TrendingUp className={`w-3.5 h-3.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`} />
      </div>
      <p className={`text-2xl font-black ${c.val} mb-1 font-mono`}>{value ?? '—'}</p>
      <p className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{label}</p>
      {sub && <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>{sub}</p>}
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

      {/* ─── Role Context Operational Banner ──────────────────────── */}
      <div className={`p-5 rounded-3xl border flex flex-wrap items-center justify-between gap-4 transition-colors ${normalizedRole === 'ADMIN'
          ? isLight ? 'bg-gradient-to-r from-purple-50 via-white to-blue-50 border-purple-200' : 'bg-gradient-to-r from-purple-950/30 via-[#141929] to-blue-950/20 border-purple-500/20'
          : normalizedRole === 'TRAFFIC_POLICE'
            ? isLight ? 'bg-gradient-to-r from-amber-50 via-white to-blue-50 border-amber-200' : 'bg-gradient-to-r from-amber-950/30 via-[#141929] to-cyan-950/20 border-amber-500/20'
            : isLight ? 'bg-gradient-to-r from-blue-50 via-white to-cyan-50 border-blue-200' : 'bg-gradient-to-r from-blue-950/30 via-[#141929] to-cyan-950/20 border-blue-500/20'
        }`}>
        <div className="flex items-center gap-3.5">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold shadow-md ${normalizedRole === 'ADMIN'
              ? 'bg-purple-600 text-white'
              : normalizedRole === 'TRAFFIC_POLICE'
                ? 'bg-amber-600 text-white'
                : 'bg-blue-600 text-white'
            }`}>
            {normalizedRole === 'ADMIN' ? <Shield className="w-6 h-6" /> : normalizedRole === 'TRAFFIC_POLICE' ? <Car className="w-6 h-6" /> : <Camera className="w-6 h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-lg font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                {normalizedRole === 'ADMIN'
                  ? 'State Surveillance Command Center · Administrator Dashboard'
                  : normalizedRole === 'TRAFFIC_POLICE'
                    ? 'Traffic Enforcement & Junction Command Center'
                    : 'Gujarat Police Operational Surveillance Dashboard'}
              </h1>
              <span className={`text-[9px] font-mono font-extrabold uppercase px-2 py-0.5 rounded-full border ${normalizedRole === 'ADMIN'
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                  : normalizedRole === 'TRAFFIC_POLICE'
                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
                }`}>
                {normalizedRole}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Logged in as <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>{user?.name}</strong> ({user?.department || 'Government of Gujarat'}) · Role-verified security clearance active
            </p>
          </div>
        </div>

        {/* Quick Actions based on Role */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/gis-map')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
                : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
              }`}
          >
            <Compass className="w-3.5 h-3.5 text-blue-500" />
            <span>GIS Map</span>
          </button>

          <button
            onClick={() => navigate('/camera-monitoring')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isLight
                ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
                : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
              }`}
          >
            <Radio className="w-3.5 h-3.5 text-emerald-500" />
            <span>Live Streams</span>
          </button>

          <button
            onClick={() => navigate('/footage-requests')}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{normalizedRole === 'ADMIN' ? 'Footage Request Management' : 'Footage Requisitions'}</span>
          </button>
        </div>
      </div>

      {/* ─── Role-Specific KPI Cards ──────────────────────────────── */}
      {normalizedRole === 'ADMIN' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard icon={Camera} label="Total Cameras" value={totalCams} sub="State surveillance units" color="blue" isLight={isLight} />
          <StatCard icon={Wifi} label="Online Units" value={onlineCams} sub={`${Math.round((onlineCams / totalCams) * 100)}% uptime`} color="green" isLight={isLight} />
          <StatCard icon={WifiOff} label="Offline Units" value={offlineCams} sub="Attention required" color="red" isLight={isLight} />
          <StatCard icon={Users} label="Total Users" value={totalUsers} sub="RBAC managed accounts" color="purple" isLight={isLight} />
          <StatCard icon={Clock} label="Pending Requests" value={pendingRequests} sub="Awaiting approval" color="amber" isLight={isLight} />
          <StatCard icon={CheckCircle2} label="Dispatched Evidence" value={dispatchedRequests} sub="Section 65B sealed" color="cyan" isLight={isLight} />
        </div>
      )}

      {normalizedRole === 'POLICE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Camera} label="Available Cameras" value={totalCams} sub="Gujarat Police Grid" color="blue" isLight={isLight} />
          <StatCard icon={Wifi} label="Online Units" value={onlineCams} sub="Active live feed feeds" color="green" isLight={isLight} />
          <StatCard icon={Clock} label="My Pending Requests" value={pendingRequests} sub="Under review / processing" color="amber" isLight={isLight} />
          <StatCard icon={CheckCircle2} label="Completed Requisitions" value={dispatchedRequests} sub="Ready for evidence download" color="cyan" isLight={isLight} />
        </div>
      )}

      {normalizedRole === 'TRAFFIC_POLICE' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Car} label="Traffic Cameras" value={totalCams} sub="Junction & highway units" color="cyan" isLight={isLight} />
          <StatCard icon={Wifi} label="Online Units" value={onlineCams} sub="Live stream operational" color="green" isLight={isLight} />
          <StatCard icon={Clock} label="Violation Requisitions" value={pendingRequests} sub="Traffic FIRs / e-challan" color="amber" isLight={isLight} />
          <StatCard icon={CheckCircle2} label="Dispatched Evidence" value={dispatchedRequests} sub="Vehicle tracking archived" color="blue" isLight={isLight} />
        </div>
      )}

      {/* ─── Main Grid Layout ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Column 1 & 2: Charts or Role Operations */}
        <div className="lg:col-span-2 space-y-6">

          {/* Camera Grid Health / Status Distribution */}
          <div className={`p-5 rounded-3xl border transition-colors ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
            }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {normalizedRole === 'ADMIN' ? 'Statewide Camera Health & Connectivity Distribution' : 'Jurisdictional Camera Network Overview'}
                </h3>
                <p className="text-xs text-slate-500">Real-time status breakdown across 500 surveillance endpoints</p>
              </div>
              <span className="text-xs font-mono text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full">
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

              <div className="md:col-span-2 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">Online & Streaming</span>
                  </div>
                  <strong className="font-mono text-emerald-700 dark:text-emerald-300">{onlineCams} Units</strong>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span className="font-semibold text-red-600 dark:text-red-400">Offline / Network Disconnected</span>
                  </div>
                  <strong className="font-mono text-red-700 dark:text-red-300">{offlineCams} Units</strong>
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <span className="font-semibold text-amber-600 dark:text-amber-400">Scheduled Maintenance</span>
                  </div>
                  <strong className="font-mono text-amber-700 dark:text-amber-300">{camStats?.maintenance || 0} Units</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Footage Requisitions Table */}
          <div className={`p-5 rounded-3xl border transition-colors ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
            }`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
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
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
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
                    <tr className={`border-b text-[10px] uppercase font-bold text-slate-400 ${isLight ? 'border-slate-200' : 'border-white/6'
                      }`}>
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
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${t.status === 'dispatched' ? 'bg-emerald-500/10 text-emerald-500' :
                              t.status === 'under_review' ? 'bg-blue-500/10 text-blue-400' :
                                t.status === 'approved' ? 'bg-emerald-500/10 text-emerald-400' :
                                  t.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-500'
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
            <div className={`p-5 rounded-3xl border space-y-4 transition-colors ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
              }`}>
              <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Administrative Controls
              </h3>

              <div className="space-y-2.5">
                <Link
                  to="/users"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isLight ? 'bg-purple-50 hover:bg-purple-100/70 border-purple-200 text-purple-950' : 'bg-purple-500/10 hover:bg-purple-500/15 border-purple-500/25 text-purple-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-xs font-bold">Manage Users & Roles</p>
                      <p className="text-[10px] text-slate-500">Create officers, assign roles & deactivation</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-purple-400" />
                </Link>

                <Link
                  to="/camera-management"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isLight ? 'bg-blue-50 hover:bg-blue-100/70 border-blue-200 text-blue-950' : 'bg-blue-500/10 hover:bg-blue-500/15 border-blue-500/25 text-blue-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Camera className="w-5 h-5 text-blue-500" />
                    <div>
                      <p className="text-xs font-bold">Camera Management</p>
                      <p className="text-[10px] text-slate-500">Edit metadata, add units, change stream status</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-blue-400" />
                </Link>

                <Link
                  to="/system-health"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isLight ? 'bg-emerald-50 hover:bg-emerald-100/70 border-emerald-200 text-emerald-950' : 'bg-emerald-500/10 hover:bg-emerald-500/15 border-emerald-500/25 text-emerald-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Activity className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold">System Health & Latency</p>
                      <p className="text-[10px] text-slate-500">MongoDB ping, MediaMTX gateway & server stats</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-emerald-400" />
                </Link>

                <Link
                  to="/crowd-detection"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isLight ? 'bg-indigo-50 hover:bg-indigo-100/70 border-indigo-200 text-indigo-950' : 'bg-indigo-500/10 hover:bg-indigo-500/15 border-indigo-500/25 text-indigo-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Flame className="w-5 h-5 text-indigo-500" />
                    <div>
                      <p className="text-xs font-bold">Crowd & Density Surveillance</p>
                      <p className="text-[10px] text-slate-500">KDE heatmaps, pedestrian counts & surge triage</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-indigo-400" />
                </Link>

                <Link
                  to="/audit-logs"
                  className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800' : 'bg-white/4 hover:bg-white/8 border-white/8 text-slate-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-slate-400" />
                    <div>
                      <p className="text-xs font-bold">System Audit Trail</p>
                      <p className="text-[10px] text-slate-500">View forensic logs of logins, edits & requests</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </Link>
              </div>
            </div>
          )}

          {/* Police / Traffic Police Shortcuts */}
          {normalizedRole !== 'ADMIN' && (
            <div className={`p-5 rounded-3xl border space-y-4 transition-colors ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
              }`}>
              <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Surveillance Operations Shortcuts
              </h3>

              <div className="space-y-2.5">
                <button
                  onClick={() => navigate('/gis-map')}
                  className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white shadow-md transition-all cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <Compass className="w-5 h-5" />
                    <div>
                      <p className="text-xs font-bold">Launch Gujarat GIS Map</p>
                      <p className="text-[10px] text-blue-100">Browse 500 CCTV units across districts</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button
                  onClick={() => navigate('/camera-monitoring')}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800' : 'bg-white/4 hover:bg-white/8 border-white/8 text-slate-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Radio className="w-5 h-5 text-emerald-500" />
                    <div>
                      <p className="text-xs font-bold">Live Monitoring Matrix</p>
                      <p className="text-[10px] text-slate-400">View WebRTC low-latency CCTV streams</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>

                <button
                  onClick={() => navigate('/crowd-detection')}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${isLight ? 'bg-amber-50 hover:bg-amber-100/70 border-amber-200 text-amber-950' : 'bg-amber-500/10 hover:bg-amber-500/15 border-amber-500/25 text-amber-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <Flame className="w-5 h-5 text-amber-500" />
                    <div>
                      <p className="text-xs font-bold">Crowd & Density AI</p>
                      <p className="text-[10px] text-slate-400">Heatmaps, congestion pinch points & scene objects</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-400" />
                </button>

                <button
                  onClick={() => navigate('/reports')}
                  className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer text-left ${isLight ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800' : 'bg-white/4 hover:bg-white/8 border-white/8 text-slate-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-5 h-5 text-purple-500" />
                    <div>
                      <p className="text-xs font-bold">Surveillance Reports</p>
                      <p className="text-[10px] text-slate-400">Operational incident & uptime logs</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            </div>
          )}

          {/* Recent Audit Log Snapshot (Admin Only) */}
          {normalizedRole === 'ADMIN' && (
            <div className={`p-5 rounded-3xl border transition-colors ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
              }`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Recent System Activity
                </h3>
                <Link to="/audit-logs" className="text-xs text-blue-500 font-bold hover:underline">
                  All Logs
                </Link>
              </div>

              {recentAuditLogs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No recent activity logged.</p>
              ) : (
                <div className="space-y-3">
                  {recentAuditLogs.map((log) => (
                    <div key={log._id} className="text-xs space-y-0.5 pb-2 border-b border-slate-100 dark:border-white/4 last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700 dark:text-slate-300">
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
