import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Search,
  Camera,
  Video,
  Car,
  User,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Eye,
  Building2,
  Layers,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Filter,
  FileText,
  MapPin,
  Calendar,
} from 'lucide-react';
import { investigationAPI } from '../../api';
import { useThemeStore } from '../../store/themeStore';
import InvestigationSearchConsole from './InvestigationSearchConsole';
import EvidenceSubmitModal from './EvidenceSubmitModal';
import EvidenceViewerModal from './EvidenceViewerModal';
import toast from 'react-hot-toast';

const PRIORITY_BADGES = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30 font-black',
  HIGH: 'bg-amber-500/15 text-amber-400 border-amber-500/30 font-black',
  MEDIUM: 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-semibold',
  LOW: 'bg-slate-500/15 text-slate-400 border-slate-500/30 font-semibold',
};

const STATUS_BADGES = {
  SUBMITTED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  WATCHLIST_ACTIVE: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30 font-black',
  ASSIGNED_TO_DEPARTMENTS: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 font-bold',
  SEARCHING: 'bg-blue-500/15 text-blue-400 border-blue-500/30 font-bold',
  MATCH_FOUND: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse font-black',
  RESULT_SUBMITTED: 'bg-teal-500/15 text-teal-400 border-teal-500/30 font-bold',
  ADMIN_VALIDATION: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  FORWARDED_TO_ORIGIN: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-black',
  RESOLVED: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/40 font-black',
  CLOSED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

export default function DepartmentInvestigationPortal({ user }) {
  const navigate = useNavigate();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  // Sub-tabs: 'assignments', 'search', 'evidence', 'history'
  const [activeTab, setActiveTab] = useState('assignments');
  const [selectedCaseForSearch, setSelectedCaseForSearch] = useState(null);
  const [isEvidenceSubmitOpen, setIsEvidenceSubmitOpen] = useState(false);
  const [selectedCaseForEvidence, setSelectedCaseForEvidence] = useState(null);
  const [selectedDetectionForEvidence, setSelectedDetectionForEvidence] = useState(null);
  const [activeEvidenceViewer, setActiveEvidenceViewer] = useState(null);

  const departmentName = user?.department || 'Gujarat Traffic Police';

  // 1. Fetch Department Assignments
  const { data: assignmentsData, isLoading: assignmentsLoading, refetch: refetchAssignments } = useQuery({
    queryKey: ['department-assignments'],
    queryFn: () => investigationAPI.getAssignments({ limit: 50 }).then((r) => r.data),
    staleTime: 15000,
  });

  const assignmentsList = assignmentsData?.data || [];

  // 2. Fetch Cases Assigned to this Department
  const { data: casesData, isLoading: casesLoading, refetch: refetchCases } = useQuery({
    queryKey: ['department-cases'],
    queryFn: () => investigationAPI.getCases({ limit: 50 }).then((r) => r.data),
    staleTime: 15000,
  });

  const assignedCases = casesData?.data || [];

  // Department KPIs
  const newAssignmentsCount = assignmentsList.filter((a) => a.status === 'ASSIGNED' || !a.searchCount).length;
  const activeInquiriesCount = assignmentsList.length;
  const highPriorityCount = assignmentsList.filter((a) => a.priority === 'CRITICAL' || a.priority === 'HIGH').length;
  const matchesFoundCount = assignmentsList.reduce((acc, a) => acc + (a.matchCount || 0), 0);
  const evidencePackages = assignedCases.flatMap((c) => c.results || []);
  const evidenceAwaitingSubCount = assignmentsList.filter((a) => a.matchCount > 0).length;
  const completedCount = assignedCases.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length;

  const handleLaunchSearch = (caseItem) => {
    setSelectedCaseForSearch(caseItem);
    setActiveTab('search');
  };

  const handleOpenEvidenceSubmit = (caseItem, detection = null) => {
    setSelectedCaseForEvidence(caseItem);
    setSelectedDetectionForEvidence(detection);
    setIsEvidenceSubmitOpen(true);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar space-y-6 animate-fadeIn">
      {/* ────────────────── DEPARTMENT COMMAND HEADER ────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-xl lg:text-2xl font-black tracking-tight flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-indigo-500" />
              Department Investigation Command Console
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              {departmentName.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Assigned surveillance cases from State Home Department • Execute AI & ANPR CCTV scans and prepare forensic evidence packages.
          </p>
        </div>

        {/* Action: Quick Search Console Launcher (NO CREATE FIR BUTTON) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setActiveTab('search')}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all transform hover:-translate-y-0.5 cursor-pointer"
          >
            <Search className="w-4 h-4" /> Open AI Search Console
          </button>
        </div>
      </div>

      {/* ────────────────── DEPARTMENT OPERATIONAL METRICS ROW ────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          {
            label: 'New Assignments',
            val: newAssignmentsCount,
            color: 'text-blue-400',
            border: 'border-blue-500/30',
            onClick: () => setActiveTab('assignments'),
          },
          {
            label: 'Active Investigations',
            val: activeInquiriesCount,
            color: 'text-indigo-400',
            border: 'border-indigo-500/30',
            onClick: () => setActiveTab('assignments'),
          },
          {
            label: 'High & Critical Priority',
            val: highPriorityCount,
            color: 'text-amber-400',
            border: 'border-amber-500/30',
            badge: highPriorityCount > 0 ? 'Urgent SLA' : null,
            onClick: () => setActiveTab('assignments'),
          },
          {
            label: 'Potential AI Matches',
            val: matchesFoundCount,
            color: 'text-purple-400',
            border: 'border-purple-500/30',
            badge: matchesFoundCount > 0 ? 'Actionable' : null,
            onClick: () => setActiveTab('evidence'),
          },
          {
            label: 'Evidence Submitted',
            val: evidencePackages.length,
            color: 'text-teal-400',
            border: 'border-teal-500/30',
            onClick: () => setActiveTab('evidence'),
          },
          {
            label: 'Completed Inquiries',
            val: completedCount,
            color: 'text-emerald-400',
            border: 'border-emerald-500/30',
            onClick: () => setActiveTab('history'),
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
          { id: 'assignments', label: 'Assigned Cases (My Inquiries)', icon: Building2, count: activeInquiriesCount },
          { id: 'search', label: 'AI Surveillance Search Console', icon: Search },
          {
            id: 'evidence',
            label: 'Evidence Packages & Validation Status',
            icon: Camera,
            count: evidencePackages.length,
          },
          { id: 'history', label: 'Completed Inquiries', icon: CheckCircle2, count: completedCount },
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
              {tab.count !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-white/10 text-slate-300 ml-1">
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ────────────────── TAB 1: ASSIGNED CASES ────────────────── */}
      {activeTab === 'assignments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                Active Cases Assigned to {departmentName}
              </h2>
              <p className="text-xs text-slate-400">
                Official surveillance assignments issued by State Admin. Conduct camera queries and submit findings.
              </p>
            </div>
            <button
              onClick={() => {
                refetchAssignments();
                refetchCases();
              }}
              className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-xs font-bold text-slate-300 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="space-y-3">
            {assignedCases.map((c) => (
              <div
                key={c.caseId}
                className={`p-5 rounded-2xl border transition-all ${
                  isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8 hover:border-indigo-500/30'
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-base font-black font-mono text-blue-400">{c.caseId}</span>
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
                        Origin Police Station: <strong className="text-slate-200">{c.policeStation}</strong>
                      </div>
                      <div>
                        FIR Number: <strong className="text-slate-200 font-mono">{c.firNumber}</strong>
                      </div>
                      <div>
                        Investigation SLA: <strong className="text-amber-400 font-mono">{c.slaStatus?.text || 'Tracking'}</strong>
                      </div>
                    </div>

                    {/* Subject info box */}
                    <div className="p-3 rounded-xl bg-white/2 border border-white/5 text-xs text-slate-300">
                      {c.requestType === 'STOLEN_VEHICLE' ? (
                        <span>
                          Vehicle Target: <strong className="text-blue-400 font-mono text-sm">{c.vehicleDetails?.registrationNumber}</strong>{' '}
                          ({c.vehicleDetails?.make} {c.vehicleDetails?.model} • {c.vehicleDetails?.color})
                        </span>
                      ) : (
                        <span>
                          Person Target: <strong className="text-purple-400 text-sm">{c.personDetails?.fullName}</strong>{' '}
                          (Age: {c.personDetails?.age} • Last seen: {c.personDetails?.lastKnownLocation})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                    <button
                      onClick={() => handleLaunchSearch(c)}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-md shadow-blue-600/30 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5" /> Launch AI Search
                    </button>

                    <button
                      onClick={() => handleOpenEvidenceSubmit(c)}
                      className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" /> Submit Evidence
                    </button>

                    <button
                      onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                      className="px-3.5 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                    >
                      Case Details
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {assignedCases.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No cases currently assigned to {departmentName}. State Admin will distribute assignments once FIRs are approved.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 2: AI SURVEILLANCE SEARCH CONSOLE ────────────────── */}
      {activeTab === 'search' && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <span className="font-bold text-amber-300 block uppercase tracking-wider">
                Law Enforcement Mandatory Notice:
              </span>
              <p className="text-slate-300 mt-0.5">
                All CCTV & ANPR query outputs are categorized as <strong>"POTENTIAL AI MATCH — HUMAN REVIEW REQUIRED"</strong>. 
                Department officers must visually verify physical vehicle identifiers or facial landmarks before submitting forensic evidence to State Admin.
              </p>
            </div>
          </div>

          <InvestigationSearchConsole
            firCase={selectedCaseForSearch || assignedCases[0]}
            onMatchSelected={(match) => {
              handleOpenEvidenceSubmit(selectedCaseForSearch || assignedCases[0], match);
            }}
          />
        </div>
      )}

      {/* ────────────────── TAB 3: EVIDENCE PACKAGES ────────────────── */}
      {activeTab === 'evidence' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <Camera className="w-5 h-5 text-teal-400" />
              Evidence Packages Submitted by {departmentName}
            </h2>
            <p className="text-xs text-slate-400">
              Forensic CCTV footage and frame captures awaiting Admin validation or forwarded to originating stations.
            </p>
          </div>

          <div className="space-y-3">
            {evidencePackages.map((res) => (
              <div
                key={res.resultId}
                className={`p-5 rounded-2xl border transition-all ${
                  isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-teal-400">{res.resultId}</span>
                      <span className="font-mono text-xs text-blue-400">Case: {res.caseId}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        {res.aiMatchConfidence}% AI Confidence
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black border border-white/10 text-slate-300">
                        {res.status?.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mt-1">
                      Camera: <strong className="text-slate-100">{res.cameraName}</strong> ({res.locationName}) •{' '}
                      Detected: {new Date(res.detectedAt).toLocaleString()}
                    </p>

                    <p className="text-xs text-slate-400 mt-0.5 italic">
                      "{res.officerRemarks}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      onClick={() => setActiveEvidenceViewer(res)}
                      className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" /> View Footage & Hash
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {evidencePackages.length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No evidence packages submitted yet. Run an AI Surveillance Search and click "Submit as Evidence".
              </div>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 4: COMPLETED INQUIRIES ────────────────── */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              Completed Investigations Archive
            </h2>
            <p className="text-xs text-slate-400">
              Historical surveillance inquiries resolved by originating stations.
            </p>
          </div>

          <div className="space-y-3">
            {assignedCases
              .filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED')
              .map((c) => (
                <div
                  key={c.caseId}
                  className={`p-5 rounded-2xl border ${
                    isLight ? 'bg-white border-slate-200' : 'bg-[#0b101b] border-white/8'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-emerald-400">{c.caseId}</span>
                        <span className="text-xs text-slate-300 font-bold">FIR: {c.firNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          RESOLVED
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Origin Station: {c.policeStation} • Subject: {c.vehicleDetails?.registrationNumber || c.personDetails?.fullName}
                      </p>
                    </div>

                    <button
                      onClick={() => navigate(`/investigation/cases/${c.caseId}`)}
                      className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              ))}

            {assignedCases.filter((c) => c.status === 'RESOLVED' || c.status === 'CLOSED').length === 0 && (
              <div className="py-12 text-center text-slate-500 text-xs">
                No completed investigations in archive.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Evidence Submission Modal */}
      {isEvidenceSubmitOpen && selectedCaseForEvidence && (
        <EvidenceSubmitModal
          isOpen={true}
          onClose={() => {
            setIsEvidenceSubmitOpen(false);
            setSelectedCaseForEvidence(null);
            setSelectedDetectionForEvidence(null);
          }}
          caseItem={selectedCaseForEvidence}
          detection={selectedDetectionForEvidence}
          onSubmitted={() => {
            setIsEvidenceSubmitOpen(false);
            setSelectedCaseForEvidence(null);
            setSelectedDetectionForEvidence(null);
            refetchCases();
            queryClient.invalidateQueries(['department-cases']);
            toast.success('Evidence package submitted to State Admin for validation!');
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
    </div>
  );
}
