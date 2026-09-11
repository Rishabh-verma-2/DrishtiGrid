import { useMemo, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { cameraAPI, footageTicketAPI, deptReportAPI, gapAnalysisAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import DeptReportThreadModal from '../components/cameras/DeptReportThreadModal';
import GapReportDetailModal from '../components/gis/GapReportDetailModal';
import {
  BarChart3, Download, Printer, Shield, Camera, FileText,
  CheckCircle2, Clock, MapPin, Calendar, TrendingUp, Filter,
  Flag, Inbox, AlertTriangle, ChevronRight, RefreshCw, Loader2,
  Building, Circle, ShieldAlert, Sparkles, Search, ArrowRight,
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

const GAP_STATUS_CFG = {
  GENERATED:    { label: 'Generated',    cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  SENT:         { label: 'Dispatched',   cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  IN_PROGRESS:  { label: 'In Progress',  cls: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  RESOLVED:     { label: 'Resolved',     cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
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

  // Tab state — read from URL param ?tab=gap-analysis or ?tab=escalations
  const tabParam = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabParam === 'gap-analysis' ? 'gap-analysis' : tabParam === 'escalations' ? 'escalations' : 'analytics'
  );
  const openReportId = searchParams.get('id');

  // Thread modal
  const [threadReportId, setThreadReportId] = useState(
    openReportId && !openReportId.startsWith('GA-') ? openReportId : null
  );
  const [isThreadOpen, setIsThreadOpen] = useState(
    !!openReportId && !openReportId.startsWith('GA-') && tabParam === 'escalations'
  );

  // Gap Analysis Detail Modal
  const [gapDetailReportId, setGapDetailReportId] = useState(
    openReportId && (openReportId.startsWith('GA-') || tabParam === 'gap-analysis') ? openReportId : null
  );
  const [isGapDetailOpen, setIsGapDetailOpen] = useState(
    !!openReportId && (openReportId.startsWith('GA-') || tabParam === 'gap-analysis')
  );

  // Sync URL param → open thread or gap report on mount
  useEffect(() => {
    if (openReportId) {
      if (openReportId.startsWith('GA-') || tabParam === 'gap-analysis') {
        setActiveTab('gap-analysis');
        setGapDetailReportId(openReportId);
        setIsGapDetailOpen(true);
      } else {
        setActiveTab('escalations');
        setThreadReportId(openReportId);
        setIsThreadOpen(true);
      }
    }
  }, [openReportId, tabParam]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'escalations') {
      setSearchParams({ tab: 'escalations' });
    } else if (tab === 'gap-analysis') {
      setSearchParams({ tab: 'gap-analysis' });
    } else {
      setSearchParams({});
    }
  };

  // ── Gap Analysis reports query ──────────────────────────────────────────
  const {
    data: gapReportsData,
    isLoading: gapReportsLoading,
    refetch: refetchGapReports,
  } = useQuery({
    queryKey: ['gap-reports'],
    queryFn: () => gapAnalysisAPI.getAll({ limit: 50 }).then((r) => r.data?.data),
    enabled: activeTab === 'gap-analysis',
    staleTime: 30000,
  });

  const gapReports = gapReportsData?.reports || [];
  const [gapStatusFilter, setGapStatusFilter] = useState('all');
  const [gapSearchQuery, setGapSearchQuery] = useState('');

  const filteredGapReports = useMemo(() => {
    return gapReports.filter((r) => {
      const matchStatus = gapStatusFilter === 'all' || r.status === gapStatusFilter;
      const q = gapSearchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.reportId?.toLowerCase().includes(q) ||
        r.location?.name?.toLowerCase().includes(q) ||
        r.location?.district?.toLowerCase().includes(q) ||
        r.responsibleDepartment?.name?.toLowerCase().includes(q) ||
        r.responsibleDepartment?.code?.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [gapReports, gapStatusFilter, gapSearchQuery]);

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

        <button
          onClick={() => handleTabChange('gap-analysis')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
            activeTab === 'gap-analysis'
              ? isLight ? 'bg-white text-cyan-700 shadow-sm' : 'bg-cyan-600/25 text-cyan-300 border border-cyan-500/30'
              : `${mutedCls} hover:text-slate-300`
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          Gap Analysis Reports
          {gapReports.filter((r) => r.status === 'SENT').length > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-slate-950 text-[9px] font-black flex items-center justify-center">
              {gapReports.filter((r) => r.status === 'SENT').length}
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* TAB 3: Surveillance Gap Analysis Reports                           */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gap-analysis' && (
        <div className="space-y-4">
          {/* Header Card */}
          <div className={`p-5 rounded-3xl border ${cardCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className={`text-sm font-black ${headingCls}`}>Surveillance Gap Analysis Reports</h2>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/15 text-cyan-400 border border-cyan-500/25">
                    Authoritative GIS
                  </span>
                </div>
                <p className={`text-xs mt-0.5 ${mutedCls}`}>
                  {isAdmin
                    ? 'Statewide surveillance coverage evaluations, optical gap clusters, and departmental deployment requests.'
                    : `Dispatched gap analysis reports for your department: ${user?.department || 'Department'}`}
                </p>
              </div>

              <button
                type="button"
                onClick={() => refetchGapReports()}
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
              {[
                { key: 'all', label: 'All Reports', count: gapReports.length, color: 'text-slate-200' },
                { key: 'SENT', label: 'Dispatched', count: gapReports.filter((r) => r.status === 'SENT').length, color: 'text-blue-400' },
                { key: 'ACKNOWLEDGED', label: 'Acknowledged', count: gapReports.filter((r) => r.status === 'ACKNOWLEDGED').length, color: 'text-amber-400' },
                { key: 'IN_PROGRESS', label: 'In Progress', count: gapReports.filter((r) => r.status === 'IN_PROGRESS').length, color: 'text-purple-400' },
                { key: 'RESOLVED', label: 'Resolved', count: gapReports.filter((r) => r.status === 'RESOLVED').length, color: 'text-emerald-400' },
              ].map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setGapStatusFilter(gapStatusFilter === s.key ? 'all' : s.key)}
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                    gapStatusFilter === s.key
                      ? 'ring-2 ring-cyan-500 bg-cyan-500/10 border-cyan-500/30'
                      : isLight ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100' : 'bg-white/4 border-white/8 text-slate-400 hover:bg-white/8'
                  }`}
                >
                  <div className={`text-lg font-black font-mono ${s.color}`}>{s.count}</div>
                  <div className="text-[10px] uppercase font-bold mt-0.5">{s.label}</div>
                </button>
              ))}
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-inherit">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={gapSearchQuery}
                  onChange={(e) => setGapSearchQuery(e.target.value)}
                  placeholder="Search by Report ID, location, or department..."
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border outline-none ${
                    isLight
                      ? 'bg-slate-50 border-slate-300 text-slate-900 focus:bg-white'
                      : 'bg-white/5 border-white/10 text-white focus:bg-white/10'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold">Status:</span>
                <select
                  value={gapStatusFilter}
                  onChange={(e) => setGapStatusFilter(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border outline-none cursor-pointer ${
                    isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-slate-900 border-white/15 text-slate-200'
                  }`}
                >
                  <option value="all">All Statuses</option>
                  {isAdmin && <option value="GENERATED">Generated (Draft)</option>}
                  <option value="SENT">Dispatched</option>
                  <option value="ACKNOWLEDGED">Acknowledged</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="RESOLVED">Resolved</option>
                </select>
              </div>
            </div>
          </div>

          {/* Gap Reports Table */}
          <div className={`rounded-3xl border overflow-hidden ${cardCls}`}>
            {gapReportsLoading ? (
              <div className="py-16 text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-cyan-400" />
                <p className="text-xs text-slate-400">Loading gap analysis reports...</p>
              </div>
            ) : filteredGapReports.length === 0 ? (
              <div className="py-16 text-center space-y-2">
                <ShieldAlert className="w-8 h-8 mx-auto text-slate-500 opacity-60" />
                <p className={`text-sm font-bold ${headingCls}`}>No Gap Analysis Reports Found</p>
                <p className={`text-xs ${mutedCls}`}>
                  {isAdmin
                    ? 'Use the "Gap Analysis" button on the GIS Map page to run new evaluations.'
                    : 'Your department has no pending surveillance gap analysis dispatches.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className={isLight ? 'bg-slate-50 text-slate-600 border-b border-slate-200' : 'bg-white/3 text-slate-400 border-b border-white/8'}>
                      <th className="py-3 px-4 font-bold">Report ID</th>
                      <th className="py-3 px-4 font-bold">Location & Sector</th>
                      <th className="py-3 px-3 font-bold text-center">Radius</th>
                      <th className="py-3 px-3 font-bold text-center">Coverage Score</th>
                      <th className="py-3 px-3 font-bold text-center">Critical Gaps</th>
                      <th className="py-3 px-4 font-bold">Responsible Department</th>
                      <th className="py-3 px-3 font-bold">Status</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-inherit">
                    {filteredGapReports.map((report) => {
                      const cfg = GAP_STATUS_CFG[report.status] || GAP_STATUS_CFG.GENERATED;
                      const score = report.summary?.coverageScore ?? 0;
                      return (
                        <tr
                          key={report.reportId || report._id}
                          className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-white/3'}`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-cyan-400">
                            {report.reportId}
                          </td>
                          <td className="py-3 px-4">
                            <div className={`font-bold ${headingCls}`}>{report.location?.name}</div>
                            <div className="text-[10px] text-slate-400">{report.location?.district}</div>
                          </td>
                          <td className="py-3 px-3 text-center font-mono text-slate-300">
                            {report.radiusMeters >= 1000 ? `${(report.radiusMeters / 1000).toFixed(1)} km` : `${report.radiusMeters} m`}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className={`inline-block px-2 py-0.5 rounded-full font-mono font-black text-xs ${
                              score >= 75 ? 'bg-emerald-500/15 text-emerald-400' : score >= 50 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'
                            }`}>
                              {score}/100
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center font-mono font-bold text-rose-400">
                            {report.summary?.criticalGaps ?? 0}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-bold text-blue-400">
                              {report.responsibleDepartment?.name || report.responsibleDepartment?.code}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Dispatched by: {report.createdBy?.name}
                            </div>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setGapDetailReportId(report.reportId || report._id);
                                setIsGapDetailOpen(true);
                              }}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <span>Review</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Dept Report Thread Modal ── */}
      <DeptReportThreadModal
        isOpen={isThreadOpen}
        onClose={() => {
          setIsThreadOpen(false);
          setThreadReportId(null);
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('id');
          setSearchParams(newParams);
        }}
        reportId={threadReportId}
      />

      {/* ── Gap Analysis Detail Modal ── */}
      <GapReportDetailModal
        isOpen={isGapDetailOpen}
        onClose={() => {
          setIsGapDetailOpen(false);
          setGapDetailReportId(null);
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('id');
          setSearchParams(newParams);
        }}
        reportId={gapDetailReportId}
        user={user}
        onStatusUpdated={() => {
          refetchGapReports();
        }}
        isLight={isLight}
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
