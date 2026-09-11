import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  FileText,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Camera,
  Car,
  User,
  Send,
  Video,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  MapPin,
  Calendar,
  MessageSquare,
  Archive,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import FirSubmissionModal from './FirSubmissionModal';
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
  CORRECTION_REQUIRED: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-bold',
  WATCHLIST_ACTIVE: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-black',
  ASSIGNED_TO_DEPARTMENTS: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
  SEARCHING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  MATCH_FOUND: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-black',
  RESULT_SUBMITTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30 font-bold',
  ADMIN_VALIDATION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FORWARDED_TO_ORIGIN: 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 font-black animate-pulse',
  ACKNOWLEDGED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  RESOLVED: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 font-black',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function PoliceStationPortal({ user }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  // Sub-tabs: 'my_firs', 'active', 'results', 'resolved'
  const [activeTab, setActiveTab] = useState('my_firs');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedCaseForAction, setSelectedCaseForAction] = useState(null);
  const [ackAction, setAckAction] = useState('ACKNOWLEDGED'); // 'ACKNOWLEDGED' or 'CASE_RESOLVED'
  const [ackOfficerNotes, setAckOfficerNotes] = useState('');
  const [activeEvidenceViewer, setActiveEvidenceViewer] = useState(null);

  // Filters for My FIRs
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const stationName = user?.policeStation || user?.department || 'Sayajigunj Police Station';

  // 1. Fetch Station's FIR Cases
  const { data: casesData, isLoading: casesLoading, refetch: refetchCases } = useQuery({
    queryKey: ['police-station-cases', statusFilter, priorityFilter, searchQuery],
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

  // Metrics for Police Station
  const myTotal = casesList.length;
  const pendingAdmin = casesList.filter((c) => c.status === 'SUBMITTED' || c.status === 'ADMIN_REVIEW').length;
  const activeInquiries = casesList.filter(
    (c) =>
      c.status === 'WATCHLIST_ACTIVE' ||
      c.status === 'ASSIGNED_TO_DEPARTMENTS' ||
      c.status === 'SEARCHING' ||
      c.status === 'MATCH_FOUND' ||
      c.status === 'RESULT_SUBMITTED'
  ).length;
  const resultsReceived = casesList.filter(
    (c) => c.status === 'FORWARDED_TO_ORIGIN' || c.status === 'ACKNOWLEDGED' || (c.results && c.results.length > 0)
  ).length;
  const correctionsRequested = casesList.filter((c) => c.status === 'CORRECTION_REQUIRED').length;
  const resolvedCases = casesList.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;

  // Station Acknowledgment Mutation
  const acknowledgeMutation = useMutation({
    mutationFn: ({ caseId, actionTaken, officerNotes }) =>
      investigationAPI.acknowledgeResult(caseId, { actionTaken, officerNotes }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['police-station-cases']);
      toast.success(res.message || 'Result acknowledged!');
      setSelectedCaseForAction(null);
      setAckOfficerNotes('');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Acknowledgment failed');
    },
  });

  const handleOpenAcknowledge = (c, defaultAction = 'ACKNOWLEDGED') => {
    setSelectedCaseForAction(c);
    setAckAction(defaultAction);
    setAckOfficerNotes('');
  };

  const handleConfirmAcknowledge = () => {
    if (!selectedCaseForAction) return;
    acknowledgeMutation.mutate({
      caseId: selectedCaseForAction.caseId,
      actionTaken: ackAction,
      officerNotes: ackOfficerNotes,
    });
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar space-y-6 animate-fadeIn">
      {/* ────────────────── POLICE STATION HEADER BANNER ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <Shield className="w-6 h-6 text-blue-500" />
              Police Station FIR Investigation Portal
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
              ORIGINATING JURISDICTION
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            <strong className="text-slate-200">{stationName}</strong> • File FIR requisitions, monitor statewide CCTV surveillance, and acknowledge matched evidence.
          </p>
        </div>

        {/* Top-Right Action: Create FIR Investigation Request (Police Station Only) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" /> Create FIR Investigation Request
          </button>
        </div>
      </div>

      {/* ────────────────── STATION OPERATIONAL METRICS ROW ────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'My Submitted FIRs',
            val: myTotal,
            color: 'text-blue-400',
            border: 'border-blue-500/30',
            onClick: () => setActiveTab('my_firs'),
          },
          {
            label: 'Pending Admin Approval',
            val: pendingAdmin,
            color: 'text-purple-400',
            border: 'border-purple-500/30',
            onClick: () => {
              setActiveTab('my_firs');
              setStatusFilter('SUBMITTED');
            },
          },
          {
            label: 'Active Inquiries',
            val: activeInquiries,
            color: 'text-cyan-400',
            border: 'border-cyan-500/30',
            onClick: () => setActiveTab('active'),
          },
          {
            label: 'Results Received',
            val: resultsReceived,
            color: 'text-emerald-400',
            border: 'border-emerald-500/30',
            badge: resultsReceived > 0 ? `${resultsReceived} Actionable` : null,
            onClick: () => setActiveTab('results'),
          },
          {
            label: 'Corrections Required',
            val: correctionsRequested,
            color: 'text-amber-400',
            border: 'border-amber-500/30',
            badge: correctionsRequested > 0 ? 'Action Needed' : null,
            onClick: () => {
              setActiveTab('my_firs');
              setStatusFilter('CORRECTION_REQUIRED');
            },
          },
          {
            label: 'Resolved & Recovered',
            val: resolvedCases,
            color: 'text-emerald-300',
            border: 'border-emerald-500/30',
            onClick: () => setActiveTab('resolved'),
          },
        ].map((m, idx) => (
          <div
            key={idx}
            onClick={m.onClick}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer hover:border-white/30 hover:scale-[1.02] ${
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0b101b] border-white/8 shadow-md'
            } ${m.border}`}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase text-slate-400 block truncate">
                {m.label}
              </span>
              {m.badge && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-amber-500/20 text-amber-400">
                  {m.badge}
                </span>
              )}
            </div>
            <span className={`text-xl lg:text-2xl font-black font-mono tracking-tight block mt-1 ${m.color}`}>
              {m.val}
            </span>
          </div>
        ))}
      </div>

      {/* ────────────────── SUB-NAVIGATION TABS ────────────────── */}
      <div className="flex items-center gap-2 border-b border-white/8 pb-2 overflow-x-auto custom-scrollbar">
        {[
          { id: 'my_firs', label: 'My FIR Requests', icon: FileText, count: myTotal },
          { id: 'active', label: 'Active Surveillance Inquiries', icon: Search, count: activeInquiries },
          {
            id: 'results',
            label: 'Results Received from Admin',
            icon: CheckCircle2,
            badge: resultsReceived > 0 ? resultsReceived : null,
          },
          { id: 'resolved', label: 'Resolved Cases Archive', icon: Archive, count: resolvedCases },
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
                    : 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.badge && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-400 text-slate-950 ml-0.5">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ────────────────── TAB 1: MY FIR REQUESTS ────────────────── */}
      {activeTab === 'my_firs' && (
        <div className="space-y-4">
          {/* Filters */}
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
                  placeholder="Search by Case ID, FIR number, plate, person..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                    isLight
                      ? 'bg-slate-50 border-slate-200 text-slate-900'
                      : 'bg-white/3 border-white/10 text-white'
                  }`}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121826] border-white/10 text-slate-200'
                }`}
              >
                <option value="ALL">All Statuses</option>
                <option value="SUBMITTED">Submitted (Pending Admin)</option>
                <option value="CORRECTION_REQUIRED">Correction Required</option>
                <option value="WATCHLIST_ACTIVE">Master Watchlist Active</option>
                <option value="FORWARDED_TO_ORIGIN">Results Received</option>
                <option value="RESOLVED">Resolved / Closed</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className={`px-3 py-2 rounded-xl text-xs border focus:outline-hidden ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-[#121826] border-white/10 text-slate-200'
                }`}
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
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
                <p className="text-xs mt-3">Loading station FIR cases...</p>
              </div>
            ) : casesList.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                No FIR cases filed by {stationName} yet. Click "Create FIR Investigation Request" to file your first case.
              </div>
            ) : (
              casesList.map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border transition-all ${
                    c.status === 'FORWARDED_TO_ORIGIN'
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : c.status === 'CORRECTION_REQUIRED'
                      ? 'border-amber-500/40 bg-amber-500/5'
                      : isLight
                      ? 'bg-white border-slate-200'
                      : 'bg-[#0b101b] border-white/8'
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
                            STATUS_BADGES[c.status] || 'bg-slate-500/15 text-slate-400'
                          }`}
                        >
                          {c.status?.replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1 text-xs text-slate-400">
                        <div>
                          FIR Number: <strong className="text-slate-200 font-mono">{c.firNumber}</strong>
                        </div>
                        <div>
                          Investigating Officer: <strong className="text-slate-200">{c.officerName}</strong>
                        </div>
                        <div>
                          Registered: <strong className="text-slate-200">{new Date(c.firDate).toLocaleDateString()}</strong>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 line-clamp-1">
                        <span className="text-slate-500">Subject: </span>
                        <strong>
                          {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName || 'N/A'}
                        </strong>{' '}
                        • {c.caseDescription}
                      </p>

                      {c.status === 'CORRECTION_REQUIRED' && (
                        <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                          ⚠️ <strong>Admin Requested Correction:</strong> Please review admin remarks and update documentation.
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                      {c.status === 'FORWARDED_TO_ORIGIN' && (
                        <button
                          onClick={() => handleOpenAcknowledge(c, 'CASE_RESOLVED')}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Case Resolved
                        </button>
                      )}

                      <button
                        onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                        className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" /> View Case Details
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 2: ACTIVE INQUIRIES ────────────────── */}
      {activeTab === 'active' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Active Surveillance Inquiries
            </h2>
            <p className="text-xs text-slate-400">
              Approved cases currently under active optical and ANPR scan across Gujarat camera infrastructure.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {casesList
              .filter(
                (c) =>
                  c.status === 'WATCHLIST_ACTIVE' ||
                  c.status === 'ASSIGNED_TO_DEPARTMENTS' ||
                  c.status === 'SEARCHING' ||
                  c.status === 'MATCH_FOUND' ||
                  c.status === 'RESULT_SUBMITTED'
              )
              .map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border transition-all flex flex-col justify-between space-y-4 ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono font-black text-blue-400">{c.caseId}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                          PRIORITY_BADGES[c.priority]
                        }`}
                      >
                        {c.priority}
                      </span>
                    </div>

                    <h4 className="text-base font-black text-slate-200">
                      {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName}
                    </h4>

                    <p className="text-xs text-slate-400">
                      FIR: <span className="font-mono text-slate-200">{c.firNumber}</span> • Officer:{' '}
                      <span className="text-slate-200">{c.officerName}</span>
                    </p>

                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                        STATUS_BADGES[c.status]
                      }`}
                    >
                      {c.status?.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="pt-3 border-t border-white/6 flex items-center justify-between">
                    <span className="text-xs text-slate-400">
                      SLA: <strong>{c.slaStatus?.text || 'Tracking'}</strong>
                    </span>
                    <button
                      onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                      className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
                    >
                      View Live Trail <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: RESULTS RECEIVED FROM ADMIN ────────────────── */}
      {activeTab === 'results' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Investigation Results Forwarded from State Admin
            </h2>
            <p className="text-xs text-slate-400">
              Forensic evidence and confirmed CCTV sightings forwarded back to {stationName} for action and case resolution.
            </p>
          </div>

          <div className="space-y-4">
            {casesList
              .filter(
                (c) =>
                  c.status === 'FORWARDED_TO_ORIGIN' ||
                  c.status === 'ACKNOWLEDGED' ||
                  (c.results && c.results.length > 0)
              )
              .map((c) => (
                <div
                  key={c.caseId}
                  className={`p-6 rounded-2xl border ${
                    c.status === 'FORWARDED_TO_ORIGIN'
                      ? 'border-emerald-500/50 bg-emerald-500/5 shadow-lg shadow-emerald-500/5'
                      : isLight
                      ? 'bg-white border-slate-200'
                      : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-base text-emerald-400">
                          {c.caseId}
                        </span>
                        <span className="text-xs text-slate-300 font-bold">
                          FIR: {c.firNumber}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Subject:{' '}
                        <strong className="text-slate-100">
                          {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName}
                        </strong>{' '}
                        ({c.vehicleDetails?.make} {c.vehicleDetails?.model})
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleOpenAcknowledge(c, 'CASE_RESOLVED')}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <CheckCircle2 className="w-4 h-4" /> Mark Case Resolved
                      </button>
                      <button
                        onClick={() => handleOpenAcknowledge(c, 'ACKNOWLEDGED')}
                        className="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" /> Add Remarks
                      </button>
                    </div>
                  </div>

                  {/* Evidence Packages List */}
                  {c.results && c.results.length > 0 && (
                    <div className="space-y-3 mt-4 pt-4 border-t border-white/8">
                      <h4 className="text-xs font-mono font-bold uppercase text-slate-400">
                        Attached Forensic Evidence Packages:
                      </h4>
                      {c.results.map((res) => (
                        <div
                          key={res.resultId}
                          className="p-4 rounded-xl border border-white/6 bg-white/2 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-xs text-teal-400">
                                {res.resultId}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/15 text-purple-400 border border-purple-500/30">
                                {res.aiMatchConfidence}% AI Match
                              </span>
                              <span className="text-xs text-slate-400">
                                Detected by: <strong className="text-slate-200">{res.departmentName}</strong>
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                              Camera: <strong className="text-slate-100">{res.cameraName}</strong> ({res.locationName})
                              • Timestamp: {new Date(res.detectedAt).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 italic">
                              "{res.officerRemarks}"
                            </p>
                          </div>

                          <button
                            onClick={() => setActiveEvidenceViewer(res)}
                            className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 self-end sm:self-center"
                          >
                            <Eye className="w-3.5 h-3.5" /> View CCTV Clip
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            {casesList.filter((c) => c.status === 'FORWARDED_TO_ORIGIN').length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No active evidence packages awaiting acknowledgment at this station.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 4: RESOLVED ARCHIVE ────────────────── */}
      {activeTab === 'resolved' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Archive className="w-5 h-5 text-emerald-400" />
              Resolved & Recovered Cases Archive
            </h2>
            <p className="text-xs text-slate-400">
              Completed investigation requisitions from {stationName} where stolen property was recovered or missing persons located.
            </p>
          </div>

          <div className="space-y-3">
            {casesList
              .filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED')
              .map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-emerald-400">{c.caseId}</span>
                        <span className="text-xs text-slate-300 font-bold">FIR: {c.firNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          RESOLVED
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Subject: {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName} • Officer: {c.officerName}
                      </p>
                    </div>

                    <button
                      onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold"
                    >
                      View Audit Trail
                    </button>
                  </div>
                </div>
              ))}
            {casesList.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No resolved cases in archive.
              </div>
            )}
          </div>
        </div>
      )}

      {/* FIR Creation Modal (Multi-step with mandatory review preview) */}
      <FirSubmissionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCaseCreated={(newCase) => {
          refetchCases();
          navigate(`/investigation/cases/${newCase.caseId}`);
        }}
      />

      {/* Evidence Viewer Modal */}
      {activeEvidenceViewer && (
        <EvidenceViewerModal
          isOpen={true}
          onClose={() => setActiveEvidenceViewer(null)}
          result={activeEvidenceViewer}
        />
      )}

      {/* Police Station Acknowledgment / Resolution Dialog */}
      {selectedCaseForAction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div
            className={`w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4 ${
              isLight ? 'bg-white border-slate-200' : 'bg-[#0f172a] border-white/10'
            }`}
          >
            <h3 className="text-base font-black flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Acknowledge Investigation Findings
            </h3>
            <p className="text-xs text-slate-400">
              Case ID: <strong className="font-mono text-slate-200">{selectedCaseForAction.caseId}</strong> (FIR: {selectedCaseForAction.firNumber})
            </p>

            <div className="space-y-2">
              <label className="text-xs text-slate-300 font-bold block">Case Action Decision</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAckAction('CASE_RESOLVED')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    ackAction === 'CASE_RESOLVED'
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                      : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Resolved
                </button>
                <button
                  type="button"
                  onClick={() => setAckAction('ACKNOWLEDGED')}
                  className={`p-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    ackAction === 'ACKNOWLEDGED'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <MessageSquare className="w-4 h-4" /> Add Remarks Only
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-300 font-bold block mb-1">
                Station Officer Remarks
              </label>
              <textarea
                rows={3}
                placeholder="Enter recovery details, suspect custody info, or follow-up notes..."
                value={ackOfficerNotes}
                onChange={(e) => setAckOfficerNotes(e.target.value)}
                className={`w-full p-2.5 rounded-xl text-xs border focus:outline-hidden ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-900'
                    : 'bg-white/3 border-white/10 text-white'
                }`}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-white/8">
              <button
                type="button"
                onClick={() => setSelectedCaseForAction(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAcknowledge}
                disabled={acknowledgeMutation.isLoading}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                {acknowledgeMutation.isLoading ? 'Saving...' : 'Confirm Station Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
