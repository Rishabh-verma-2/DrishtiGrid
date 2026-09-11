import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Share2,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Layers,
  Building2,
  Camera,
  Car,
  User,
  Send,
  Video,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Hash,
  MapPin,
  Calendar,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import WatchlistDistributionModal from './WatchlistDistributionModal';
import MasterWatchlistBatchModal from './MasterWatchlistBatchModal';
import EvidenceViewerModal from './EvidenceViewerModal';
import toast from 'react-hot-toast';

const PRIORITY_BADGES = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30 font-black',
  HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-black',
  MEDIUM: 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-semibold',
  LOW: 'bg-slate-500/15 text-slate-400 border-slate-500/30 font-semibold',
};

const STATUS_BADGES = {
  SUBMITTED: 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-bold',
  ADMIN_REVIEW: 'bg-purple-500/15 text-purple-400 border-purple-500/30 font-bold',
  APPROVED: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold',
  REJECTED: 'bg-red-500/15 text-red-400 border-red-500/30',
  CORRECTION_REQUIRED: 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-bold',
  WATCHLIST_ACTIVE: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-black',
  ASSIGNED_TO_DEPARTMENTS: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  SEARCHING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  MATCH_FOUND: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-black',
  RESULT_SUBMITTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30 font-bold',
  ADMIN_VALIDATION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FORWARDED_TO_ORIGIN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-black',
  ACKNOWLEDGED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RESOLVED: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 font-black',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function AdminInvestigationPortal({ user }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  // Sub-tabs: 'overview', 'requests', 'watchlist', 'assignments', 'validation'
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedWatchlistEntry, setSelectedWatchlistEntry] = useState(null);
  const [reviewingCase, setReviewingCase] = useState(null);
  const [reviewAction, setReviewAction] = useState(null); // 'APPROVE', 'REJECT', 'REQUEST_CORRECTION'
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [activeEvidenceViewer, setActiveEvidenceViewer] = useState(null);
  const [isBatchWatchlistModalOpen, setIsBatchWatchlistModalOpen] = useState(false);

  // Filters for FIR Requests
  const [requestStatusFilter, setRequestStatusFilter] = useState('ALL');
  const [requestPriorityFilter, setRequestPriorityFilter] = useState('ALL');
  const [requestSearchQuery, setRequestSearchQuery] = useState('');

  // 1. Fetch Admin Operational Analytics
  const { data: analyticsData, refetch: refetchAnalytics } = useQuery({
    queryKey: ['investigation-analytics'],
    queryFn: () => investigationAPI.getAnalytics().then((r) => r.data.data),
    staleTime: 20000,
    refetchInterval: 30000,
  });

  const kpis = analyticsData?.kpis || {
    totalCases: 0,
    pendingFirs: 0,
    activeWatchlist: 0,
    activeInvestigations: 0,
    matchesFound: 0,
    pendingResults: 0,
    resolvedCases: 0,
    overdueCases: 0,
  };

  // 2. Fetch Incoming FIR Requests
  const { data: casesData, isLoading: casesLoading, refetch: refetchCases } = useQuery({
    queryKey: ['admin-fir-cases', requestStatusFilter, requestPriorityFilter, requestSearchQuery],
    queryFn: () =>
      investigationAPI
        .getCases({
          status: requestStatusFilter === 'PENDING' ? 'SUBMITTED' : requestStatusFilter,
          priority: requestPriorityFilter,
          search: requestSearchQuery,
          limit: 50,
        })
        .then((r) => r.data),
    staleTime: 15000,
  });

  const casesList = casesData?.data || [];

  // 3. Fetch Master Watchlist
  const { data: watchlistData, isLoading: watchlistLoading, refetch: refetchWatchlist } = useQuery({
    queryKey: ['admin-watchlist'],
    queryFn: () => investigationAPI.getWatchlist({ limit: 50 }).then((r) => r.data),
    staleTime: 20000,
  });

  const watchlistList = watchlistData?.data || [];

  // 4. Fetch Department Assignments
  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['admin-assignments'],
    queryFn: () => investigationAPI.getAssignments({ limit: 50 }).then((r) => r.data),
    staleTime: 20000,
    enabled: activeTab === 'assignments' || activeTab === 'overview',
  });

  const assignmentsList = assignmentsData?.data || [];

  // Review Case Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ caseId, action, remarks }) =>
      investigationAPI.reviewCase(caseId, { action, remarks }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['admin-fir-cases']);
      queryClient.invalidateQueries(['investigation-analytics']);
      queryClient.invalidateQueries(['admin-watchlist']);
      toast.success(res.message || 'Case reviewed successfully!');
      setReviewingCase(null);
      setReviewAction(null);
      setReviewRemarks('');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Review submission failed');
    },
  });

  // Evidence Validation & Forward Mutation
  const forwardMutation = useMutation({
    mutationFn: ({ resultId, remarks }) =>
      investigationAPI.forwardResult(resultId, { remarks }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-case']);
      queryClient.invalidateQueries(['investigation-analytics']);
      queryClient.invalidateQueries(['admin-fir-cases']);
      toast.success(res.message || 'Result forwarded to originating station!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Forwarding failed');
    },
  });

  const validateResultMutation = useMutation({
    mutationFn: ({ resultId, action, remarks }) =>
      investigationAPI.validateResult(resultId, { action, remarks }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-case']);
      queryClient.invalidateQueries(['investigation-analytics']);
      toast.success(res.message || 'Evidence validation updated!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Validation failed');
    },
  });

  const handleOpenReview = (c) => {
    setReviewingCase(c);
    setReviewAction('APPROVE');
    setReviewRemarks('');
  };

  const handleConfirmReview = () => {
    if (!reviewingCase || !reviewAction) return;
    if ((reviewAction === 'REJECT' || reviewAction === 'REQUEST_CORRECTION') && !reviewRemarks.trim()) {
      toast.error('Please enter justification remarks before proceeding.');
      return;
    }
    reviewMutation.mutate({
      caseId: reviewingCase.caseId,
      action: reviewAction,
      remarks: reviewRemarks,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar space-y-6 animate-fadeIn">
      {/* ────────────────── COMMAND CENTER HEADER BANNER ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-indigo-500" />
              Statewide FIR Investigation Command Center
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              GUJARAT HOME DEPARTMENT
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage, review, and coordinate incoming police station FIR requests, Master Watchlist, and multi-agency CCTV/ANPR distribution.
          </p>
        </div>

        {/* Top-Right Action: Create Master Watchlist */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsBatchWatchlistModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <Shield className="w-4 h-4" />
            Create Master Watchlist
            {kpis.pendingFirs > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-white/20 text-white ml-1">
                {kpis.pendingFirs} Pending
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ────────────────── OPERATIONAL METRICS ROW ────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          {
            label: 'Pending FIR Reviews',
            val: kpis.pendingFirs,
            color: isLight ? 'text-amber-600' : 'text-amber-400',
            actionText: 'Review →',
            onClick: () => {
              setActiveTab('requests');
              setRequestStatusFilter('PENDING');
            },
          },
          {
            label: 'Active Watchlist',
            val: kpis.activeWatchlist,
            color: isLight ? 'text-blue-600' : 'text-blue-400',
            actionText: 'Manage →',
            onClick: () => setActiveTab('watchlist'),
          },
          {
            label: 'Active Investigations',
            val: kpis.activeInvestigations,
            color: isLight ? 'text-indigo-600' : 'text-indigo-400',
            actionText: 'Track →',
            onClick: () => setActiveTab('assignments'),
          },
          {
            label: 'Potential AI Matches',
            val: kpis.matchesFound,
            color: isLight ? 'text-purple-600' : 'text-purple-400',
            actionText: 'Inspect →',
            onClick: () => setActiveTab('validation'),
          },
          {
            label: 'Evidence To Validate',
            val: kpis.pendingResults || (kpis.matchesFound > 0 ? 1 : 0),
            color: isLight ? 'text-teal-600' : 'text-teal-400',
            actionText: 'Validate →',
            onClick: () => setActiveTab('validation'),
          },
          {
            label: 'Overdue Inquiries',
            val: kpis.overdueCases,
            color: isLight ? 'text-red-600' : 'text-red-400',
            actionText: 'View Alerts →',
            onClick: () => setActiveTab('requests'),
          },
          {
            label: 'Resolved & Recovered',
            val: kpis.resolvedCases,
            color: isLight ? 'text-emerald-600' : 'text-emerald-400',
            actionText: 'Archive →',
            onClick: () => {
              setActiveTab('requests');
              setRequestStatusFilter('RESOLVED');
            },
          },
        ].map((m, idx) => (
          <div
            key={idx}
            onClick={m.onClick}
            className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
              isLight
                ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                : 'bg-[#0b101b] border-white/8 shadow-md hover:border-white/20'
            }`}
          >
            <span className="text-[10px] font-semibold uppercase text-slate-500 block truncate">
              {m.label}
            </span>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-xl lg:text-2xl font-bold font-mono tracking-tight ${m.color}`}>
                {m.val}
              </span>
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                {m.actionText}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ────────────────── SUB-NAVIGATION TABS ────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/8 pb-2 overflow-x-auto custom-scrollbar">
        {[
          { id: 'overview', label: 'Command Overview', icon: Layers },
          {
            id: 'requests',
            label: 'FIR Requests (Incoming)',
            icon: FileText,
            badge: kpis.pendingFirs > 0 ? kpis.pendingFirs : null,
          },
          { id: 'watchlist', label: 'Master Watchlist', icon: ShieldCheck, count: kpis.activeWatchlist },
          { id: 'assignments', label: 'Department Assignments', icon: Building2 },
          {
            id: 'validation',
            label: 'Evidence Validation & Routing',
            icon: Camera,
            badge: kpis.matchesFound > 0 ? kpis.matchesFound : null,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                isActive
                  ? isLight
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-amber-400 text-slate-950 ml-0.5">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ────────────────── TAB 1: COMMAND OVERVIEW ────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Section 23: 8-Stage Lifecycle Visualization */}
          <div
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
            }`}
          >
            <h3 className="text-xs font-mono font-bold uppercase text-slate-400 tracking-wider mb-4 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-500" />
              Standardized 8-Stage Legal Surveillance Workflow
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
              {[
                { stage: '1. Police Station', action: 'FIR Submission', icon: FileText, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '2. State Admin', action: 'Review & Verify', icon: Shield, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '3. Master Watchlist', action: 'Activate Case', icon: ShieldCheck, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '4. Departments', action: 'Investigation Dispatch', icon: Building2, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '5. AI / CCTV', action: 'Potential Match', icon: Search, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '6. Evidence', action: 'Investigation Result', icon: Camera, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '7. State Admin', action: 'Evidence Validation', icon: CheckCircle2, color: 'text-blue-600 dark:text-blue-400' },
                { stage: '8. Police Station', action: 'Result Received', icon: Send, color: 'text-blue-600 dark:text-blue-400' },
              ].map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-white/5 bg-white/2 flex flex-col justify-between"
                  >
                    <div>
                      <span className="text-[10px] font-mono text-slate-400 uppercase block font-bold">
                        {step.stage}
                      </span>
                      <p className={`text-xs font-black mt-1 ${step.color}`}>{step.action}</p>
                    </div>
                    <Icon className={`w-4 h-4 mt-2 ${step.color} opacity-80`} />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Queue: Pending FIR Submissions Awaiting Admin Review */}
          <div
            className={`p-5 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
            }`}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Incoming FIR Requests Awaiting Admin Review
                </h3>
                <p className="text-xs text-slate-400">
                  Submissions from Gujarat Police Stations requiring State Admin validation and Watchlist inclusion.
                </p>
              </div>
              <button
                onClick={() => {
                  setActiveTab('requests');
                  setRequestStatusFilter('PENDING');
                }}
                className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
              >
                View Full Queue ({kpis.pendingFirs}) <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5">
              {casesList
                .filter((c) => c.status === 'SUBMITTED' || c.status === 'ADMIN_REVIEW')
                .slice(0, 4)
                .map((c) => (
                  <div
                    key={c.caseId}
                    className="p-4 rounded-xl border border-white/6 bg-white/2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-white/20 transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                        {c.requestType === 'STOLEN_VEHICLE' ? (
                          <Car className="w-4 h-4 text-blue-400" />
                        ) : (
                          <User className="w-4 h-4 text-purple-400" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-blue-400">{c.caseId}</span>
                          <span className="text-xs text-slate-300 font-bold">
                            FIR: {c.firNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                              PRIORITY_BADGES[c.priority]
                            }`}
                          >
                            {c.priority}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">
                          Origin: <strong className="text-slate-200">{c.policeStation}</strong> ({c.officerName}) •{' '}
                          Subject:{' '}
                          <strong className="text-slate-200">
                            {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName || 'Not specified'}
                          </strong>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => handleOpenReview(c)}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <Shield className="w-3.5 h-3.5" /> Review FIR
                      </button>
                      <button
                        onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                        className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              {casesList.filter((c) => c.status === 'SUBMITTED' || c.status === 'ADMIN_REVIEW').length === 0 && (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
                  All incoming FIR submissions have been reviewed. No pending approvals in queue.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 2: INCOMING FIR REQUESTS ────────────────── */}
      {activeTab === 'requests' && (
        <div className="space-y-4">
          {/* Controls & Filters */}
          <div
            className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
            }`}
          >
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by Case ID, FIR number, vehicle plate, person name, police station..."
                  value={requestSearchQuery}
                  onChange={(e) => setRequestSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900'
                      : 'bg-white/3 border-white/10 text-white'
                  }`}
                />
              </div>

              <select
                value={requestStatusFilter}
                onChange={(e) => setRequestStatusFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121826] border-white/10 text-slate-200'
                }`}
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING">Pending Admin Review</option>
                <option value="APPROVED">Approved / Active</option>
                <option value="CORRECTION_REQUIRED">Correction Requested</option>
                <option value="REJECTED">Rejected</option>
                <option value="RESOLVED">Resolved & Recovered</option>
              </select>

              <select
                value={requestPriorityFilter}
                onChange={(e) => setRequestPriorityFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121826] border-white/10 text-slate-200'
                }`}
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical (2h SLA)</option>
                <option value="HIGH">High (6h SLA)</option>
                <option value="MEDIUM">Medium (24h SLA)</option>
                <option value="LOW">Low (72h SLA)</option>
              </select>
            </div>

            <button
              onClick={() => refetchCases()}
              className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-slate-300 flex items-center gap-1.5 cursor-pointer self-end md:self-auto"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Cases List */}
          <div className="space-y-3">
            {casesLoading ? (
              <div className="py-12 text-center text-slate-400">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto" />
                <p className="text-xs mt-3">Loading incoming FIR requisitions...</p>
              </div>
            ) : casesList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No FIR cases found matching the current criteria.
              </div>
            ) : (
              casesList.map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border transition-all ${
                    isLight
                      ? 'bg-white border-slate-200 hover:border-slate-300'
                      : 'bg-[#0b101b] border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-base font-black font-mono text-blue-400">
                          {c.caseId}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                          {c.requestType?.replace('_', ' ')}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs border ${
                            PRIORITY_BADGES[c.priority]
                          }`}
                        >
                          {c.priority} PRIORITY
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-xs border ${
                            STATUS_BADGES[c.status] || 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {c.status?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-1 text-xs text-slate-400">
                        <div>
                          FIR No: <strong className="text-slate-200 font-mono">{c.firNumber}</strong>
                        </div>
                        <div>
                          Origin: <strong className="text-slate-200">{c.policeStation}</strong>
                        </div>
                        <div>
                          Officer: <strong className="text-slate-200">{c.officerName}</strong>
                        </div>
                        <div>
                          Submitted: <strong className="text-slate-200">{new Date(c.createdAt).toLocaleString()}</strong>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-1">
                        <span className="text-slate-500">Synopsis: </span>
                        {c.caseDescription}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                      {(c.status === 'SUBMITTED' || c.status === 'ADMIN_REVIEW') && (
                        <button
                          onClick={() => handleOpenReview(c)}
                          className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-md shadow-amber-600/20 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <Shield className="w-3.5 h-3.5" /> Review FIR
                        </button>
                      )}

                      {c.isWatchlistActive && (
                        (c.assignedDepartments && c.assignedDepartments.length > 0) ||
                        c.status === 'ASSIGNED_TO_DEPARTMENTS' ||
                        c.status === 'SEARCHING' ||
                        c.status === 'MATCH_FOUND' ||
                        c.status === 'RESULT_SUBMITTED' ||
                        c.status === 'FORWARDED_TO_ORIGIN' ||
                        c.status === 'RESOLVED' ||
                        c.status === 'CLOSED' ? (
                          <span className="px-3 py-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-xs font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Forwarded
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedWatchlistEntry({ caseId: c.caseId });
                            }}
                            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                          >
                            <Share2 className="w-3.5 h-3.5" /> Forward
                          </button>
                        )
                      )}

                      <button
                        onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                        className="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Case
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: MASTER WATCHLIST ────────────────── */}
      {activeTab === 'watchlist' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
                Statewide Master Watchlist Registry
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Active approved cases broadcasted for surveillance and department investigations across Gujarat.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsBatchWatchlistModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5" /> Create Master Watchlist
              </button>
              <button
                onClick={() => refetchWatchlist()}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center gap-1 cursor-pointer transition-colors ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    : 'border-white/10 text-slate-300 hover:bg-white/5'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>
          </div>

          {watchlistLoading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-cyan-400 mb-2" />
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Loading Master Watchlist entries...</p>
            </div>
          ) : watchlistList.length === 0 ? (
            <div
              className={`p-10 rounded-2xl border text-center space-y-3 ${
                isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
              }`}
            >
              <ShieldCheck className="w-12 h-12 mx-auto text-slate-400 opacity-50" />
              <h3 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                No Active Master Watchlist Cases
              </h3>
              <p className={`text-xs max-w-md mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Approved police station FIR cases appear here for statewide surveillance broadcast and cross-department investigation dispatch.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {watchlistList.map((entry, idx) => {
                const priorityKey = (entry?.priority || 'HIGH').toUpperCase();
                const badgeClass = PRIORITY_BADGES[priorityKey] || PRIORITY_BADGES.HIGH;
                const identifier = entry?.subjectIdentifier || entry?.targetIdentifier || entry?.normalizedIdentifier || 'Target Entity';
                const station = entry?.originatingStation || entry?.policeStation || entry?.case?.originatingStation || 'Gujarat Police';
                const caseId = entry?.caseId || entry?.case?.caseId || 'CASE';

                return (
                  <div
                    key={entry?.watchlistId || entry?._id || idx}
                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                      isLight
                        ? 'bg-white border-slate-200 shadow-sm'
                        : 'bg-[#0b101b] border-white/8 hover:border-cyan-500/30'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-black text-cyan-400">
                          {entry?.watchlistId || 'WL-ACTIVE'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black border ${badgeClass}`}>
                          {priorityKey}
                        </span>
                      </div>

                      <div>
                        <h4 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                          {identifier}
                        </h4>
                        <p className={`text-xs font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          Case: {caseId}
                        </p>
                      </div>

                      <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        Origin Station: <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>{station}</strong>
                      </p>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry?.assignedDepartments && entry.assignedDepartments.length > 0 ? (
                          entry.assignedDepartments.map((dept, i) => {
                            const deptName = typeof dept === 'object' ? (dept.departmentName || dept.departmentCode || 'Dept') : String(dept);
                            return (
                              <span
                                key={dept?.departmentCode || i}
                                className="px-2 py-0.5 rounded-md text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
                              >
                                {deptName}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[10px] text-amber-500 font-mono font-medium">
                            ⚠️ Not yet assigned to departments
                          </span>
                        )}
                      </div>
                    </div>

                    <div className={`pt-3 border-t flex items-center justify-between ${isLight ? 'border-slate-200' : 'border-white/6'}`}>
                      {entry?.assignedDepartments && entry.assignedDepartments.length > 0 ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Forwarded
                          </span>
                          <button
                            onClick={() => setSelectedWatchlistEntry(entry)}
                            className={`text-[11px] font-semibold ${isLight ? 'text-slate-500 hover:text-indigo-600' : 'text-slate-400 hover:text-indigo-400'} underline cursor-pointer`}
                          >
                            Re-assign
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedWatchlistEntry(entry)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Assign Departments
                        </button>
                      )}

                      <button
                        onClick={() => navigate(`/investigation/cases/${caseId}`)}
                        className="text-xs font-bold text-blue-500 hover:text-blue-400 cursor-pointer"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 4: DEPARTMENT ASSIGNMENTS ────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Building2 className="w-5 h-5 text-indigo-400" />
              Statewide Department Investigation Assignments
            </h2>
            <p className="text-xs text-slate-400">
              Surveillance assignments distributed to agencies (Traffic Police, Crime Branch, SOG, City Police).
            </p>
          </div>

          <div
            className={`rounded-2xl border overflow-hidden ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-white/4 border-b border-white/8 text-slate-400 font-mono uppercase">
                  <tr>
                    <th className="p-3.5">Assignment ID</th>
                    <th className="p-3.5">Case ID</th>
                    <th className="p-3.5">Assigned Department</th>
                    <th className="p-3.5">Priority</th>
                    <th className="p-3.5">Assigned At</th>
                    <th className="p-3.5">Searches Run</th>
                    <th className="p-3.5">Matches</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {assignmentsList.map((a) => (
                    <tr key={a.assignmentId} className="hover:bg-white/2 transition-colors">
                      <td className="p-3.5 font-mono font-bold text-indigo-400">{a.assignmentId}</td>
                      <td className="p-3.5 font-mono text-blue-400">{a.caseId}</td>
                      <td className="p-3.5 font-bold text-slate-200">{a.assignedDepartment}</td>
                      <td className="p-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                            PRIORITY_BADGES[a.priority]
                          }`}
                        >
                          {a.priority}
                        </span>
                      </td>
                      <td className="p-3.5 text-slate-400 font-mono">
                        {new Date(a.assignedAt).toLocaleDateString()}
                      </td>
                      <td className="p-3.5 font-mono">{a.searchCount || 0}</td>
                      <td className="p-3.5 font-mono">
                        {a.matchCount > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-400 border border-amber-500/40">
                            {a.matchCount} Matches
                          </span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => navigate(`/investigation/cases/${a.caseId}`)}
                          className="px-2.5 py-1 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold cursor-pointer"
                        >
                          View Case
                        </button>
                      </td>
                    </tr>
                  ))}
                  {assignmentsList.length === 0 && (
                    <tr>
                      <td colSpan={8} className="p-6 text-center text-slate-500">
                        No active department assignments found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 5: EVIDENCE VALIDATION & ROUTING ────────────────── */}
      {activeTab === 'validation' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-teal-400" />
              Department Evidence Validation & Police Station Routing
            </h2>
            <p className="text-xs text-slate-400">
              Review forensic CCTV evidence packages submitted by investigation agencies and route validated findings back to originating police stations.
            </p>
          </div>

          <div className="space-y-3">
            {casesList
              .filter((c) => c.results && c.results.length > 0)
              .map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-blue-400">{c.caseId}</span>
                        <span className="text-xs text-slate-400">
                          Origin Station: <strong className="text-slate-200">{c.policeStation}</strong>
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Subject: {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName}
                      </p>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border self-start sm:self-auto ${
                        STATUS_BADGES[c.status]
                      }`}
                    >
                      Status: {c.status?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {c.results.map((res) => (
                      <div
                        key={res.resultId}
                        className="p-4 rounded-xl border border-white/6 bg-white/2 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/20 flex items-center justify-center shrink-0">
                            <Video className="w-5 h-5 text-teal-400" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-teal-400">
                                {res.resultId}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                {res.aiMatchConfidence}% AI Confidence
                              </span>
                              <span className="text-xs text-slate-400">
                                Dept: <strong className="text-slate-200">{res.departmentName}</strong>
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                              Camera: <strong className="text-slate-100">{res.cameraName}</strong> ({res.locationName})
                              • Detected: {new Date(res.detectedAt).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 italic">
                              "{res.officerRemarks || 'No officer remarks provided'}"
                            </p>
                          </div>
                        </div>

                        {/* Actions for Admin */}
                        <div className="flex flex-wrap items-center gap-2 self-end lg:self-center">
                          <button
                            onClick={() => setActiveEvidenceViewer(res)}
                            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" /> View Footage
                          </button>

                          {res.status !== 'ADMIN_VALIDATED' && res.status !== 'FORWARDED_TO_ORIGIN' && (
                            <button
                              onClick={() =>
                                validateResultMutation.mutate({
                                  resultId: res.resultId,
                                  action: 'ACCEPT',
                                  remarks: 'Validated by State Admin',
                                })
                              }
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Validate
                            </button>
                          )}

                          {res.status !== 'FORWARDED_TO_ORIGIN' && (
                            <button
                              onClick={() =>
                                forwardMutation.mutate({
                                  resultId: res.resultId,
                                  remarks: `Admin validated evidence forwarded to ${c.policeStation}`,
                                })
                              }
                              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" /> Forward to {c.policeStation}
                            </button>
                          )}

                          {res.status === 'FORWARDED_TO_ORIGIN' && (
                            <span className="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-black flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Forwarded to Station
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            {casesList.filter((c) => c.results && c.results.length > 0).length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No department evidence packages awaiting validation.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── ADMIN FIR REVIEW MODAL (READ-ONLY VIEW) ────────────────── */}
      {reviewingCase && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div
            className={`w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0f172a] border-white/10'
            }`}
          >
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-500" />
                  Review FIR Investigation Request
                </h3>
                <p className="text-xs text-slate-400 font-mono">
                  {reviewingCase.caseId} • Filed under FIR No: {reviewingCase.firNumber}
                </p>
              </div>
              <button
                onClick={() => setReviewingCase(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {/* Content (Read-only case view per Section 6) */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar text-xs">
              <div className="p-4 rounded-xl border border-white/6 bg-white/2 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <span className="text-slate-400 block">Origin Police Station</span>
                  <strong className="text-slate-100 text-sm">{reviewingCase.policeStation}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Investigating Officer</span>
                  <strong className="text-slate-100 text-sm">{reviewingCase.officerName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Officer Contact</span>
                  <strong className="text-slate-100 text-sm">{reviewingCase.contactNumber}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block">FIR Date</span>
                  <strong className="text-slate-100">
                    {new Date(reviewingCase.firDate).toLocaleDateString()}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block">Priority</span>
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-black border mt-0.5 ${
                      PRIORITY_BADGES[reviewingCase.priority]
                    }`}
                  >
                    {reviewingCase.priority}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Request Type</span>
                  <strong className="text-blue-400">{reviewingCase.requestType?.replace('_', ' ')}</strong>
                </div>
              </div>

              {/* Subject Information */}
              <div className="p-4 rounded-xl border border-white/6 bg-white/2">
                <h4 className="font-bold text-slate-200 mb-2">Subject Details</h4>
                {reviewingCase.requestType === 'STOLEN_VEHICLE' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-slate-400 block">Registration</span>
                      <strong className="text-blue-400 font-mono text-sm">
                        {reviewingCase.vehicleDetails?.registrationNumber || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Make & Model</span>
                      <strong className="text-slate-100">
                        {reviewingCase.vehicleDetails?.make} {reviewingCase.vehicleDetails?.model}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Color</span>
                      <strong className="text-slate-100">{reviewingCase.vehicleDetails?.color}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Vehicle Type</span>
                      <strong className="text-slate-100">{reviewingCase.vehicleDetails?.vehicleType}</strong>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <span className="text-slate-400 block">Full Name</span>
                      <strong className="text-purple-400 text-sm">
                        {reviewingCase.personDetails?.fullName || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Age & Gender</span>
                      <strong className="text-slate-100">
                        {reviewingCase.personDetails?.age} yrs / {reviewingCase.personDetails?.gender}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Clothing</span>
                      <strong className="text-slate-100">
                        {reviewingCase.personDetails?.clothingDescription || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Last Known Location</span>
                      <strong className="text-slate-100">
                        {reviewingCase.personDetails?.lastKnownLocation || 'N/A'}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* Case Description */}
              <div className="p-4 rounded-xl border border-white/6 bg-white/2">
                <span className="text-slate-400 block mb-1">FIR Requisition Synopsis</span>
                <p className="text-slate-200 leading-relaxed">{reviewingCase.caseDescription}</p>
              </div>

              {/* Review Decision Radios */}
              <div className="p-4 rounded-xl border border-white/10 bg-indigo-500/5 space-y-3">
                <span className="font-bold text-slate-200 block">Admin Action Decision</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewAction('APPROVE')}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      reviewAction === 'APPROVE'
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                        : 'border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve Case
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('REQUEST_CORRECTION')}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      reviewAction === 'REQUEST_CORRECTION'
                        ? 'bg-amber-600 text-white border-amber-500 shadow-md'
                        : 'border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" /> Request Correction
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewAction('REJECT')}
                    className={`p-2.5 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      reviewAction === 'REJECT'
                        ? 'bg-red-600 text-white border-red-500 shadow-md'
                        : 'border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <XCircle className="w-4 h-4" /> Reject Case
                  </button>
                </div>

                <div>
                  <label className="text-slate-400 block mb-1">
                    Review Remarks / Justification{' '}
                    {reviewAction !== 'APPROVE' && <span className="text-red-400">*</span>}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={
                      reviewAction === 'APPROVE'
                        ? 'Optional administrative remarks before activating in Master Watchlist...'
                        : 'Explain required corrections or rejection grounds clearly for the originating station...'
                    }
                    value={reviewRemarks}
                    onChange={(e) => setReviewRemarks(e.target.value)}
                    className={`w-full p-2.5 rounded-xl text-xs border focus:outline-hidden ${
                      isLight
                        ? 'bg-slate-50 border-slate-200 text-slate-900'
                        : 'bg-white/3 border-white/10 text-white'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setReviewingCase(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={reviewMutation.isLoading}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2 cursor-pointer"
              >
                {reviewMutation.isLoading ? 'Submitting...' : 'Confirm Review Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Distribution Modal */}
      {selectedWatchlistEntry && (
        <WatchlistDistributionModal
          isOpen={true}
          onClose={() => setSelectedWatchlistEntry(null)}
          caseItem={selectedWatchlistEntry}
          onDistributed={() => {
            setSelectedWatchlistEntry(null);
            refetchWatchlist();
            queryClient.invalidateQueries(['admin-assignments']);
          }}
        />
      )}

      {/* Evidence Viewer Modal */}
      {activeEvidenceViewer && (
        <EvidenceViewerModal
          isOpen={true}
          onClose={() => setActiveEvidenceViewer(null)}
          result={activeEvidenceViewer}
        />
      )}

      {/* Batch Master Watchlist Creation & Direct Distribution Modal */}
      <MasterWatchlistBatchModal
        isOpen={isBatchWatchlistModalOpen}
        onClose={() => setIsBatchWatchlistModalOpen(false)}
        onSuccess={() => {
          refetchWatchlist();
          refetchCases();
          refetchAnalytics();
        }}
      />
    </div>
  );
}
