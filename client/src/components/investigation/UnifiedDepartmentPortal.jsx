import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Shield, AlertTriangle, Search, Filter, RefreshCw, Eye, CheckCircle2,
  Clock, XCircle, ChevronRight, User, Car, Building2, MapPin, Calendar,
  ArrowUpRight, AlertCircle, FileCheck, Layers, Send, Archive, Lock, Video,
  Sparkles, ScanEye, ExternalLink, Download, ArrowRight, ShieldCheck, Check,
  Camera, PlusCircle
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import FirSubmissionModal from './FirSubmissionModal';
import InvestigationSearchConsole from './InvestigationSearchConsole';
import EvidenceSubmitModal from './EvidenceSubmitModal';
import EvidenceViewerModal from './EvidenceViewerModal';
import FirStatusTimelineModal, { STAGES } from './FirStatusTimelineModal';
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
  CORRECTION_REQUIRED: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-bold',
  WATCHLIST_ACTIVE: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-black',
  ASSIGNED_TO_DEPARTMENTS: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 font-bold',
  SEARCHING: 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-bold',
  MATCH_FOUND: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-black',
  RESULT_SUBMITTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30 font-bold',
  ADMIN_VALIDATION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FORWARDED_TO_ORIGIN: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 font-black animate-pulse',
  ACKNOWLEDGED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RESOLVED: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 font-black',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function UnifiedDepartmentPortal({ user }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  // Navigation tabs: 'inquiries', 'search', 'evidence', 'results', 'archive'
  const [activeTab, setActiveTab] = useState('inquiries');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCaseForSearch, setSelectedCaseForSearch] = useState(null);
  const [isEvidenceSubmitOpen, setIsEvidenceSubmitOpen] = useState(false);
  const [selectedCaseForEvidence, setSelectedCaseForEvidence] = useState(null);
  const [selectedDetectionForEvidence, setSelectedDetectionForEvidence] = useState(null);
  const [activeEvidenceViewer, setActiveEvidenceViewer] = useState(null);
  const [previewTimelineCase, setPreviewTimelineCase] = useState(null);

  // Filters for Inquiries
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Acknowledgment Modal state
  const [selectedCaseForAction, setSelectedCaseForAction] = useState(null);
  const [ackAction, setAckAction] = useState('CASE_RESOLVED'); // 'ACKNOWLEDGED' or 'CASE_RESOLVED'
  const [ackOfficerNotes, setAckOfficerNotes] = useState('');

  const agencyName =
    user?.policeStation || user?.department || 'Gujarat Law Enforcement Department';

  // 1. Fetch Department & Station Cases
  const { data: casesData, isLoading: casesLoading, refetch: refetchCases } = useQuery({
    queryKey: ['department-cases-unified', statusFilter, priorityFilter, searchQuery],
    queryFn: () =>
      investigationAPI
        .getCases({
          status: statusFilter,
          priority: priorityFilter,
          search: searchQuery,
          limit: 50,
        })
        .then((r) => r.data),
    staleTime: 15000,
  });

  const casesList = casesData?.data || [];

  // 2. Fetch Assignments
  const { data: assignmentsData, isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ['department-assignments-unified'],
    queryFn: () => investigationAPI.getAssignments({ limit: 50 }).then((r) => r.data),
    staleTime: 15000,
  });

  const assignmentsList = assignmentsData?.data || [];

  // Unified Department Operational Metrics
  const totalCases = casesList.length;
  const activeInquiries = casesList.filter(
    (c) =>
      c.status === 'WATCHLIST_ACTIVE' ||
      c.status === 'ASSIGNED_TO_DEPARTMENTS' ||
      c.status === 'SEARCHING' ||
      c.status === 'MATCH_FOUND'
  ).length;
  const matchesFound = casesList.filter((c) => c.status === 'MATCH_FOUND').length;
  const forwardedResults = casesList.filter(
    (c) => c.status === 'FORWARDED_TO_ORIGIN' || c.status === 'ACKNOWLEDGED'
  ).length;
  const resolvedCases = casesList.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;
  const pendingReview = casesList.filter(
    (c) => c.status === 'SUBMITTED' || c.status === 'ADMIN_REVIEW'
  ).length;

  // Evidence packages across all cases
  const evidencePackages = casesList.flatMap((c) =>
    (c.results || []).map((r) => ({ ...r, case: c }))
  );

  const handleLaunchSearch = (caseItem) => {
    setSelectedCaseForSearch(caseItem);
    setActiveTab('search');
  };

  const handleOpenEvidenceSubmit = (caseItem, detection = null) => {
    setSelectedCaseForEvidence(caseItem);
    setSelectedDetectionForEvidence(detection);
    setIsEvidenceSubmitOpen(true);
  };

  // Acknowledge / Resolve Mutation
  const ackMutation = useMutation({
    mutationFn: ({ resultId, action, remarks }) =>
      investigationAPI.acknowledgeResult(resultId, { action, remarks }),
    onSuccess: (res) => {
      toast.success(res.data?.message || 'Action recorded successfully.');
      setSelectedCaseForAction(null);
      setAckOfficerNotes('');
      refetchCases();
      queryClient.invalidateQueries(['investigation-analytics']);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to record action');
    },
  });

  const handleConfirmAck = () => {
    if (!selectedCaseForAction) return;
    const latestResult = selectedCaseForAction.results?.[0];
    const resultId = latestResult?.resultId || selectedCaseForAction.caseId;

    ackMutation.mutate({
      resultId,
      action: ackAction,
      remarks: ackOfficerNotes,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar space-y-6 animate-fadeIn">
      {/* ────────────────── UNIFIED DEPARTMENT HEADER ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-indigo-400" />
              {agencyName}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              OPERATIONAL INVESTIGATION UNIT
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Conduct AI CCTV/ANPR searches, register case FIR requisitions, and submit forensic evidence to State Admin.
          </p>
        </div>

        {/* Dual Primary Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3.5 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer ${
              isLight
                ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                : 'border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Camera className="w-4 h-4" />
            AI Camera Search
          </button>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs shadow-sm flex items-center gap-2 transition-colors cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            Create FIR Investigation Request
          </button>
        </div>
      </div>

      {/* ────────────────── UNIFIED METRICS ROW ────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'Total Department Cases',
            val: totalCases,
            color: isLight ? 'text-indigo-600' : 'text-indigo-400',
            onClick: () => {
              setActiveTab('inquiries');
              setStatusFilter('ALL');
            },
          },
          {
            label: 'Active Surveillance',
            val: activeInquiries,
            color: isLight ? 'text-blue-600' : 'text-blue-400',
            onClick: () => setActiveTab('inquiries'),
          },
          {
            label: 'AI Matches Found',
            val: matchesFound,
            color: isLight ? 'text-amber-600' : 'text-amber-400',
            onClick: () => {
              setActiveTab('inquiries');
              setStatusFilter('MATCH_FOUND');
            },
          },
          {
            label: 'Pending Admin Review',
            val: pendingReview,
            color: isLight ? 'text-purple-600' : 'text-purple-400',
            onClick: () => {
              setActiveTab('inquiries');
              setStatusFilter('SUBMITTED');
            },
          },
          {
            label: 'Forwarded Results',
            val: forwardedResults,
            color: isLight ? 'text-emerald-600' : 'text-emerald-400',
            onClick: () => setActiveTab('results'),
          },
          {
            label: 'Resolved & Closed',
            val: resolvedCases,
            color: isLight ? 'text-slate-600' : 'text-slate-400',
            onClick: () => setActiveTab('archive'),
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
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider line-clamp-1">
              {m.label}
            </div>
            <div className="flex items-baseline justify-between mt-1">
              <span className={`text-2xl font-bold font-mono tracking-tight ${m.color}`}>{m.val}</span>
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 hover:underline">
                View →
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* ────────────────── UNIFIED TAB NAVIGATION ────────────────── */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-white/10 pb-2 overflow-x-auto custom-scrollbar">
        {[
          { id: 'inquiries', label: 'Department Inquiries & Cases', icon: FileText, count: totalCases },
          { id: 'search', label: 'AI Surveillance Search', icon: ScanEye },
          { id: 'evidence', label: 'Evidence & Submissions', icon: Video, count: evidencePackages.length },
          { id: 'results', label: 'Results & Resolutions', icon: CheckCircle2, count: forwardedResults },
          { id: 'archive', label: 'Resolved Archive', icon: Archive, count: resolvedCases },
        ].map((tab) => {
          const IconComp = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg font-medium text-xs flex items-center gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <IconComp className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : isLight
                      ? 'bg-slate-200 text-slate-700'
                      : 'bg-white/10 text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ────────────────── TAB 1: INQUIRIES & CASE REGISTRY ────────────────── */}
      {activeTab === 'inquiries' && (
        <div className="space-y-4">
          {/* Official 8-Stage Legal Surveillance Workflow Guide for Submitting Departments */}
          <div
            className={`p-4 rounded-2xl border ${
              isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0b101b] border-white/8'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  Standardized 8-Stage Legal Surveillance Workflow (CCC Administrative Pipeline)
                </h3>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 hidden sm:inline">
                Gujarat Home Department · Command Protocol
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
              {STAGES.map((st) => {
                const Icon = st.icon;
                return (
                  <div
                    key={st.id}
                    className={`p-2.5 rounded-xl border flex flex-col justify-between ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/2 border-white/5'
                    }`}
                  >
                    <div>
                      <span className="text-[9px] font-mono text-slate-400 uppercase font-bold block">
                        Stage {st.id}
                      </span>
                      <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 mt-0.5 leading-tight">
                        {st.title.replace(/^\d+\.\s*/, '')}
                      </p>
                    </div>
                    <Icon className="w-3.5 h-3.5 mt-2 text-blue-500 opacity-75" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by case ID, registration plate, person name..."
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs outline-none border transition-all ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-black/30 border-white/10 text-white'
                  }`}
                />
              </div>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs outline-none border transition-all ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900'
                    : 'bg-black/30 border-white/10 text-white'
                }`}
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical Priority</option>
                <option value="HIGH">High Priority</option>
                <option value="MEDIUM">Standard Priority</option>
              </select>
            </div>

            <button
              onClick={() => refetchCases()}
              className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-slate-300 flex items-center gap-1 cursor-pointer self-start"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          {/* Cases Cards */}
          {casesLoading ? (
            <div className="py-12 text-center text-slate-400 text-xs animate-pulse">
              Loading department cases...
            </div>
          ) : casesList.length === 0 ? (
            <div className="py-12 text-center space-y-3 bg-black/10 rounded-2xl border border-white/5">
              <FileText className="w-10 h-10 text-slate-500 mx-auto" />
              <p className="text-sm font-bold text-slate-300">No cases found.</p>
              <p className="text-xs text-slate-500">
                You can create a new FIR investigation request using the button above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {casesList.map((c) => {
                const isVehicle = c.requestType === 'STOLEN_VEHICLE';
                const targetIdentifier = isVehicle
                  ? c.vehicleDetails?.registrationNumber || 'VEHICLE'
                  : c.personDetails?.fullName || 'PERSON';

                return (
                  <div
                    key={c.caseId}
                    className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 hover:border-indigo-500/40 hover:shadow-xl ${
                      isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-black text-sm text-indigo-400">
                          {c.caseId}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                              PRIORITY_BADGES[c.priority]
                            }`}
                          >
                            {c.priority}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              STATUS_BADGES[c.status] || 'bg-slate-500/15 text-slate-400'
                            }`}
                          >
                            {c.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>

                      {/* Target Info */}
                      <div className={`p-3.5 rounded-xl border space-y-1.5 ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'
                      }`}>
                        <div className="flex items-center justify-between text-xs">
                          <span className={`text-[10px] font-bold uppercase ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            {isVehicle ? 'Vehicle Registration' : 'Subject Name'}
                          </span>
                          <span className={`font-mono font-bold text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                            FIR #{c.firNumber}
                          </span>
                        </div>
                        <div className={`flex items-center gap-2 font-mono font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {isVehicle ? (
                            <>
                              <Car className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                              <span className={`tracking-wider ${isLight ? 'text-blue-700 font-bold' : 'text-cyan-300'}`}>{targetIdentifier}</span>
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                              <span className={isLight ? 'text-purple-700 font-bold' : 'text-purple-300'}>{targetIdentifier}</span>
                            </>
                          )}
                        </div>
                        <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                          {isVehicle
                            ? `${c.vehicleDetails?.make || ''} ${c.vehicleDetails?.model || ''} • ${c.vehicleDetails?.color || ''}`
                            : `Age: ${c.personDetails?.age || 'N/A'}, Gender: ${c.personDetails?.gender || 'N/A'}`}
                        </p>
                      </div>

                      {/* Station & Description */}
                      <div className={`space-y-1 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <div className="flex items-center gap-1 text-[11px]">
                          <Building2 className={`w-3.5 h-3.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
                          <span>Origin: </span>
                          <strong className={isLight ? 'text-slate-800' : 'text-slate-300'}>{c.policeStation}</strong>
                        </div>
                        <p className={`text-[11px] line-clamp-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                          {c.caseDescription}
                        </p>
                      </div>
                    </div>

                    {/* Actions Row */}
                    <div className={`pt-3 border-t flex items-center justify-between gap-2 ${
                      isLight ? 'border-slate-200' : 'border-white/10'
                    }`}>
                      <button
                        type="button"
                        onClick={() => setPreviewTimelineCase(c)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isLight
                            ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                            : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
                        }`}
                        title="Preview Case Docket & Status Timeline"
                      >
                        <Clock className="w-3.5 h-3.5 text-blue-500" />
                        <span>Timeline</span>
                      </button>

                      <button
                        onClick={() => handleLaunchSearch(c)}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isLight
                            ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                            : 'bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border-blue-500/30'
                        }`}
                      >
                        <ScanEye className="w-3.5 h-3.5" />
                        Scan
                      </button>

                      <button
                        onClick={() => handleOpenEvidenceSubmit(c)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isLight
                            ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                            : 'bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border-indigo-500/30'
                        }`}
                        title="Submit Evidence to Admin"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Evidence
                      </button>

                      {c.results && c.results.length > 0 && (
                        <button
                          onClick={() => setActiveEvidenceViewer(c.results[0])}
                          className={`p-2 rounded-xl border transition-all cursor-pointer ${
                            isLight
                              ? 'border-slate-200 hover:bg-slate-100 text-slate-700'
                              : 'border-white/10 hover:bg-white/10 text-slate-300'
                          }`}
                          title="View Evidence Footage"
                        >
                          <Video className="w-4 h-4 text-emerald-500" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 2: AI SURVEILLANCE SEARCH CONSOLE ────────────────── */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-white border-slate-200 shadow-sm text-slate-900'
              : 'bg-slate-900/80 border-slate-800 text-white'
          }`}>
            <div>
              <h2 className={`text-sm font-bold tracking-wide uppercase flex items-center gap-2 ${
                isLight ? 'text-slate-900' : 'text-cyan-300'
              }`}>
                <Camera className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
                Optical CCTV & Automated ANPR Surveillance Console
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Query city entry/exit gates, intersection cameras, and highway toll feeds against active case targets.
              </p>
            </div>

            {selectedCaseForSearch && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold ${
                isLight
                  ? 'bg-blue-50 border border-blue-200 text-blue-800'
                  : 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
              }`}>
                <span>Active Target: {selectedCaseForSearch.caseId}</span>
                <button
                  onClick={() => setSelectedCaseForSearch(null)}
                  className="hover:opacity-75 cursor-pointer ml-1"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <InvestigationSearchConsole
            firCase={selectedCaseForSearch}
            selectedCase={selectedCaseForSearch}
            casesList={casesList}
            onSelectCaseForSearch={(c) => setSelectedCaseForSearch(c)}
            onSubmitEvidence={(caseItem, detection) => handleOpenEvidenceSubmit(caseItem, detection)}
          />
        </div>
      )}

      {/* ────────────────── TAB 3: EVIDENCE & SUBMISSIONS ────────────────── */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <Video className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                Forensic Evidence Packages
              </h2>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Evidence clips and ANPR snapshot packages prepared and submitted to State Admin for validation.
              </p>
            </div>

            <button
              onClick={() => {
                if (casesList.length > 0) {
                  handleOpenEvidenceSubmit(casesList[0]);
                } else {
                  toast.error('No active cases available to attach evidence.');
                }
              }}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Submit Evidence Package
            </button>
          </div>

          {evidencePackages.length === 0 ? (
            <div className={`py-12 text-center space-y-2 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/10 border-white/5'
            }`}>
              <Video className="w-10 h-10 text-slate-400 mx-auto" />
              <p className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>No evidence packages submitted yet.</p>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Run an AI Camera Search and click &ldquo;Submit Evidence to Admin&rdquo; when positive candidates are detected.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {evidencePackages.map((pkg, idx) => (
                <div
                  key={pkg.resultId || idx}
                  className={`p-5 rounded-2xl border transition-all space-y-4 ${
                    isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-mono font-bold text-sm ${isLight ? 'text-blue-700' : 'text-cyan-400'}`}>
                      {pkg.resultId || `PKG-${idx + 1}`}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase border ${
                        pkg.status === 'FORWARDED_TO_ORIGIN'
                          ? isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : pkg.status === 'VALIDATED'
                          ? isLight ? 'bg-blue-50 text-blue-800 border-blue-200' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                          : isLight ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      }`}
                    >
                      {pkg.status?.replace(/_/g, ' ') || 'SUBMITTED'}
                    </span>
                  </div>

                  <div className={`space-y-1 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                    <div>
                      Case Ref: <strong className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{pkg.caseId}</strong>
                    </div>
                    <div>
                      Department: <strong className={isLight ? 'text-slate-800' : 'text-slate-300'}>{pkg.departmentName}</strong>
                    </div>
                    <div>
                      Timestamp: {new Date(pkg.createdAt || Date.now()).toLocaleString()}
                    </div>
                    <p className={`text-[11px] line-clamp-2 mt-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                      {pkg.officerSummary || 'Surveillance match validated with video clip & ANPR frame.'}
                    </p>
                  </div>

                  <div className={`pt-3 border-t flex items-center justify-between ${
                    isLight ? 'border-slate-200' : 'border-white/10'
                  }`}>
                    <button
                      onClick={() => setActiveEvidenceViewer(pkg)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                        isLight
                          ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                          : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/30'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" /> Inspect Evidence & Video Clip
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 4: RESULTS RECEIVED & RESOLUTIONS ────────────────── */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          <div>
            <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Forwarded Forensic Evidence & Case Resolutions
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Validated evidence forwarded from Admin. Review CCTV footage and officially mark cases resolved.
            </p>
          </div>

          {casesList.filter(
            (c) =>
              c.status === 'FORWARDED_TO_ORIGIN' ||
              c.status === 'ACKNOWLEDGED' ||
              (c.results && c.results.length > 0)
          ).length === 0 ? (
            <div className={`py-12 text-center space-y-2 rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/10 border-white/5'
            }`}>
              <CheckCircle2 className="w-10 h-10 text-slate-400 mx-auto" />
              <p className={`text-sm font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>No forwarded results pending.</p>
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                Forwarded evidence packages from Admin will appear here for acknowledgment and case closure.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {casesList
                .filter(
                  (c) =>
                    c.status === 'FORWARDED_TO_ORIGIN' ||
                    c.status === 'ACKNOWLEDGED' ||
                    (c.results && c.results.length > 0)
                )
                .map((c) => {
                  const latestResult = c.results?.[0];
                  return (
                    <div
                      key={c.caseId}
                      className={`p-6 rounded-2xl border transition-all space-y-4 ${
                        isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0b101b] border-emerald-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-bold text-base ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                            {c.caseId}
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isLight
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          }`}>
                            EVIDENCE FORWARDED BY ADMIN
                          </span>
                        </div>

                        <span
                          className={`px-2.5 py-0.5 rounded text-xs font-black border ${
                            STATUS_BADGES[c.status] || ''
                          }`}
                        >
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className={`grid grid-cols-1 md:grid-cols-3 gap-3 text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                        <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
                          <span className={`text-[10px] font-bold uppercase block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                            Target Entity
                          </span>
                          <strong className={`text-sm font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                            {c.requestType === 'STOLEN_VEHICLE'
                              ? c.vehicleDetails?.registrationNumber
                              : c.personDetails?.fullName}
                          </strong>
                        </div>

                        <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
                          <span className={`text-[10px] font-bold uppercase block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                            Originating Station
                          </span>
                          <strong className={isLight ? 'text-slate-800' : 'text-slate-200'}>{c.policeStation}</strong>
                        </div>

                        <div className={`p-3 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/20 border-white/5'}`}>
                          <span className={`text-[10px] font-bold uppercase block ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                            Evidence Files
                          </span>
                          <strong className={isLight ? 'text-blue-700' : 'text-cyan-300'}>
                            {latestResult?.evidenceFiles?.length || 1} File(s) (1080p Clip + Frame)
                          </strong>
                        </div>
                      </div>

                      <div className={`pt-3 border-t flex items-center justify-between gap-3 flex-wrap ${
                        isLight ? 'border-slate-200' : 'border-white/10'
                      }`}>
                        {latestResult && (
                          <button
                            onClick={() => setActiveEvidenceViewer(latestResult)}
                            className={`px-4 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 cursor-pointer ${
                              isLight
                                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border-cyan-500/30'
                            }`}
                          >
                            <Video className="w-3.5 h-3.5" /> View Forwarded CCTV Clip & Frame
                          </button>
                        )}

                        {c.status !== 'RESOLVED' && c.status !== 'CLOSED' && (
                          <button
                            onClick={() => {
                              setSelectedCaseForAction(c);
                              setAckAction('CASE_RESOLVED');
                            }}
                            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Mark Case Resolved
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 5: RESOLVED ARCHIVE ────────────────── */}
      {activeTab === 'archive' && (
        <div className="space-y-4">
          <div>
            <h2 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Archive className="w-5 h-5 text-slate-400" />
              Resolved & Closed Case Archive
            </h2>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Completed investigation records officially closed after successful recovery or detection.
            </p>
          </div>

          {casesList.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length === 0 ? (
            <div className={`py-12 text-center text-xs rounded-2xl border ${
              isLight ? 'bg-slate-50 border-slate-200 text-slate-500' : 'bg-black/10 border-white/5 text-slate-500'
            }`}>
              No archived cases yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {casesList
                .filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED')
                .map((c) => (
                  <div
                    key={c.caseId}
                    className={`p-5 rounded-2xl border space-y-3 ${
                      isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'border-white/5 bg-black/20 text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>{c.caseId}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        isLight ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        RESOLVED
                      </span>
                    </div>
                    <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>{c.caseDescription}</p>
                    <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                      Closed on: {new Date(c.updatedAt || Date.now()).toLocaleDateString()}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── MODALS ────────────────── */}
      {/* 1. FIR Creation Modal */}
      <FirSubmissionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={() => {
          refetchCases();
          queryClient.invalidateQueries(['investigation-analytics']);
        }}
      />

      {/* 2. Evidence Submission Modal */}
      <EvidenceSubmitModal
        isOpen={isEvidenceSubmitOpen}
        onClose={() => {
          setIsEvidenceSubmitOpen(false);
          setSelectedCaseForEvidence(null);
          setSelectedDetectionForEvidence(null);
        }}
        firCase={selectedCaseForEvidence}
        caseItem={selectedCaseForEvidence}
        detectionData={selectedDetectionForEvidence}
        candidateDetection={selectedDetectionForEvidence}
        onSubmitted={() => {
          refetchCases();
          queryClient.invalidateQueries(['investigation-analytics']);
        }}
      />

      {/* 3. Evidence Viewer Modal */}
      {activeEvidenceViewer && (
        <EvidenceViewerModal
          isOpen={true}
          onClose={() => setActiveEvidenceViewer(null)}
          result={activeEvidenceViewer}
        />
      )}

      {/* 4. Mark Resolved / Acknowledgment Modal */}
      {selectedCaseForAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-4 ${
              isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#0f172a] border-white/10 text-white'
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="font-bold text-sm">Officially Resolve Case</h3>
              </div>
              <button
                onClick={() => setSelectedCaseForAction(null)}
                className={`p-1 rounded-lg ${isLight ? 'hover:bg-slate-100 text-slate-500' : 'text-slate-400 hover:text-white'}`}
              >
                ✕
              </button>
            </div>

            <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              You are closing case <strong className={isLight ? 'text-slate-900' : 'text-white'}>{selectedCaseForAction.caseId}</strong> based on forwarded
              CCTV and ANPR forensic evidence.
            </p>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Officer Closing Remarks
              </label>
              <textarea
                rows={3}
                value={ackOfficerNotes}
                onChange={(e) => setAckOfficerNotes(e.target.value)}
                placeholder="Enter case resolution remarks (e.g., Vehicle intercepted and recovered at Gorwa junction; suspect detained)..."
                className={`w-full p-3 rounded-xl text-xs outline-none border transition-all ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    : 'bg-black/30 border-white/10 text-white focus:border-emerald-400'
                }`}
              />
            </div>

            <div className={`flex items-center justify-end gap-2 pt-3 border-t ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}>
              <button
                onClick={() => setSelectedCaseForAction(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-slate-400 hover:bg-white/5'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAck}
                disabled={ackMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Confirm Case Resolution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── DYNAMIC FIR STATUS TIMELINE & CASE PREVIEW ────────────────── */}
      <FirStatusTimelineModal
        caseItem={previewTimelineCase}
        isOpen={Boolean(previewTimelineCase)}
        onClose={() => setPreviewTimelineCase(null)}
      />
    </div>
  );
}
