import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { footageTicketAPI, cameraAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import {
  FileText, Plus, Shield, Search, Filter, RotateCcw,
  CheckCircle2, Clock, XCircle, Send, Download, ExternalLink,
  ChevronRight, Calendar, User, Building, MapPin, Hash,
  AlertTriangle, Lock, Eye, Copy, Info, Check, ArrowDownLeft,
  ArrowUpRight, Globe, FileCheck, HelpCircle, Layers, X
} from 'lucide-react';

const STATUS_CONFIG = {
  submitted: {
    label: 'Submitted',
    color: 'amber',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/25',
    lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  under_review: {
    label: 'Under Review',
    color: 'blue',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    lightBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  approved: {
    label: 'Approved',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  dispatched: {
    label: 'Dispatched',
    color: 'cyan',
    badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    lightBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dot: 'bg-cyan-400',
  },
  rejected: {
    label: 'Rejected',
    color: 'rose',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
    lightBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  closed: {
    label: 'Closed',
    color: 'slate',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
    lightBadge: 'bg-slate-100 text-slate-600 border-slate-300',
    dot: 'bg-slate-400',
  },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'URGENT', tw: 'bg-red-500/15 text-red-400 border-red-500/30' },
  high:   { label: 'HIGH',   tw: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  medium: { label: 'MEDIUM', tw: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  low:    { label: 'LOW',    tw: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export default function FootageRequestsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  // Filters & State
  const [direction, setDirection] = useState('incoming'); // 'incoming' | 'outgoing' | 'all'
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [dispatchRemarks, setDispatchRemarks] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  // Queries
  const { data: ticketsData, isLoading: isTicketsLoading } = useQuery({
    queryKey: ['footage-tickets', direction, statusFilter, priorityFilter, search],
    queryFn: () =>
      footageTicketAPI
        .getAll({
          direction,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          priority: priorityFilter !== 'all' ? priorityFilter : undefined,
          search: search.trim() || undefined,
        })
        .then((r) => r.data),
    refetchInterval: 15000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['footage-tickets-stats'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
    refetchInterval: 15000,
  });

  const { data: selectedTicket, isLoading: isDetailLoading } = useQuery({
    queryKey: ['footage-ticket-detail', selectedTicketId],
    queryFn: () => footageTicketAPI.getById(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId),
  });

  const { data: auditLogsData, isLoading: isLogsLoading } = useQuery({
    queryKey: ['footage-ticket-audit-logs', selectedTicketId],
    queryFn: () => footageTicketAPI.getAuditLogs(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId),
  });

  // Query all cameras for the Requisition Modal picker
  const { data: camerasList = [] } = useQuery({
    queryKey: ['cameras-short-list'],
    queryFn: () => cameraAPI.getAll({ limit: 1000 }).then((r) => r.data.data || []),
    staleTime: 120000,
  });

  const tickets = ticketsData?.data || [];
  const stats = statsData || { total: 0, pendingAction: 0, approved: 0, dispatched: 0, rejected: 0, incomingPending: 0 };

  // Mutations
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, remarks, rejectionReason }) =>
      footageTicketAPI.updateStatus(id, { status, remarks, rejectionReason }),
    onSuccess: (_, variables) => {
      toast.success(`Requisition ${variables.status.replace('_', ' ')} successfully`);
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsRejectModalOpen(false);
      setRejectionReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update ticket status'),
  });

  const dispatchMutation = useMutation({
    mutationFn: ({ id, remarks, validityDays }) =>
      footageTicketAPI.dispatch(id, { remarks, validityDays }),
    onSuccess: () => {
      toast.success('Footage securely attached and dispatched to requesting department');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsDispatchModalOpen(false);
      setDispatchRemarks('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to dispatch footage'),
  });

  const accessMutation = useMutation({
    mutationFn: (id) => footageTicketAPI.recordAccess(id),
    onSuccess: (res) => {
      toast.success('Access logged in legal chain of custody audit trail');
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      if (res.data?.data?.footageUrl) {
        window.open(res.data.data.footageUrl, '_blank');
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to record footage access'),
  });

  // Create Requisition Form State
  const [createForm, setCreateForm] = useState({
    title: '',
    firNumber: '',
    caseNumber: '',
    incidentType: 'Criminal Investigation',
    priority: 'high',
    classification: 'Confidential',
    cameraId: '',
    startTime: '',
    endTime: '',
    purpose: '',
    contactPhone: user?.phone || '+91-79-23250000',
    officialDesignation: user?.designation || 'Investigating Officer',
    acknowledgedCompliance: false,
  });

  // Auto-fill from URL or external state if passed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const camParam = params.get('requestCam');
    if (camParam) {
      setCreateForm((p) => ({ ...p, cameraId: camParam }));
      setIsCreateModalOpen(true);
    }
  }, []);

  const selectedCameraObj = useMemo(() => {
    if (!createForm.cameraId) return null;
    return camerasList.find((c) => c.cameraId === createForm.cameraId || c._id === createForm.cameraId);
  }, [createForm.cameraId, camerasList]);

  const calculatedDuration = useMemo(() => {
    if (!createForm.startTime || !createForm.endTime) return 0;
    const s = new Date(createForm.startTime);
    const e = new Date(createForm.endTime);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e <= s) return 0;
    return Math.round((e - s) / (1000 * 60));
  }, [createForm.startTime, createForm.endTime]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.title || !createForm.cameraId || !createForm.startTime || !createForm.endTime || !createForm.purpose) {
      toast.error('Please fill all mandatory requisition fields');
      return;
    }
    if (!createForm.acknowledgedCompliance) {
      toast.error('Please accept the Official Secrets Act & Evidence Act compliance terms');
      return;
    }

    try {
      const res = await footageTicketAPI.create(createForm);
      toast.success(`Requisition ticket ${res.data.data.ticketId} dispatched successfully`);
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      setIsCreateModalOpen(false);
      setSelectedTicketId(res.data.data.ticketId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create requisition ticket');
    }
  };

  const copyText = (txt, key) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const isSuperAdmin = user?.role === 'superadmin';

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0a0d14] text-slate-100'}`}>
      
      {/* ─── Top Header & Department Context Banner ──────────────── */}
      <div className={`px-6 py-5 border-b shrink-0 flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white/95 border-slate-200 shadow-xs' : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-3.5">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center border shadow-xs ${
            isLight ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-blue-600/10 border-blue-500/25 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]'
          }`}>
            <FileCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className={`text-lg font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                Inter-Department CCTV Footage Requisitions
              </h1>
              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-white/5 text-slate-300 border-white/10'
              }`}>
                {user?.department || 'Gujarat Home Department'}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Official Evidence Chain of Custody System · Section 65B Bharatiya Sakshya Adhiniyam · Immutable Action Logs
            </p>
          </div>
        </div>

        {/* Create Requisition Button */}
        <button
          onClick={() => {
            setCreateForm({
              title: '',
              firNumber: '',
              caseNumber: '',
              incidentType: 'Criminal Investigation',
              priority: 'high',
              classification: 'Confidential',
              cameraId: '',
              startTime: '',
              endTime: '',
              purpose: '',
              contactPhone: user?.phone || '+91-79-23250000',
              officialDesignation: user?.designation || 'Investigating Officer',
              acknowledgedCompliance: false,
            });
            setIsCreateModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs shadow-[0_4px_16px_rgba(37,99,235,0.35)] transition-all cursor-pointer transform active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>New Requisition Ticket</span>
        </button>
      </div>

      {/* ─── Main Content Container ───────────────────────────────── */}
      <div className="p-6 space-y-6 flex-1">

        {/* ─── KPI Metric Cards ───────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`p-4 rounded-2xl border transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Total Requisitions</span>
              <FileText className="w-4 h-4 text-blue-500" />
            </div>
            <p className={`text-2xl font-black mt-2 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              {stats.total}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Inter-department tickets registered</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-colors ${
            isLight ? 'bg-white border-amber-200 shadow-xs' : 'bg-[#141929] border-amber-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-500">Pending Review</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-2xl font-black mt-2 text-amber-500">
              {stats.pendingAction}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              {stats.incomingPending} incoming to your department
            </p>
          </div>

          <div className={`p-4 rounded-2xl border transition-colors ${
            isLight ? 'bg-white border-emerald-200 shadow-xs' : 'bg-[#141929] border-emerald-500/20'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">Dispatched Evidence</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-2xl font-black mt-2 text-emerald-500">
              {stats.dispatched}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Secure media attached & delivered</p>
          </div>

          <div className={`p-4 rounded-2xl border transition-colors ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
          }`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Closed / Rejected</span>
              <XCircle className="w-4 h-4 text-slate-400" />
            </div>
            <p className={`text-2xl font-black mt-2 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
              {stats.rejected + stats.closed}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">Archived in official judicial registry</p>
          </div>
        </div>

        {/* ─── Department Inbox Direction Tabs ────────────────────── */}
        <div className={`flex flex-wrap items-center justify-between gap-4 p-2 rounded-2xl border transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 text-xs font-semibold">
            <button
              onClick={() => setDirection('incoming')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                direction === 'incoming'
                  ? isLight
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowDownLeft className="w-3.5 h-3.5" />
              <span>Incoming Requests</span>
              {stats.incomingPending > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>

            <button
              onClick={() => setDirection('outgoing')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                direction === 'outgoing'
                  ? isLight
                    ? 'bg-white text-blue-700 shadow-xs font-bold'
                    : 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              <span>Outgoing Requests</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setDirection('all')}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg transition-all cursor-pointer ${
                  direction === 'all'
                    ? isLight
                      ? 'bg-white text-blue-700 shadow-xs font-bold'
                      : 'bg-blue-600 text-white shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>All State Requisitions</span>
              </button>
            )}
          </div>

          {/* Search and Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search ticket, FIR, camera, dept..."
                className={`text-xs pl-8 pr-3 py-1.5 rounded-xl border outline-none w-56 transition-all ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-blue-500'
                    : 'bg-white/4 border-white/8 text-slate-200 placeholder:text-slate-500 focus:border-cyan-500/50'
                }`}
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`text-xs px-2.5 py-1.5 rounded-xl border outline-none cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-white/4 border-white/8 text-slate-300'
              }`}
            >
              <option value="all">All Statuses</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="dispatched">Dispatched</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={`text-xs px-2.5 py-1.5 rounded-xl border outline-none cursor-pointer ${
                isLight ? 'bg-white border-slate-300 text-slate-800' : 'bg-white/4 border-white/8 text-slate-300'
              }`}
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            {(search || statusFilter !== 'all' || priorityFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setPriorityFilter('all');
                }}
                className={`p-1.5 rounded-lg border text-slate-400 hover:text-slate-200 ${
                  isLight ? 'border-slate-300 bg-white hover:bg-slate-100' : 'border-white/8 bg-white/4 hover:bg-white/8'
                }`}
                title="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ─── Requisition Tickets Data Table ─────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden shadow-xs transition-colors ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#141929] border-white/8'
        }`}>
          {isTicketsLoading ? (
            <div className="p-12 flex flex-col items-center justify-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Loading requisition registry...</p>
            </div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                isLight ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white/4 border-white/8 text-slate-500'
              }`}>
                <FileText className="w-6 h-6" />
              </div>
              <p className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                No footage requisition tickets found
              </p>
              <p className="text-xs text-slate-500 max-w-sm">
                There are currently no tickets matching your active filters. You can initiate a new legal requisition for CCTV footage anytime.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                    isLight ? 'bg-slate-50/80 border-slate-200 text-slate-500' : 'bg-white/2 border-white/6 text-slate-400'
                  }`}>
                    <th className="py-3.5 px-4 font-semibold">Ticket ID & Case</th>
                    <th className="py-3.5 px-4 font-semibold">Target Camera & Location</th>
                    <th className="py-3.5 px-4 font-semibold">Requesting Agency</th>
                    <th className="py-3.5 px-4 font-semibold">Time Window (Duration)</th>
                    <th className="py-3.5 px-4 font-semibold">Priority</th>
                    <th className="py-3.5 px-4 font-semibold">Status</th>
                    <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isLight ? 'divide-slate-200' : 'divide-white/4'}`}>
                  {tickets.map((t) => {
                    const statusCfg = STATUS_CONFIG[t.status] || STATUS_CONFIG.submitted;
                    const priorityCfg = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;
                    const isSelected = selectedTicketId === t.ticketId;

                    return (
                      <tr
                        key={t._id}
                        onClick={() => setSelectedTicketId(t.ticketId)}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? isLight ? 'bg-blue-50/80' : 'bg-blue-500/10'
                            : isLight ? 'hover:bg-slate-50' : 'hover:bg-white/2'
                        }`}
                      >
                        {/* Ticket & Case */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                              {t.ticketId}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 font-bold uppercase">
                              {t.classification || 'Confidential'}
                            </span>
                          </div>
                          <p className={`font-bold mt-0.5 max-w-[200px] truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                            {t.title}
                          </p>
                          {t.firNumber && (
                            <p className="text-[10px] text-slate-500 font-mono">
                              FIR: {t.firNumber}
                            </p>
                          )}
                        </td>

                        {/* Target Camera */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[11px] font-semibold text-slate-400">{t.cameraId}</span>
                            <span className="text-slate-300">·</span>
                            <span className={`font-medium truncate max-w-[170px] ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                              {t.cameraName}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate max-w-[200px] mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            {t.locationName}, {t.district}
                          </p>
                          <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                            Target Dept: {t.targetDepartment}
                          </p>
                        </td>

                        {/* Requesting Agency */}
                        <td className="py-3.5 px-4">
                          <p className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            {t.requestingDepartment}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            {t.requestedBy?.name || 'Authorized Officer'} ({t.officialDesignation || 'IO'})
                          </p>
                        </td>

                        {/* Time Window */}
                        <td className="py-3.5 px-4">
                          <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {new Date(t.startTime).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}{' '}
                            {new Date(t.startTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                            {' → '}
                            {new Date(t.endTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })}
                          </div>
                          <span className="inline-block mt-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-slate-100 dark:bg-white/6 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/8">
                            {t.durationMinutes} minutes duration
                          </span>
                        </td>

                        {/* Priority */}
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold tracking-wider uppercase border ${priorityCfg.tw}`}>
                            {priorityCfg.label}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            isLight ? statusCfg.lightBadge : statusCfg.badgeClass
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
                            {statusCfg.label}
                          </span>
                        </td>

                        {/* Action */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTicketId(t.ticketId);
                            }}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs border flex items-center gap-1.5 ml-auto transition-all ${
                              isLight
                                ? 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-200'
                                : 'bg-white/4 hover:bg-cyan-500/15 text-slate-300 hover:text-cyan-400 border-white/8'
                            }`}
                          >
                            <span>Inspect Dossier</span>
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

      {/* ─── Selected Ticket Dossier & Forensic Audit Trail Drawer ─── */}
      {selectedTicketId && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-[fadeIn_0.15s_ease]">
          <div
            className={`w-full max-w-2xl h-full flex flex-col shadow-2xl border-l overflow-hidden transition-colors ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-[#0e1322] border-white/10 text-slate-100'
            }`}
          >
            {/* Drawer Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between shrink-0 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0d121f] border-white/8'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-500 font-bold">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-blue-600 dark:text-cyan-400">
                      {selectedTicket?.ticketId || selectedTicketId}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
                      {selectedTicket?.classification || 'Confidential'}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mt-0.5 truncate max-w-sm">
                    {selectedTicket?.title}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTicketId(null)}
                className={`p-2 rounded-xl transition-all ${
                  isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200' : 'text-slate-400 hover:text-white hover:bg-white/8'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isDetailLoading || !selectedTicket ? (
                <div className="p-12 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-slate-400">Loading confidential requisition dossier...</p>
                </div>
              ) : (
                <>
                  {/* Status Banner */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between gap-4 ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                  }`}>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Requisition Status</span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                          isLight ? STATUS_CONFIG[selectedTicket.status]?.lightBadge : STATUS_CONFIG[selectedTicket.status]?.badgeClass
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${STATUS_CONFIG[selectedTicket.status]?.dot}`} />
                          {STATUS_CONFIG[selectedTicket.status]?.label}
                        </span>
                        <span className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${
                          PRIORITY_CONFIG[selectedTicket.priority]?.tw
                        }`}>
                          {selectedTicket.priority}
                        </span>
                      </div>
                    </div>

                    {/* FIR reference */}
                    {selectedTicket.firNumber && (
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">FIR / Crime Reference</span>
                        <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200 mt-1">
                          {selectedTicket.firNumber}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Inter-Department Workflow Action Buttons */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isLight ? 'bg-blue-50/50 border-blue-200' : 'bg-blue-500/5 border-blue-500/15'
                  }`}>
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Authority & Review Actions
                      </h4>
                      <span className="text-[11px] text-slate-500 font-medium">Departmental Decision</span>
                    </div>

                    <div className="flex flex-wrap gap-2.5">
                      {selectedTicket.status === 'submitted' && (
                        <button
                          onClick={() =>
                            updateStatusMutation.mutate({
                              id: selectedTicket.ticketId,
                              status: 'under_review',
                              remarks: `Review started by ${user?.name} (${user?.department})`,
                            })
                          }
                          disabled={updateStatusMutation.isLoading}
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <Eye className="w-3.5 h-3.5" /> Start Formal Review
                        </button>
                      )}

                      {(selectedTicket.status === 'submitted' || selectedTicket.status === 'under_review') && (
                        <>
                          <button
                            onClick={() =>
                              updateStatusMutation.mutate({
                                id: selectedTicket.ticketId,
                                status: 'approved',
                                remarks: `Requisition approved by ${user?.name} (${user?.department}). Awaiting footage export.`,
                              })
                            }
                            disabled={updateStatusMutation.isLoading}
                            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                          >
                            <Check className="w-3.5 h-3.5" /> Approve Requisition
                          </button>

                          <button
                            onClick={() => setIsDispatchModalOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                          >
                            <Send className="w-3.5 h-3.5" /> Attach & Dispatch Footage
                          </button>

                          <button
                            onClick={() => setIsRejectModalOpen(true)}
                            className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all ml-auto"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject Request
                          </button>
                        </>
                      )}

                      {selectedTicket.status === 'approved' && (
                        <button
                          onClick={() => setIsDispatchModalOpen(true)}
                          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <Send className="w-3.5 h-3.5" /> Attach & Dispatch Footage
                        </button>
                      )}

                      {selectedTicket.status === 'dispatched' && (
                        <div className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                          <span className="text-xs font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" /> Evidence ready for secure access & audit logging
                          </span>
                          <button
                            onClick={() => accessMutation.mutate(selectedTicket.ticketId)}
                            disabled={accessMutation.isLoading}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" /> Download / Access Media
                          </button>
                        </div>
                      )}

                      {selectedTicket.status !== 'closed' && (
                        <button
                          onClick={() =>
                            updateStatusMutation.mutate({
                              id: selectedTicket.ticketId,
                              status: 'closed',
                              remarks: `Requisition case closed by ${user?.name} (${user?.department})`,
                            })
                          }
                          disabled={updateStatusMutation.isLoading}
                          className="px-3.5 py-2 rounded-xl border text-slate-400 hover:text-slate-200 border-white/10 hover:bg-white/5 text-xs font-semibold transition-all ml-auto"
                        >
                          Close Case
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Dispatched Media & SHA-256 Checksum Card */}
                  {selectedTicket.footageUrl && (
                    <div className={`p-4 rounded-2xl border space-y-3 ${
                      isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-500/5 border-emerald-500/20'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                          <Lock className="w-4 h-4" /> Dispatched Video Evidence Details
                        </span>
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400">Section 65B Verified</span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between items-center py-1 border-b border-emerald-500/15">
                          <span className="text-slate-500">SHA-256 Checksum</span>
                          <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                            <span className="truncate max-w-[280px]">{selectedTicket.mediaHash}</span>
                            <button
                              onClick={() => copyText(selectedTicket.mediaHash, 'hash')}
                              className="p-1 hover:bg-emerald-500/20 rounded"
                            >
                              {copiedKey === 'hash' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>

                        <div className="flex justify-between py-1 border-b border-emerald-500/15">
                          <span className="text-slate-500">Access Expiry</span>
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {selectedTicket.expiresAt ? new Date(selectedTicket.expiresAt).toLocaleString('en-IN') : '7 Days Default'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Target Camera & Location Dossier */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-white/3 border-white/6'
                  }`}>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-cyan-400" /> Requested Camera & Geospatial Coordinates
                    </h4>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[11px] text-slate-500">Camera Unit</span>
                        <p className="font-bold text-slate-900 dark:text-slate-100 font-mono mt-0.5">
                          {selectedTicket.cameraId}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{selectedTicket.cameraName}</p>
                      </div>

                      <div>
                        <span className="text-[11px] text-slate-500">Managing Department</span>
                        <p className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {selectedTicket.targetDepartment}
                        </p>
                        <p className="text-[11px] text-slate-400">{selectedTicket.district} District</p>
                      </div>

                      <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-white/6 flex justify-between">
                        <div>
                          <span className="text-[11px] text-slate-500">Location Area</span>
                          <p className="font-medium text-slate-800 dark:text-slate-200 mt-0.5">
                            {selectedTicket.locationName}
                          </p>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] text-slate-500">GPS Coordinates</span>
                          <p className="font-mono text-[11px] text-cyan-600 dark:text-cyan-400 mt-0.5">
                            {selectedTicket.coordinates?.[1]?.toFixed(5)}°N, {selectedTicket.coordinates?.[0]?.toFixed(5)}°E
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Time Window & Requisition Justification */}
                  <div className={`p-4 rounded-2xl border space-y-3 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-white/3 border-white/6'
                  }`}>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-500" /> Time Window & Legal Justification
                    </h4>

                    <div className="p-3 rounded-xl bg-slate-100 dark:bg-white/4 border border-slate-200 dark:border-white/6 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-slate-500 text-[10px] uppercase font-bold">From (IST)</span>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {new Date(selectedTicket.startTime).toLocaleString('en-IN')}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 font-mono text-[11px] font-bold">
                        {selectedTicket.durationMinutes} mins
                      </span>
                      <div className="text-right">
                        <span className="text-slate-500 text-[10px] uppercase font-bold">To (IST)</span>
                        <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {new Date(selectedTicket.endTime).toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Official Legal Justification</span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-black/20 p-3 rounded-xl border border-slate-200 dark:border-white/6 mt-1 leading-relaxed">
                        {selectedTicket.purpose}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200 dark:border-white/6 flex justify-between items-center text-xs text-slate-500">
                      <span>Requesting Officer: <strong className="text-slate-700 dark:text-slate-300">{selectedTicket.requestedBy?.name}</strong></span>
                      <span>Phone: <strong className="font-mono text-slate-700 dark:text-slate-300">{selectedTicket.contactPhone || selectedTicket.requestedBy?.phone}</strong></span>
                    </div>
                  </div>

                  {/* ─── Immutable Forensic Action Log Timeline ─────────────── */}
                  <div className={`p-4 rounded-2xl border space-y-4 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-white/3 border-white/6'
                  }`}>
                    <div className="flex items-center justify-between border-b pb-3 border-slate-200 dark:border-white/6">
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-emerald-500" /> Tamper-Evident Forensic Action Log
                      </h4>
                      <span className="text-[10px] font-mono text-emerald-500 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                        {auditLogsData?.length || 0} Sealed Records
                      </span>
                    </div>

                    {isLogsLoading ? (
                      <p className="text-xs text-slate-400 text-center py-4">Verifying audit seals...</p>
                    ) : !auditLogsData || auditLogsData.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">No audit logs recorded yet.</p>
                    ) : (
                      <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-white/10">
                        {auditLogsData.map((log) => (
                          <div key={log._id} className="relative group">
                            {/* Dot */}
                            <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-blue-500 ring-4 ring-white dark:ring-[#0e1322]" />

                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {log.action.replace('_', ' ')}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400">
                                {new Date(log.timestamp).toLocaleString('en-IN')}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                              {log.remarks}
                            </p>

                            <div className="flex flex-wrap items-center gap-2 mt-1 text-[10px] text-slate-500">
                              <span>Actor: <strong className="text-slate-700 dark:text-slate-300">{log.actorName}</strong> ({log.actorDepartment})</span>
                              <span>·</span>
                              <span className="font-mono">IP: {log.ipAddress}</span>
                            </div>

                            {log.integrityHash && (
                              <div className="mt-1 flex items-center gap-1 font-mono text-[9px] text-emerald-600 dark:text-emerald-400/80">
                                <Lock className="w-2.5 h-2.5" />
                                <span>Seal: {log.integrityHash.slice(0, 20)}...</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: New Footage Requisition ───────────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden transition-colors ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1422] border-white/10 text-slate-100'
          }`}>
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#0d121f] border-white/8'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-500/25 flex items-center justify-center text-blue-500">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Lodge Inter-Department CCTV Footage Requisition</h3>
                  <p className="text-xs text-slate-500">Section 65B Indian Evidence Act / BSA Compliance</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Title */}
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                  Requisition Title / Incident Name *
                </label>
                <input
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. Investigation of Hit-and-Run Incident near Ring Road"
                  required
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                  }`}
                />
              </div>

              {/* Case & FIR Numbers */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                    FIR Number (If registered)
                  </label>
                  <input
                    value={createForm.firNumber}
                    onChange={(e) => setCreateForm({ ...createForm, firNumber: e.target.value })}
                    placeholder="e.g. FIR-2026/0842"
                    className={`w-full px-3 py-2 rounded-xl border outline-none font-mono ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                    Priority Level *
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                    }`}
                  >
                    <option value="urgent">Urgent (VIP / Life Threat)</option>
                    <option value="high">High (Major Heinous Crime)</option>
                    <option value="medium">Medium (Routine Inquiry)</option>
                    <option value="low">Low (Compliance / Audit)</option>
                  </select>
                </div>
              </div>

              {/* Camera Selection */}
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                  Target Camera Unit (500 Gujarat Units) *
                </label>
                <select
                  value={createForm.cameraId}
                  onChange={(e) => setCreateForm({ ...createForm, cameraId: e.target.value })}
                  required
                  className={`w-full px-3 py-2 rounded-xl border outline-none font-mono ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                  }`}
                >
                  <option value="">Select target camera...</option>
                  {camerasList.map((c) => (
                    <option key={c.cameraId} value={c.cameraId}>
                      {c.cameraId} — {c.name || c.cameraName} ({c.district} · {c.departmentName})
                    </option>
                  ))}
                </select>

                {selectedCameraObj && (
                  <div className={`mt-2 p-2.5 rounded-xl border flex justify-between items-center text-[11px] ${
                    isLight ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/20 text-cyan-300'
                  }`}>
                    <span>Target Dept: <strong>{selectedCameraObj.departmentName}</strong></span>
                    <span>District: <strong>{selectedCameraObj.district}</strong></span>
                  </div>
                )}
              </div>

              {/* Date & Time Duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                    Footage Start Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm({ ...createForm, startTime: e.target.value })}
                    required
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                    }`}
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                    Footage End Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm({ ...createForm, endTime: e.target.value })}
                    required
                    className={`w-full px-3 py-2 rounded-xl border outline-none ${
                      isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                    }`}
                  />
                </div>
              </div>

              {calculatedDuration > 0 && (
                <div className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/8 flex justify-between items-center font-mono text-[11px]">
                  <span className="text-slate-500">Calculated Footage Duration:</span>
                  <span className="font-bold text-blue-600 dark:text-cyan-400">{calculatedDuration} minutes ({Math.round(calculatedDuration / 60 * 10) / 10} hours)</span>
                </div>
              )}

              {/* Legal Justification */}
              <div>
                <label className="block font-bold text-slate-600 dark:text-slate-400 uppercase text-[10px] tracking-wider mb-1">
                  Legal Justification & Purpose of Requisition *
                </label>
                <textarea
                  rows={3}
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm({ ...createForm, purpose: e.target.value })}
                  placeholder="Detail the case facts, suspect vehicle/person description, and legal authority under CrPC / Bharatiya Nagarik Suraksha Sanhita..."
                  required
                  className={`w-full px-3 py-2 rounded-xl border outline-none ${
                    isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                  }`}
                />
              </div>

              {/* Compliance Acknowledgment */}
              <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <input
                  type="checkbox"
                  id="complianceCheck"
                  checked={createForm.acknowledgedCompliance}
                  onChange={(e) => setCreateForm({ ...createForm, acknowledgedCompliance: e.target.checked })}
                  className="mt-0.5"
                />
                <label htmlFor="complianceCheck" className="text-[11px] leading-snug text-slate-700 dark:text-slate-300 cursor-pointer">
                  I hereby certify that this footage requisition is made for official investigative duties under the Official Secrets Act & Section 65B of Indian Evidence Act. Every action and download will be immutably recorded in the state audit trail.
                </label>
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold shadow-md cursor-pointer"
                >
                  Submit & Dispatch Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Dispatch Footage ──────────────────────────────── */}
      {isDispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1422] border-white/10 text-slate-100'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
              <Send className="w-4 h-4" /> Attach & Dispatch Video Evidence
            </h3>
            <p className="text-xs text-slate-500">
              The footage will be cryptographically sealed with a SHA-256 integrity checksum and dispatched to the requesting department.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Dispatch Remarks / Archive Notes
              </label>
              <textarea
                rows={3}
                value={dispatchRemarks}
                onChange={(e) => setDispatchRemarks(e.target.value)}
                placeholder="e.g. Exported 1080p stream from local NVR archive, camera clear, no packet loss."
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDispatchModalOpen(false)}
                className="px-4 py-2 rounded-xl border text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  dispatchMutation.mutate({
                    id: selectedTicketId,
                    remarks: dispatchRemarks,
                    validityDays: 14,
                  })
                }
                disabled={dispatchMutation.isLoading}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-md"
              >
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Reject Requisition ─────────────────────────────── */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-[fadeIn_0.15s_ease]">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f1422] border-white/10 text-slate-100'
          }`}>
            <h3 className="text-sm font-bold flex items-center gap-2 text-rose-500">
              <XCircle className="w-4 h-4" /> Reject Footage Requisition
            </h3>
            <p className="text-xs text-slate-500">
              Please provide formal administrative or jurisdictional grounds for rejection. This will be recorded permanently in the state audit trail.
            </p>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Mandatory Rejection Grounds *
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="e.g. Target camera was undergoing maintenance on requested date; jurisdiction belongs to National Highway Authority."
                required
                className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                  isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-white/4 border-white/8 text-slate-100'
                }`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-4 py-2 rounded-xl border text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!rejectionReason.trim()) {
                    toast.error('Rejection reason is required');
                    return;
                  }
                  updateStatusMutation.mutate({
                    id: selectedTicketId,
                    status: 'rejected',
                    rejectionReason,
                    remarks: rejectionReason,
                  });
                }}
                disabled={updateStatusMutation.isLoading}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
