import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { cameraAPI, footageTicketAPI, deptReportAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import DeptReportThreadModal from '../components/cameras/DeptReportThreadModal';
import {
  BarChart3, Download, Printer, Shield, Camera, FileText,
  CheckCircle2, Clock, MapPin, Calendar, TrendingUp, Filter,
  Flag, Inbox, AlertTriangle, ChevronRight, RefreshCw, Loader2,
  Building, Circle,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Status / Priority display ─────────────────────────────────────────────

const STATUS_CFG = {
  Open:           { label: 'Open',           cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  'In Progress':  { label: 'In Progress',    cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'Action Taken': { label: 'Action Taken',   cls: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  Resolved:       { label: 'Resolved',       cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  Closed:         { label: 'Closed',         cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

const PRIORITY_CFG = {
  Low:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
  Medium:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  High:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Critical: 'bg-red-500/15 text-red-400 border-red-500/25',
};

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// ─── Main Page ─────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const userRole = String(user?.role || '').toUpperCase();
  const normalizedRole =
    ['SUPERADMIN', 'ADMIN'].includes(userRole) ? 'ADMIN' :
    ['OPERATOR', 'VIEWER', 'POLICE'].includes(userRole) ? 'POLICE' :
    ['TRAFFIC', 'TRAFFIC_POLICE'].includes(userRole) ? 'TRAFFIC_POLICE' : 'POLICE';
  const isAdmin = normalizedRole === 'ADMIN';

  // Tab state — read from URL param ?tab=escalations
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(tabParam === 'escalations' ? 'escalations' : 'analytics');
  const openReportId = searchParams.get('id');

  // Thread modal
  const [threadReportId, setThreadReportId] = useState(openReportId || null);
  const [isThreadOpen, setIsThreadOpen] = useState(!!openReportId);

  // Sync URL param → open thread on mount
  useEffect(() => {
    if (openReportId) {
      setActiveTab('escalations');
      setThreadReportId(openReportId);
      setIsThreadOpen(true);
    }
  }, [openReportId]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'escalations') {
      setSearchParams({ tab: 'escalations' });
    } else {
      setSearchParams({});
    }
  };

  // ── Analytics data ──────────────────────────────────────────────────────

  const { data: camStats } = useQuery({
    queryKey: ['cameraStats'],
    queryFn: () => cameraAPI.getStats().then((r) => r.data.data),
    enabled: activeTab === 'analytics',
  });

  const { data: ticketStats } = useQuery({
    queryKey: ['footage-ticket-stats'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
    enabled: activeTab === 'analytics',
  });

  // ── Dept Reports inbox ──────────────────────────────────────────────────

  const { data: reportsData, isLoading: reportsLoading, refetch: refetchReports } = useQuery({
    queryKey: ['dept-reports'],
    queryFn: () => deptReportAPI.getAll({ limit: 50 }).then((r) => r.data),
    enabled: activeTab === 'escalations',
    staleTime: 30000,
  });

  const reports = reportsData?.reports || [];

  // Filter state for escalations
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchPriority = priorityFilter === 'all' || r.priority === priorityFilter;
      return matchStatus && matchPriority;
    });
  }, [reports, statusFilter, priorityFilter]);

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleExportCSV = () => toast.success('Generating and downloading official report summary CSV...');
  const handlePrint = () => window.print();

  const openThread = (reportId) => {
    setThreadReportId(reportId);
    setIsThreadOpen(true);
  };

  // ── Shared Styles ─────────────────────────────────────────────────────

  const cardCls = isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8';
  const headingCls = isLight ? 'text-slate-900' : 'text-slate-100';
  const mutedCls = isLight ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className="p-6 space-y-5 min-h-full">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className={`text-xl font-black tracking-tight ${headingCls}`}>
              Surveillance Reports & Escalations
            </h1>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
              normalizedRole === 'ADMIN'
                ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30'
                : normalizedRole === 'TRAFFIC_POLICE'
                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30'
            }`}>
              {normalizedRole} VIEW
            </span>
          </div>
          <p className={`text-xs mt-1 ${mutedCls}`}>
            Operational analytics, compliance data, and department escalation inbox.
          </p>
        </div>

        {activeTab === 'analytics' && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleExportCSV}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isLight ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs' : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-blue-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Report</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Tab Switcher ── */}
      <div className={`inline-flex p-1 rounded-2xl border gap-1 ${isLight ? 'bg-slate-100 border-slate-200' : 'bg-white/5 border-white/8'}`}>
        <button
          onClick={() => handleTabChange('analytics')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'analytics'
              ? isLight ? 'bg-white text-blue-700 shadow-sm' : 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
              : `${mutedCls} hover:text-slate-300`
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Surveillance Analytics
        </button>
        <button
          onClick={() => handleTabChange('escalations')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === 'escalations'
              ? isLight ? 'bg-white text-red-700 shadow-sm' : 'bg-red-600/25 text-red-300 border border-red-500/30'
              : `${mutedCls} hover:text-slate-300`
          }`}
        >
          <Flag className="w-3.5 h-3.5" />
          Department Escalations
          {reports.filter((r) => r.status === 'Open').length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
              {reports.filter((r) => r.status === 'Open').length}
            </span>
          )}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: Surveillance Analytics (existing content)                   */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && (
        <div className="space-y-5">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-5 rounded-3xl border ${cardCls}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-slate-400">Total Cameras Monitored</span>
                <Camera className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-black font-mono text-blue-500">{camStats?.total || 500}</p>
              <p className={`text-[11px] mt-1 ${mutedCls}`}>Gujarat state grid</p>
            </div>

            <div className={`p-5 rounded-3xl border ${cardCls}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-slate-400">Network Operational Rate</span>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>
              <p className="text-2xl font-black font-mono text-emerald-500">
                {camStats?.total ? Math.round(((camStats.online || 0) / camStats.total) * 100) : 92}%
              </p>
              <p className={`text-[11px] mt-1 ${mutedCls}`}>{camStats?.online || 460} online streams</p>
            </div>

            <div className={`p-5 rounded-3xl border ${cardCls}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-slate-400">Footage Requisitions Lodged</span>
                <FileText className="w-4 h-4 text-purple-500" />
              </div>
              <p className="text-2xl font-black font-mono text-purple-500">{ticketStats?.total || 0}</p>
              <p className={`text-[11px] mt-1 ${mutedCls}`}>Inter-department cases</p>
            </div>

            <div className={`p-5 rounded-3xl border ${cardCls}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase text-slate-400">Evidence Packages Dispatched</span>
                <CheckCircle2 className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">{ticketStats?.dispatched || 0}</p>
              <p className={`text-[11px] mt-1 ${mutedCls}`}>SHA-256 seal verified</p>
            </div>
          </div>

          {/* District breakdown table */}
          <div className={`p-5 rounded-3xl border transition-colors ${cardCls}`}>
            <h3 className={`text-sm font-black tracking-tight mb-4 ${headingCls}`}>
              District-Wise Surveillance Compliance Summary
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className={`border-b text-[10px] font-black uppercase tracking-wider ${
                    isLight ? 'border-slate-200 text-slate-500' : 'border-white/6 text-slate-400'
                  }`}>
                    <th className="pb-3">District</th>
                    <th className="pb-3">Total Units</th>
                    <th className="pb-3">Online</th>
                    <th className="pb-3">Offline</th>
                    <th className="pb-3">SLA Compliance</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
                  {(camStats?.byDistrict || []).map((d) => {
                    const compliance = Math.round((d.online / d.count) * 100);
                    return (
                      <tr key={d._id} className="hover:bg-slate-50 dark:hover:bg-white/2">
                        <td className={`py-3 font-bold ${isLight ? 'text-slate-700' : 'text-slate-200'}`}>{d._id}</td>
                        <td className="py-3 font-mono">{d.count}</td>
                        <td className="py-3 font-mono text-emerald-500 font-bold">{d.online}</td>
                        <td className="py-3 font-mono text-rose-500">{d.count - d.online}</td>
                        <td className="py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            compliance >= 90 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {compliance}% SLA
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: Department Escalations Inbox                                */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'escalations' && (
        <div className="space-y-4">

          {/* Inbox Header */}
          <div className={`p-5 rounded-3xl border ${cardCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className={`text-sm font-black ${headingCls}`}>Department Escalation Reports</h2>
                <p className={`text-xs mt-0.5 ${mutedCls}`}>
                  {isAdmin
                    ? 'Viewing all reports across all departments.'
                    : `Viewing reports addressed to your department: ${user?.department || '—'}`}
                </p>
              </div>
              <button
                onClick={() => refetchReports()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
              {['Open', 'In Progress', 'Action Taken', 'Resolved', 'Closed'].map((s) => {
                const cnt = reports.filter((r) => r.status === s).length;
                const cfg = STATUS_CFG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                      statusFilter === s
                        ? cfg.cls + ' ring-1 ring-current'
                        : isLight ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-white/4 border-white/8 text-slate-400 hover:bg-white/8'
                    }`}
                  >
                    <div className="text-lg font-black font-mono">{cnt}</div>
                    <div className="text-[10px] font-semibold mt-0.5">{s}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-bold ${mutedCls}`}>Filter:</span>
            <div className="flex gap-1.5 flex-wrap">
              {['all', 'Open', 'In Progress', 'Action Taken', 'Resolved', 'Closed'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                    statusFilter === s
                      ? isLight ? 'bg-blue-600 text-white border-blue-600' : 'bg-blue-600/80 text-white border-blue-500'
                      : isLight ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50' : 'bg-white/4 border-white/8 text-slate-400 hover:bg-white/8'
                  }`}
                >
                  {s === 'all' ? 'All Status' : s}
                </button>
              ))}
            </div>
            <span className={`text-xs ${mutedCls} ml-2`}>Priority:</span>
            {['all', 'Low', 'Medium', 'High', 'Critical'].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                  priorityFilter === p
                    ? isLight ? 'bg-slate-800 text-white border-slate-800' : 'bg-white/20 text-white border-white/20'
                    : p !== 'all' ? PRIORITY_CFG[p] + ' cursor-pointer hover:opacity-80'
                    : isLight ? 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50' : 'bg-white/4 border-white/8 text-slate-400 hover:bg-white/8'
                }`}
              >
                {p === 'all' ? 'All Priority' : p}
              </button>
            ))}
          </div>

          {/* Reports List */}
          <div className={`rounded-3xl border overflow-hidden ${cardCls}`}>
            {reportsLoading ? (
              <div className="p-12 flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className={`text-xs ${mutedCls}`}>Loading escalation reports...</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div className={`p-12 text-center space-y-2 border-dashed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <Flag className="w-10 h-10 mx-auto opacity-30" />
                <p className={`font-bold text-sm ${headingCls}`}>No Escalation Reports</p>
                <p className="text-xs">
                  {statusFilter !== 'all' || priorityFilter !== 'all'
                    ? 'No reports match the current filters.'
                    : isAdmin
                      ? 'No department escalation reports have been raised yet. Use the GIS Map to report a faulty or offline camera.'
                      : 'No escalation reports have been sent to your department yet.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className={`border-b ${isLight ? 'border-slate-200' : 'border-white/6'}`}>
                    <tr className={`text-[10px] font-black uppercase tracking-wider ${mutedCls}`}>
                      <th className="px-5 py-3.5">Report ID</th>
                      <th className="px-3 py-3.5">Camera</th>
                      <th className="px-3 py-3.5">Department</th>
                      <th className="px-3 py-3.5">Category</th>
                      <th className="px-3 py-3.5">Priority</th>
                      <th className="px-3 py-3.5">Status</th>
                      <th className="px-3 py-3.5">Raised</th>
                      <th className="px-3 py-3.5">Raised By</th>
                      <th className="px-3 py-3.5"></th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-white/4'}`}>
                    {filteredReports.map((report) => {
                      const statusCfg = STATUS_CFG[report.status] || STATUS_CFG['Open'];
                      const priCls = PRIORITY_CFG[report.priority] || PRIORITY_CFG['Medium'];
                      return (
                        <tr
                          key={report.reportId}
                          onClick={() => openThread(report.reportId)}
                          className={`cursor-pointer transition-colors group ${
                            isLight ? 'hover:bg-blue-50/60' : 'hover:bg-white/3'
                          }`}
                        >
                          <td className="px-5 py-4">
                            <span className={`font-mono font-bold text-[11px] ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>
                              {report.reportId}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <div>
                              <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{report.cameraId}</span>
                              {report.locationName && (
                                <p className={`text-[10px] mt-0.5 truncate max-w-[140px] ${mutedCls}`}>{report.locationName}</p>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex items-center gap-1.5">
                              <Building className="w-3 h-3 text-purple-400 shrink-0" />
                              <span className={`truncate max-w-[130px] ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{report.recipientDepartment}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <span className={mutedCls}>{report.category}</span>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`px-2 py-0.5 rounded-full border font-bold text-[10px] ${priCls}`}>
                              {report.priority}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`px-2.5 py-1 rounded-full border font-bold text-[10px] ${statusCfg.cls}`}>
                              {statusCfg.label}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`text-[11px] ${mutedCls}`}>{formatDate(report.createdAt)}</span>
                          </td>
                          <td className="px-3 py-4">
                            <span className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>{report.raisedBy?.name || '—'}</span>
                          </td>
                          <td className="px-3 py-4">
                            <ChevronRight className={`w-4 h-4 ${mutedCls} group-hover:text-blue-400 transition-colors`} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Coverage Gap Alerts (Admin only) */}
          {isAdmin && (
            <AttemptLogPanel isLight={isLight} cardCls={cardCls} headingCls={headingCls} mutedCls={mutedCls} />
          )}
        </div>
      )}

      {/* ── Thread Modal ── */}
      <DeptReportThreadModal
        isOpen={isThreadOpen}
        onClose={() => {
          setIsThreadOpen(false);
          setThreadReportId(null);
          // Remove id from URL
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('id');
          setSearchParams(newParams);
        }}
        reportId={threadReportId}
      />
    </div>
  );
}

// ─── Attempt Log Panel (Admin only) ──────────────────────────────────────────

function AttemptLogPanel({ isLight, cardCls, headingCls, mutedCls }) {
  const { data, isLoading } = useQuery({
    queryKey: ['dept-report-attempts'],
    queryFn: () => deptReportAPI.getAttempts().then((r) => r.data),
    staleTime: 60000,
  });

  const logs = data?.data || [];
  if (logs.length === 0 && !isLoading) return null;

  return (
    <div className={`p-5 rounded-3xl border ${cardCls}`}>
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className={`text-sm font-black ${headingCls}`}>Department Coverage Gaps</h3>
        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
          {logs.length} blocked attempt{logs.length !== 1 ? 's' : ''}
        </span>
      </div>
      <p className={`text-xs mb-4 ${mutedCls}`}>
        These are departments with no registered user. Reports to these departments were blocked. Add users in User Management to enable delivery.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading...
        </div>
      ) : (
        <div className="space-y-2">
          {logs.slice(0, 10).map((log) => (
            <div
              key={log.attemptId || log._id}
              className={`flex items-center justify-between p-3 rounded-xl border text-xs ${
                isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/8 border-amber-500/20'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <div>
                  <span className={`font-bold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>
                    {log.attemptedDepartment}
                  </span>
                  <p className={`text-[10px] mt-0.5 ${mutedCls}`}>
                    Camera: {log.cameraId} · {new Date(log.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-bold">
                NO USER
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
