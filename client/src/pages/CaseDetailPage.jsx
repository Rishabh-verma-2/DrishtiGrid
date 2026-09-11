import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Car,
  User,
  Shield,
  ShieldCheck,
  AlertTriangle,
  FileText,
  Camera,
  Layers,
  Search,
  CheckCircle2,
  XCircle,
  Share2,
  Video,
  Send,
  Eye,
  Hash,
  ExternalLink,
  ChevronRight,
  ScanEye,
  Lock,
  Compass,
} from 'lucide-react';
import { investigationAPI } from '../api';
import useAuthStore from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import InvestigationSearchConsole from '../components/investigation/InvestigationSearchConsole';
import EvidenceSubmitModal from '../components/investigation/EvidenceSubmitModal';
import EvidenceViewerModal from '../components/investigation/EvidenceViewerModal';
import WatchlistDistributionModal from '../components/investigation/WatchlistDistributionModal';
import InvestigationGISMap from '../components/investigation/InvestigationGISMap';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  SUBMITTED: { label: 'Submitted (Pending Review)', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ADMIN_REVIEW: { label: 'Under Admin Review', bg: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
  APPROVED: { label: 'Approved by Admin', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  REJECTED: { label: 'Rejected', bg: 'bg-red-500/15 text-red-400 border-red-500/30' },
  CORRECTION_REQUIRED: { label: 'Correction Required', bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  WATCHLIST_ACTIVE: { label: 'Master Watchlist Active', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  ASSIGNED_TO_DEPARTMENTS: { label: 'Assigned to Departments', bg: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  SEARCHING: { label: 'Active Surveillance Search', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  MATCH_FOUND: { label: 'AI Potential Match Detected', bg: 'bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse' },
  RESULT_SUBMITTED: { label: 'Evidence Submitted (Pending Validation)', bg: 'bg-teal-500/15 text-teal-400 border-teal-500/30' },
  ADMIN_VALIDATION: { label: 'Evidence Validated by Admin', bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  MORE_EVIDENCE_REQUIRED: { label: 'Additional Evidence Required', bg: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  FORWARDED_TO_ORIGIN: { label: 'Forwarded to Originating Station', bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 font-black' },
  ACKNOWLEDGED: { label: 'Acknowledged by Station', bg: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  RESOLVED: { label: 'Case Resolved & Recovered', bg: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50 font-black' },
  CLOSED: { label: 'Closed & Archived', bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export default function CaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState('overview'); // overview, fir, subject, watchlist, search, evidence, gis, timeline, audit
  const [isEvidenceSubmitOpen, setIsEvidenceSubmitOpen] = useState(false);
  const [isWatchlistDistributeOpen, setIsWatchlistDistributeOpen] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState(null);
  const [activeEvidenceViewer, setActiveEvidenceViewer] = useState(null);

  // Admin Review State
  const [adminActionModal, setAdminActionModal] = useState(null); // 'APPROVE', 'REJECT', 'REQUEST_CORRECTION'
  const [reviewRemarks, setReviewRemarks] = useState('');

  // Station Acknowledgment State
  const [ackAction, setAckAction] = useState('ACKNOWLEDGED'); // 'ACKNOWLEDGED', 'CASE_RESOLVED', 'CONTINUE_INVESTIGATION'
  const [ackNotes, setAckNotes] = useState('');

  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  // Fetch Case Data
  const { data, isLoading, error } = useQuery({
    queryKey: ['investigation-case', id],
    queryFn: () => investigationAPI.getCaseById(id).then((r) => r.data.data),
    staleTime: 10000,
    refetchInterval: 20000,
  });

  const firCase = data;

  // Admin Review Mutation
  const reviewMutation = useMutation({
    mutationFn: ({ action, remarks }) =>
      investigationAPI.reviewCase(firCase.caseId, {
        action,
        remarks,
        rejectionReason: action === 'REJECT' ? remarks : '',
        correctionComment: action === 'REQUEST_CORRECTION' ? remarks : '',
      }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-case', id]);
      queryClient.invalidateQueries(['investigation-cases']);
      setAdminActionModal(null);
      setReviewRemarks('');
      toast.success(res.message || 'Case review updated!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Review action failed.');
    },
  });

  // Forward Result Mutation
  const forwardMutation = useMutation({
    mutationFn: (resultId) =>
      investigationAPI.forwardResult(resultId, {
        remarks: 'Admin validated findings and forwarded to originating station.',
      }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-case', id]);
      toast.success(res.message || 'Result forwarded to originating station!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Forwarding failed.');
    },
  });

  // Acknowledge Result Mutation
  const acknowledgeMutation = useMutation({
    mutationFn: ({ actionTaken, officerNotes }) =>
      investigationAPI.acknowledgeResult(firCase.caseId, {
        actionTaken,
        officerNotes,
      }).then((r) => r.data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['investigation-case', id]);
      toast.success(res.message || 'Result acknowledged!');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Acknowledgment failed.');
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !firCase) {
    return (
      <div className="flex-1 p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold">Investigation Case Not Found</h3>
        <p className="text-xs text-slate-400 mt-1">The requested Case ID does not exist or access is restricted.</p>
        <button
          onClick={() => navigate('/investigation')}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
        >
          Return to Investigation Hub
        </button>
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[firCase.status] || {
    label: firCase.status,
    bg: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  };

  const isOriginStationUser =
    firCase.policeStation === user?.policeStation ||
    firCase.policeStation === user?.department ||
    firCase.submittedBy?._id === user?.id;

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-8 custom-scrollbar space-y-6 animate-fadeIn">
      {/* Top Breadcrumb & Return */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate('/investigation')}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Investigation Overview
        </button>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-slate-400">Section 65B Reg:</span>
          <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
            NIC-EVID-SECURE
          </span>
        </div>
      </div>

      {/* ────────────────── CASE HEADER BANNER ────────────────── */}
      <div
        className={`p-6 rounded-2xl border ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0b101b] border-white/10 shadow-xl'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-black font-mono tracking-tight text-blue-400">
                {firCase.caseId}
              </h2>
              <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {firCase.requestType?.replace('_', ' ')}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                  firCase.priority === 'CRITICAL'
                    ? 'bg-red-500/15 text-red-400 border-red-500/30'
                    : firCase.priority === 'HIGH'
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                }`}
              >
                {firCase.priority} PRIORITY
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusCfg.bg}`}>
                {statusCfg.label}
              </span>
            </div>

            <p className="text-xs text-slate-400 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>Origin: <strong className="text-slate-200">{firCase.policeStation}</strong></span>
              <span>FIR No: <strong className="text-slate-200 font-mono">{firCase.firNumber}</strong></span>
              <span>Officer: <strong className="text-slate-200">{firCase.officerName}</strong></span>
              <span>Filed: <strong className="text-slate-200">{new Date(firCase.firDate).toLocaleDateString()}</strong></span>
            </p>
          </div>

          {/* SLA Timer Card & Action Center */}
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-xl border text-right ${
              firCase.slaStatus?.isBreached ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-white/3 border-white/8'
            }`}>
              <div className="flex items-center gap-1.5 justify-end text-[10px] font-mono uppercase text-slate-400">
                <Clock className="w-3.5 h-3.5" /> Investigation SLA
              </div>
              <p className="text-sm font-black font-mono tracking-tight mt-0.5">
                {firCase.slaStatus?.text}
              </p>
            </div>

            {/* 1. Admin Actions */}
            {isAdmin && firCase.status === 'SUBMITTED' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdminActionModal('APPROVE')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve Case
                </button>
                <button
                  onClick={() => setAdminActionModal('REQUEST_CORRECTION')}
                  className="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" /> Request Correction
                </button>
                <button
                  onClick={() => setAdminActionModal('REJECT')}
                  className="px-3 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </div>
            )}

            {isAdmin && (firCase.status === 'WATCHLIST_ACTIVE' || firCase.status === 'APPROVED' || firCase.status === 'ASSIGNED_TO_DEPARTMENTS' || firCase.status === 'SEARCHING' || firCase.status === 'MATCH_FOUND') && (
              firCase.assignedDepartments && firCase.assignedDepartments.length > 0 ? (
                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-2 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 text-xs font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Forwarded to Departments
                  </span>
                  <button
                    onClick={() => setIsWatchlistDistributeOpen(true)}
                    className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Re-assign
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsWatchlistDistributeOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" /> Forward to Departments
                </button>
              )
            )}

            {/* 2. Police Station Actions */}
            {isOriginStationUser && firCase.status === 'FORWARDED_TO_ORIGIN' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAckAction('CASE_RESOLVED');
                    acknowledgeMutation.mutate({ actionTaken: 'CASE_RESOLVED', officerNotes: 'Case resolved by station.' });
                  }}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Resolved
                </button>
                <button
                  onClick={() => {
                    setAckAction('ACKNOWLEDGED');
                    acknowledgeMutation.mutate({ actionTaken: 'ACKNOWLEDGED', officerNotes: 'Findings acknowledged.' });
                  }}
                  className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" /> Acknowledge
                </button>
              </div>
            )}

            {/* 3. Department Officer: Search & Submit Evidence */}
            {!isAdmin && firCase.isWatchlistActive && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('search')}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-black shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-4 h-4" /> AI Search
                </button>
                <button
                  onClick={() => setIsEvidenceSubmitOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-4 h-4" /> Submit Evidence
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto border-t border-white/8 mt-5 pt-3 custom-scrollbar">
          {[
            { id: 'overview', label: 'Case Overview' },
            { id: 'fir', label: 'FIR Requisition Details' },
            { id: 'subject', label: 'Subject & Reference Media' },
            { id: 'watchlist', label: 'Master Watchlist & Assignments' },
            { id: 'search', label: 'AI Surveillance Search' },
            { id: 'evidence', label: `Investigation Results (${firCase.results?.length || 0})` },
            { id: 'gis', label: 'GIS Geolocation Trail' },
            { id: 'timeline', label: `Timeline (${firCase.timeline?.length || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? isLight
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-100'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ────────────────── TAB 1: OVERVIEW ────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
              <span className="text-[10px] font-mono uppercase text-slate-400">Target Registration / Name</span>
              <p className="text-lg font-black tracking-tight text-blue-400 mt-1 font-mono">
                {firCase.vehicleDetails?.registrationNumber || firCase.personDetails?.fullName || 'Subject'}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
              <span className="text-[10px] font-mono uppercase text-slate-400">Watchlist Status</span>
              <p className="text-lg font-black tracking-tight mt-1 flex items-center gap-2">
                {firCase.isWatchlistActive ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-5 h-5" /> Active in Watchlist
                  </span>
                ) : (
                  <span className="text-slate-400">Pending Watchlist</span>
                )}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
              <span className="text-[10px] font-mono uppercase text-slate-400">Assigned Departments</span>
              <p className="text-lg font-black tracking-tight text-indigo-400 mt-1">
                {firCase.assignments?.length || 0} Departments Active
              </p>
            </div>
            <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
              <span className="text-[10px] font-mono uppercase text-slate-400">Evidence Packages Submitted</span>
              <p className="text-lg font-black tracking-tight text-amber-400 mt-1">
                {firCase.results?.length || 0} Result Packages
              </p>
            </div>
          </div>

          {/* Description & Overview Body */}
          <div className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
            <h4 className="text-sm font-black tracking-tight mb-2">Case Narrative & Synopsis</h4>
            <p className="text-xs text-slate-300 leading-relaxed">{firCase.caseDescription}</p>

            {firCase.investigationRemarks && (
              <div className="mt-4 pt-3 border-t border-white/8">
                <span className="text-[10px] font-mono uppercase text-slate-400">Investigation Directives</span>
                <p className="text-xs text-slate-300 mt-1">{firCase.investigationRemarks}</p>
              </div>
            )}
          </div>

          {/* Latest Investigation Result Callout if available */}
          {firCase.results?.length > 0 && (
            <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-black">
                    <ScanEye className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-amber-400">
                      Latest Investigation Finding
                    </span>
                    <h5 className="text-sm font-black text-slate-100">
                      {firCase.results[0]?.matchLabel} · Camera {firCase.results[0]?.cameraId}
                    </h5>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Detected at {firCase.results[0]?.locationName} ({firCase.results[0]?.aiConfidence}% confidence) by {firCase.results[0]?.departmentName}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('evidence')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <Eye className="w-4 h-4" /> Inspect Evidence & Validation
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 2: FIR DETAILS ────────────────── */}
      {activeTab === 'fir' && (
        <div className={`p-6 rounded-2xl border space-y-6 ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
          <h4 className="text-sm font-black tracking-tight text-blue-400 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Verified FIR Legal Documentation
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">FIR Registration Number</span>
              <span className="font-mono font-bold text-sm text-slate-100">{firCase.firNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Registration Date</span>
              <span className="font-bold text-slate-100">{new Date(firCase.firDate).toLocaleDateString()}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Police Station Jurisdiction</span>
              <span className="font-bold text-slate-100">{firCase.policeStation}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Administrative District</span>
              <span className="font-bold text-slate-100">{firCase.district}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Region</span>
              <span className="font-bold text-slate-100">{firCase.region}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Investigating Officer Name</span>
              <span className="font-bold text-slate-100">{firCase.officerName}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Officer ID / Badge</span>
              <span className="font-mono font-bold text-slate-100">{firCase.officerId || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Official Phone</span>
              <span className="font-mono font-bold text-slate-100">{firCase.contactNumber}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-mono">Incident Location Address</span>
              <span className="font-bold text-slate-100">{firCase.locationAddress}</span>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 3: SUBJECT & REFERENCE MEDIA ────────────────── */}
      {activeTab === 'subject' && (
        <div className="space-y-6">
          <div className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
            <div className="flex items-center gap-2 mb-4">
              {firCase.requestType === 'STOLEN_VEHICLE' ? <Car className="w-4 h-4 text-blue-400" /> : <User className="w-4 h-4 text-blue-400" />}
              <span className="text-xs font-mono uppercase text-slate-400 font-bold">Target Identity Profile</span>
            </div>

            {firCase.requestType === 'STOLEN_VEHICLE' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Registration Plate</span>
                  <span className="font-mono font-black text-base text-cyan-400">{firCase.vehicleDetails?.registrationNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Vehicle Make</span>
                  <span className="font-bold text-slate-100">{firCase.vehicleDetails?.make || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Vehicle Model</span>
                  <span className="font-bold text-slate-100">{firCase.vehicleDetails?.model || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Color</span>
                  <span className="font-bold text-slate-100">{firCase.vehicleDetails?.color || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Manufacturing Year</span>
                  <span className="font-bold text-slate-100">{firCase.vehicleDetails?.manufacturingYear || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Chassis Number</span>
                  <span className="font-mono text-slate-100">{firCase.vehicleDetails?.chassisNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Engine Number</span>
                  <span className="font-mono text-slate-100">{firCase.vehicleDetails?.engineNumber || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Owner Name</span>
                  <span className="font-bold text-slate-100">{firCase.vehicleDetails?.ownerName || 'N/A'}</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Full Name</span>
                  <span className="font-black text-base text-amber-400">{firCase.personDetails?.fullName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Age & Gender</span>
                  <span className="font-bold text-slate-100">{firCase.personDetails?.age || 'N/A'} yrs · {firCase.personDetails?.gender}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Height / Weight</span>
                  <span className="font-bold text-slate-100">{firCase.personDetails?.height || 'N/A'} · {firCase.personDetails?.weight || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Known Aliases</span>
                  <span className="font-bold text-slate-100">{firCase.personDetails?.knownAliases || 'None'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Clothing Description</span>
                  <span className="font-semibold text-slate-100">{firCase.personDetails?.clothingDescription || 'N/A'}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Identification Marks</span>
                  <span className="font-semibold text-slate-100">{firCase.personDetails?.identificationMarks || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Reference Image Gallery */}
          <div className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
            <h4 className="text-sm font-black tracking-tight mb-4 flex items-center gap-2">
              <Camera className="w-4 h-4 text-blue-400" /> Reference Photographs & Evidence Crops ({firCase.attachments?.length || 0})
            </h4>

            {firCase.attachments?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {firCase.attachments.map((att, i) => (
                  <div
                    key={i}
                    onClick={() => setActiveEvidenceViewer(att)}
                    className="group relative rounded-xl overflow-hidden border border-white/10 cursor-pointer shadow-md bg-black/40"
                  >
                    <img
                      src={att.fileUrl}
                      alt={att.originalName}
                      className="w-full h-36 object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2.5">
                      <span className="text-[10px] font-bold text-white truncate">{att.originalName}</span>
                      <span className="text-[9px] text-blue-300 uppercase font-mono">{att.fileCategory?.replace('_', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No reference media uploaded.</p>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── TAB 4: MASTER WATCHLIST & ASSIGNMENTS ────────────────── */}
      {activeTab === 'watchlist' && (
        <div className="space-y-6">
          <div className={`p-6 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
            isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'
          }`}>
            <div>
              <span className="text-[10px] font-mono uppercase text-slate-400">Master Watchlist Identifier</span>
              <h4 className="text-lg font-black font-mono text-cyan-400">
                {firCase.watchlistEntryId || 'NOT ASSIGNED'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                Central Gujarat state surveillance subject registry record
              </p>
            </div>

            {isAdmin && (
              <button
                onClick={() => setIsWatchlistDistributeOpen(true)}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs shadow-md transition-all flex items-center gap-2"
              >
                <Share2 className="w-4 h-4" /> Forward to More Departments
              </button>
            )}
          </div>

          {/* Department Assignments Table */}
          <div className={`rounded-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
            <div className="px-6 py-4 border-b border-white/8 flex items-center justify-between">
              <h4 className="text-sm font-black tracking-tight flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-400" /> Active Department Assignments ({firCase.assignments?.length || 0})
              </h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className={`text-[10px] font-mono uppercase text-slate-400 ${isLight ? 'bg-slate-50' : 'bg-white/3'}`}>
                  <tr>
                    <th className="px-6 py-3">Assignment ID</th>
                    <th className="px-6 py-3">Department</th>
                    <th className="px-6 py-3">Assigned Date</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Searches Run</th>
                    <th className="px-6 py-3">Matches Found</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {firCase.assignments?.map((asg) => (
                    <tr key={asg._id} className="hover:bg-white/2">
                      <td className="px-6 py-3.5 font-mono font-bold text-blue-400">{asg.assignmentId}</td>
                      <td className="px-6 py-3.5 font-bold text-slate-200">{asg.departmentName}</td>
                      <td className="px-6 py-3.5 text-slate-400">{new Date(asg.assignedAt).toLocaleString()}</td>
                      <td className="px-6 py-3.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-500/10 text-blue-400">
                          {asg.status}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 font-mono">{asg.searchesCount || 0}</td>
                      <td className="px-6 py-3.5 font-mono font-bold text-amber-400">{asg.matchesCount || 0}</td>
                    </tr>
                  ))}
                  {(!firCase.assignments || firCase.assignments.length === 0) && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                        No departments assigned yet. State Admin can assign via the button above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── TAB 5: AI SURVEILLANCE SEARCH ────────────────── */}
      {activeTab === 'search' && (
        <InvestigationSearchConsole
          firCase={firCase}
          assignment={firCase.assignments?.[0]}
          onResultSelect={(matchItem) => {
            setSelectedDetection(matchItem);
            setIsEvidenceSubmitOpen(true);
          }}
        />
      )}

      {/* ────────────────── TAB 6: INVESTIGATION RESULTS & EVIDENCE ────────────────── */}
      {activeTab === 'evidence' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black tracking-tight flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Submitted Investigation Results ({firCase.results?.length || 0})
            </h4>
            <button
              onClick={() => {
                setSelectedDetection(null);
                setIsEvidenceSubmitOpen(true);
              }}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" /> Submit Additional Evidence
            </button>
          </div>

          {firCase.results?.map((res) => (
            <div
              key={res._id}
              className={`p-6 rounded-2xl border space-y-4 ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f172a]/70 border-white/10'
              }`}
            >
              {/* Result Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/8 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm text-blue-400">{res.resultId}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-400 border border-amber-500/30">
                      {res.matchLabel} ({res.aiConfidence}%)
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 uppercase">
                      {res.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Submitted by <strong>{res.submittedByName}</strong> ({res.departmentName}) on {new Date(res.submittedAt).toLocaleString()}
                  </p>
                </div>

                {/* Forward to Station Action Button (Auto-routed to Origin Station) */}
                {isAdmin && res.status !== 'FORWARDED_TO_ORIGIN' && (
                  <button
                    onClick={() => forwardMutation.mutate(res.resultId)}
                    disabled={forwardMutation.isPending}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Send className="w-4 h-4" /> Forward to {firCase.policeStation}
                  </button>
                )}
              </div>

              {/* Detection Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Camera ID</span>
                  <span className="font-mono font-bold text-cyan-400">{res.cameraId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Location</span>
                  <span className="font-bold text-slate-200">{res.locationName}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Detection Time</span>
                  <span className="font-mono text-slate-200">{new Date(res.detectionTimestamp).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-mono">Travel Heading</span>
                  <span className="font-semibold text-slate-200">{res.headingOrDirection || 'N/A'}</span>
                </div>
              </div>

              {/* Officer Remarks */}
              <div className="text-xs p-3.5 rounded-xl bg-white/2 border border-white/5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block mb-1">
                  Investigating Officer Remarks
                </span>
                <p className="leading-relaxed text-slate-200">{res.officerRemarks}</p>
              </div>

              {/* Attached Evidence Files */}
              {res.evidenceFiles?.length > 0 && (
                <div>
                  <span className="text-[10px] font-mono uppercase text-slate-400 block mb-2">
                    Evidence Chain Files ({res.evidenceFiles.length}) · Click to Open Full Player
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {res.evidenceFiles.map((ev, idx) => (
                      <div
                        key={idx}
                        onClick={() => setActiveEvidenceViewer(ev)}
                        className="p-3 rounded-xl border border-white/10 hover:border-blue-500/40 bg-black/40 cursor-pointer flex items-center gap-3 transition-all"
                      >
                        {ev.category === 'CCTV_FOOTAGE' ? (
                          <div className="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                            <Video className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0">
                            <Camera className="w-5 h-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-bold truncate text-slate-200">{ev.fileName}</p>
                          <p className="text-[10px] text-slate-400 font-mono">SHA-256 Verified</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Originating Police Station Acknowledgment Actions */}
              {isOriginStationUser && firCase.status === 'FORWARDED_TO_ORIGIN' && (
                <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="font-bold text-xs text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> Originating Police Station Action Required
                      </h5>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        Your station has received validated evidence from the State Surveillance Grid.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => acknowledgeMutation.mutate({ actionTaken: 'CASE_RESOLVED', officerNotes: 'Vehicle intercepted and seized.' })}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-md flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Mark Case Resolved (Recovered)
                    </button>
                    <button
                      type="button"
                      onClick={() => acknowledgeMutation.mutate({ actionTaken: 'ACKNOWLEDGED', officerNotes: 'Field team dispatched for ground interception.' })}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md"
                    >
                      Acknowledge Findings
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {(!firCase.results || firCase.results.length === 0) && (
            <div className="p-12 text-center rounded-2xl border border-white/10 bg-white/2">
              <Camera className="w-10 h-10 text-slate-500 mx-auto mb-2" />
              <p className="text-xs font-bold">No Investigation Results Submitted Yet</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Investigating departments can scan cameras and attach match footage.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── TAB 7: GIS GEOLOCATION TRAIL ────────────────── */}
      {activeTab === 'gis' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black tracking-tight flex items-center gap-2">
              <MapPin className="w-4 h-4 text-red-400" /> Geospatial Surveillance Trail & Optical Nodes
            </h4>
            <span className="text-xs text-slate-400">
              Interactive Leaflet Map with Chronological Flight Direction
            </span>
          </div>

          <div className="h-[520px] w-full">
            <InvestigationGISMap firCase={firCase} results={firCase.results || []} />
          </div>
        </div>
      )}

      {/* ────────────────── TAB 8: CHRONOLOGICAL TIMELINE ────────────────── */}
      {activeTab === 'timeline' && (
        <div className={`p-6 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-white/2 border-white/8'}`}>
          <h4 className="text-sm font-black tracking-tight mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-400" /> Immutable Investigation Lifecycle Timeline
          </h4>

          <div className="relative pl-6 border-l-2 border-white/10 space-y-6">
            {firCase.timeline?.map((item, idx) => (
              <div key={idx} className="relative group">
                {/* Timeline dot */}
                <span className="absolute -left-[31px] top-1.5 w-4 h-4 rounded-full bg-blue-500 border-4 border-[#0b101b] shadow-xs group-hover:scale-125 transition-transform" />

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h5 className="text-xs font-black tracking-tight text-slate-100">{item.action}</h5>
                    <span className="text-[10px] font-mono text-slate-400">
                      {new Date(item.timestamp).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    By <strong className="text-slate-200">{item.actorName}</strong> ({item.actorDepartment || item.actorRole})
                  </p>

                  {item.remarks && (
                    <p className="text-xs text-slate-300 mt-1 bg-white/3 p-2.5 rounded-lg border border-white/5 leading-relaxed">
                      {item.remarks}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {isEvidenceSubmitOpen && (
        <EvidenceSubmitModal
          isOpen={isEvidenceSubmitOpen}
          onClose={() => setIsEvidenceSubmitOpen(false)}
          firCase={firCase}
          assignment={firCase.assignments?.[0]}
          detectionData={selectedDetection}
        />
      )}

      {isWatchlistDistributeOpen && (
        <WatchlistDistributionModal
          isOpen={isWatchlistDistributeOpen}
          onClose={() => setIsWatchlistDistributeOpen(false)}
          watchlistEntry={firCase.watchlistEntry || {
            watchlistId: firCase.watchlistEntryId || 'WL-PENDING',
            caseId: firCase.caseId,
            originatingStation: firCase.policeStation,
            priority: firCase.priority,
            subjectType: firCase.requestType,
            subjectIdentifier: firCase.vehicleDetails?.registrationNumber || firCase.personDetails?.fullName,
          }}
        />
      )}

      {activeEvidenceViewer && (
        <EvidenceViewerModal
          isOpen={Boolean(activeEvidenceViewer)}
          onClose={() => setActiveEvidenceViewer(null)}
          evidenceItem={activeEvidenceViewer}
          result={firCase.results?.[0]}
        />
      )}
    </div>
  );
}
