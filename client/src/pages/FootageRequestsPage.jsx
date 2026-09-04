import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { footageTicketAPI, cameraAPI } from '../api';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import {
  FileText, Plus, Shield, Search, Filter, RotateCcw,
  CheckCircle2, Clock, XCircle, Send, Download, ExternalLink,
  ChevronRight, Calendar, User, Building, MapPin, Hash,
  AlertTriangle, Lock, Eye, Copy, Info, Check, ArrowDownLeft,
  ArrowUpRight, Globe, FileCheck, Layers, X, Video, MessageSquare,
  Upload, ShieldCheck, ShieldAlert, Play, RefreshCw, Cpu
} from 'lucide-react';

const STATUS_CONFIG = {
  Pending: {
    label: 'Pending',
    color: 'amber',
    badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/25',
    lightBadge: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  Accepted: {
    label: 'Accepted',
    color: 'blue',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
    lightBadge: 'bg-blue-50 text-blue-700 border-blue-200',
    dot: 'bg-blue-500',
  },
  Processing: {
    label: 'Processing',
    color: 'indigo',
    badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25',
    lightBadge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    dot: 'bg-indigo-500',
  },
  'Evidence Uploaded': {
    label: 'Evidence Uploaded',
    color: 'emerald',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
    lightBadge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  Available: {
    label: 'Available',
    color: 'cyan',
    badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25',
    lightBadge: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dot: 'bg-cyan-400',
  },
  Viewed: {
    label: 'Viewed',
    color: 'purple',
    badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    lightBadge: 'bg-purple-50 text-purple-700 border-purple-200',
    dot: 'bg-purple-400',
  },
  Responded: {
    label: 'Responded',
    color: 'teal',
    badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/25',
    lightBadge: 'bg-teal-50 text-teal-700 border-teal-200',
    dot: 'bg-teal-400',
  },
  Closed: {
    label: 'Closed',
    color: 'slate',
    badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/25',
    lightBadge: 'bg-slate-100 text-slate-600 border-slate-300',
    dot: 'bg-slate-400',
  },
  Rejected: {
    label: 'Rejected',
    color: 'rose',
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
    lightBadge: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
  // Legacy mappings
  submitted: { label: 'Pending', badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/25', dot: 'bg-amber-500' },
  under_review: { label: 'Accepted', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/25', dot: 'bg-blue-500' },
  approved: { label: 'Processing', badgeClass: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25', dot: 'bg-indigo-500' },
  dispatched: { label: 'Available', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/25', dot: 'bg-cyan-400' },
  closed: { label: 'Closed', badgeClass: 'bg-slate-500/10 text-slate-400 border-slate-500/25', dot: 'bg-slate-400' },
  rejected: { label: 'Rejected', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/25', dot: 'bg-rose-500' },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'URGENT', tw: 'bg-red-500/15 text-red-400 border-red-500/30' },
  high:   { label: 'HIGH',   tw: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  medium: { label: 'MEDIUM', tw: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  low:    { label: 'LOW',    tw: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export default function FootageRequestsPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { socket } = useSocketStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';

  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = userRole === 'ADMIN' || userRole === 'SUPERADMIN';
  const userDept = user?.department || 'Gujarat Police Department';

  // Filters & State
  const [direction, setDirection] = useState('incoming'); // 'incoming' | 'outgoing' | 'all'
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'evidence' | 'responses' | 'audit'

  // Modals & form state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [responseText, setResponseText] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  // Evidence upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadRemarks, setUploadRemarks] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Integrity verification result state
  const [integrityReport, setIntegrityReport] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Read ticket parameter from URL if provided
  useEffect(() => {
    const tParam = searchParams.get('ticket') || searchParams.get('ticketId');
    if (tParam) {
      setSelectedTicketId(tParam);
    }
  }, [searchParams]);

  // Real-time socket events for ticket updates
  useEffect(() => {
    if (!socket) return;

    const handleTicketCreated = () => {
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
    };

    const handleTicketUpdated = (ticket) => {
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      if (selectedTicketId && (ticket.ticketId === selectedTicketId || ticket._id === selectedTicketId)) {
        queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
        queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      }
    };

    const handleResponseAdded = (data) => {
      if (selectedTicketId && data.ticketId === selectedTicketId) {
        queryClient.invalidateQueries(['footage-ticket-responses', selectedTicketId]);
        queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      }
    };

    socket.on('ticket:created', handleTicketCreated);
    socket.on('ticket:updated', handleTicketUpdated);
    socket.on('ticket:evidence_uploaded', handleTicketUpdated);
    socket.on('ticket:response_added', handleResponseAdded);

    return () => {
      socket.off('ticket:created', handleTicketCreated);
      socket.off('ticket:updated', handleTicketUpdated);
      socket.off('ticket:evidence_uploaded', handleTicketUpdated);
      socket.off('ticket:response_added', handleResponseAdded);
    };
  }, [socket, selectedTicketId, queryClient]);

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
    refetchInterval: 12000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['footage-tickets-stats'],
    queryFn: () => footageTicketAPI.getStats().then((r) => r.data.data),
    refetchInterval: 12000,
  });

  const { data: selectedTicket, isLoading: isDetailLoading } = useQuery({
    queryKey: ['footage-ticket-detail', selectedTicketId],
    queryFn: () => footageTicketAPI.getById(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId),
  });

  const { data: responsesData, isLoading: isResponsesLoading } = useQuery({
    queryKey: ['footage-ticket-responses', selectedTicketId],
    queryFn: () => footageTicketAPI.getResponses(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId),
  });

  const { data: auditLogsData, isLoading: isLogsLoading } = useQuery({
    queryKey: ['footage-ticket-audit-logs', selectedTicketId],
    queryFn: () => footageTicketAPI.getAuditLogs(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId),
  });

  const { data: camerasList = [] } = useQuery({
    queryKey: ['cameras-short-list'],
    queryFn: () => cameraAPI.getAll({ limit: 1000 }).then((r) => r.data.data || []),
    staleTime: 120000,
  });

  const tickets = ticketsData?.data || [];
  const stats = statsData || { total: 0, pendingAction: 0, available: 0, incomingPending: 0, closed: 0 };
  const responses = responsesData || [];
  const auditLogs = auditLogsData || [];

  // Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status, remarks, rejectionReason }) =>
      footageTicketAPI.updateStatus(id, { status, remarks, rejectionReason }),
    onSuccess: (_, variables) => {
      toast.success(`Ticket transitioned to "${variables.status}"`);
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsRejectModalOpen(false);
      setRejectionReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update ticket status'),
  });

  // Response Mutation
  const addResponseMutation = useMutation({
    mutationFn: ({ id, message }) => footageTicketAPI.addResponse(id, { message }),
    onSuccess: () => {
      toast.success('Case response submitted');
      setResponseText('');
      queryClient.invalidateQueries(['footage-ticket-responses', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to post response'),
  });

  // Evidence Upload Handler
  const handleEvidenceUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) {
      toast.error('Please select a CCTV footage file to upload');
      return;
    }

    const formData = new FormData();
    formData.append('footage', selectedFile);
    if (uploadRemarks) formData.append('remarks', uploadRemarks);

    setIsUploading(true);
    const toastId = toast.loading('Calculating SHA-256 & encrypting with AES-256-GCM...');

    try {
      await footageTicketAPI.uploadEvidence(selectedTicket.ticketId, formData);
      toast.success('Footage encrypted and stored in Cloudinary evidence vault!', { id: toastId });
      setSelectedFile(null);
      setUploadRemarks('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setDetailTab('evidence');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Evidence upload failed', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Integrity Verification Handler
  const handleVerifyIntegrity = async () => {
    if (!selectedTicket?.evidence?.evidenceId && !selectedTicket?.evidenceId) return;
    const evId = selectedTicket.evidence?.evidenceId || selectedTicket.evidenceId;

    setIsVerifying(true);
    const toastId = toast.loading('Verifying cryptographic SHA-256 seal...');
    try {
      const res = await footageTicketAPI.verifyEvidence(selectedTicket.ticketId, evId);
      setIntegrityReport(res.data.data);
      if (res.data.data.verified) {
        toast.success('🟢 Integrity Verified: SHA-256 checksum matches!', { id: toastId });
      } else {
        toast.error('🔴 Evidence Integrity Compromised!', { id: toastId });
      }
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to verify integrity', { id: toastId });
    } finally {
      setIsVerifying(false);
    }
  };

  // Create Ticket Form State
  const [createForm, setCreateForm] = useState({
    title: '',
    firNumber: '',
    caseNumber: '',
    incidentType: 'Criminal Investigation',
    priority: 'high',
    classification: 'Confidential',
    cameraId: '',
    targetDepartment: '',
    startTime: '',
    endTime: '',
    purpose: '',
    description: '',
    contactPhone: user?.phone || '+91-79-23250000',
    officialDesignation: user?.designation || 'Investigating Officer',
    acknowledgedCompliance: false,
  });

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
      toast.success(`Requisition ticket ${res.data.data.ticketId} created successfully`);
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      setIsCreateModalOpen(false);
      setSelectedTicketId(res.data.data.ticketId);
      setSearchParams({ ticket: res.data.data.ticketId });
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

  // Determine user permission context on the selected ticket
  const ticketPerms = useMemo(() => {
    if (!selectedTicket) return { isRequester: false, isTarget: false, canUpload: false, canAccept: false };
    const isTarget = selectedTicket.targetDepartment === userDept;
    const isRequester = selectedTicket.requestingDepartment === userDept || selectedTicket.requestedBy?._id === user?._id;
    return {
      isRequester,
      isTarget,
      canUpload: isTarget || isAdmin,
      canAccept: (isTarget || isAdmin) && ['Pending', 'submitted'].includes(selectedTicket.status),
      canProcess: (isTarget || isAdmin) && ['Accepted', 'under_review'].includes(selectedTicket.status),
      canReject: (isTarget || isAdmin) && ['Pending', 'submitted', 'Accepted', 'under_review'].includes(selectedTicket.status),
      canClose: (isRequester || isAdmin) && selectedTicket.status !== 'Closed',
      canViewEvidence: isRequester || isTarget || isAdmin,
    };
  }, [selectedTicket, userDept, isAdmin, user?._id]);

  const streamUrl = useMemo(() => {
    if (!selectedTicket) return '';
    const evId = selectedTicket.evidence?.evidenceId || selectedTicket.evidenceId;
    if (!evId) return '';
    const token = localStorage.getItem('token') || '';
    return `/api/footage-tickets/${selectedTicket.ticketId}/evidence/${evId}/stream?token=${token}`;
  }, [selectedTicket]);

  return (
    <div className={`flex flex-col h-full overflow-hidden ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0a0d14] text-slate-100'}`}>

      {/* ─── Top Header & Controls ─────────────────────────────────── */}
      <div className={`px-6 py-4 border-b shrink-0 flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 font-bold shadow-xs">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black tracking-tight">
                CCTV Footage Requisitions &amp; Evidence Vault
              </h1>
              <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                SECURE AES-256
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Official inter-department requisitioning system between Police, Traffic Police &amp; Home Dept
            </p>
          </div>
        </div>

        {/* Action Button: Create Requisition Ticket */}
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg shadow-blue-600/25 transition-all cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Footage Requisition</span>
        </button>
      </div>

      {/* ─── Metric Stat Cards ─────────────────────────────────────── */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Requisitions</span>
            <Layers className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-black mt-1 text-slate-100">{stats.total || 0}</p>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-400">Action Required</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-xl font-black mt-1 text-amber-400">{stats.pendingAction || 0}</p>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-400">Incoming to My Dept</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-black mt-1 text-emerald-400">{stats.incomingPending || 0}</p>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-cyan-400">Evidence Available</span>
            <Video className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-black mt-1 text-cyan-400">{stats.available || 0}</p>
        </div>

        <div className={`p-3.5 rounded-2xl border ${isLight ? 'bg-white border-slate-200' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Closed &amp; Sealed</span>
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-xl font-black mt-1 text-slate-300">{stats.closed || 0}</p>
        </div>
      </div>

      {/* ─── Workflow Direction Tabs & Search ───────────────────────── */}
      <div className="px-6 pb-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-black/20 border border-white/5">
          <button
            onClick={() => setDirection('incoming')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              direction === 'incoming'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            <span>Incoming Requests</span>
          </button>

          <button
            onClick={() => setDirection('outgoing')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              direction === 'outgoing'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>My Requisitions</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setDirection('all')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                direction === 'all'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Admin All</span>
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Ticket ID, Camera, FIR, Dept..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Accepted">Accepted</option>
            <option value="Processing">Processing</option>
            <option value="Evidence Uploaded">Evidence Uploaded</option>
            <option value="Available">Available</option>
            <option value="Viewed">Viewed</option>
            <option value="Responded">Responded</option>
            <option value="Closed">Closed</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>
      </div>

      {/* ─── Main Content Split View: List on Left, Detail on Right ─── */}
      <div className="flex-1 flex min-h-0 px-6 pb-6 gap-5 overflow-hidden">
        
        {/* Ticket List Panel */}
        <div className={`w-full lg:w-5/12 flex flex-col rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#0f1422] border-white/5'
        }`}>
          <div className="p-3.5 border-b border-white/5 flex items-center justify-between text-xs font-bold text-slate-400">
            <span>Requisitions ({tickets.length})</span>
            <span className="text-[11px] text-slate-500">Dept: {userDept}</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-white/5">
            {isTicketsLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading requisitions...</div>
            ) : tickets.length === 0 ? (
              <div className="p-12 text-center">
                <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">No requisitions found</p>
                <p className="text-[11px] text-slate-500 mt-1">Try changing filters or lodge a new requisition</p>
              </div>
            ) : (
              tickets.map((t) => {
                const isSelected = selectedTicketId === t.ticketId || selectedTicketId === t._id;
                const statusInfo = STATUS_CONFIG[t.status] || STATUS_CONFIG.Pending;
                const priorityInfo = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;

                return (
                  <div
                    key={t._id}
                    onClick={() => {
                      setSelectedTicketId(t.ticketId);
                      setSearchParams({ ticket: t.ticketId });
                    }}
                    className={`p-4 transition-all cursor-pointer border-l-4 ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500 shadow-inner'
                        : isLight
                        ? 'hover:bg-slate-50 border-transparent'
                        : 'hover:bg-white/4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-blue-400">
                          {t.ticketId}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                      </div>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${priorityInfo.tw}`}>
                        {priorityInfo.label}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-slate-200 truncate">{t.title}</p>

                    <div className="grid grid-cols-2 gap-2 mt-2.5 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <Building className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{t.targetDepartment}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{t.locationName || t.cameraId}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/5 text-[10px] text-slate-500">
                      <span>By: {t.requestedBy?.name || 'Officer'}</span>
                      <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Ticket Detail Panel (Right Side) */}
        <div className={`hidden lg:flex flex-1 flex-col rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200' : 'bg-[#0f1422] border-white/5'
        }`}>
          {!selectedTicket ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <Shield className="w-12 h-12 text-slate-600 mb-3 opacity-60" />
              <p className="text-sm font-bold text-slate-300">No Requisition Selected</p>
              <p className="text-xs max-w-xs mt-1">Select a ticket from the left panel to inspect evidence, upload footage, verify SHA-256 seals, and review audit history.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Detail Header Banner */}
              <div className="p-4 border-b border-white/5 bg-[#141a2e] flex items-center justify-between shrink-0">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-sm font-black text-blue-400">{selectedTicket.ticketId}</span>
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      STATUS_CONFIG[selectedTicket.status]?.badgeClass || 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {STATUS_CONFIG[selectedTicket.status]?.label || selectedTicket.status}
                    </span>
                    {selectedTicket.firNumber && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 border border-white/10 text-slate-300">
                        FIR: {selectedTicket.firNumber}
                      </span>
                    )}
                  </div>
                  <h2 className="text-sm font-bold text-slate-100 mt-1">{selectedTicket.title}</h2>
                </div>

                {/* Workflow Actions */}
                <div className="flex items-center gap-2">
                  {ticketPerms.canAccept && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: selectedTicket.ticketId, status: 'Accepted' })}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      Accept Request
                    </button>
                  )}

                  {ticketPerms.canProcess && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: selectedTicket.ticketId, status: 'Processing' })}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm"
                    >
                      Mark Processing
                    </button>
                  )}

                  {ticketPerms.canReject && (
                    <button
                      onClick={() => setIsRejectModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-500/30 text-xs font-bold transition-all"
                    >
                      Reject
                    </button>
                  )}

                  {ticketPerms.canClose && (
                    <button
                      onClick={() => updateStatusMutation.mutate({ id: selectedTicket.ticketId, status: 'Closed' })}
                      className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold transition-all"
                    >
                      Close Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Navigation Tabs for Detail View */}
              <div className="px-4 border-b border-white/5 bg-black/20 flex items-center gap-6 text-xs font-bold shrink-0">
                <button
                  onClick={() => setDetailTab('overview')}
                  className={`py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'overview'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Overview &amp; Requisition</span>
                </button>

                <button
                  onClick={() => setDetailTab('evidence')}
                  className={`py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'evidence'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Secure Evidence Vault</span>
                  {selectedTicket.evidence && (
                    <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
                  )}
                </button>

                <button
                  onClick={() => setDetailTab('responses')}
                  className={`py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'responses'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Responses &amp; Case Log</span>
                  {responses.length > 0 && (
                    <span className="text-[10px] px-1.5 rounded-full bg-white/10 text-slate-300">
                      {responses.length}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => setDetailTab('audit')}
                  className={`py-3 border-b-2 transition-all cursor-pointer flex items-center gap-1.5 ${
                    detailTab === 'audit'
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Forensic Audit Trail</span>
                </button>
              </div>

              {/* Tab 1: Overview */}
              {detailTab === 'overview' && (
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Requesting Context */}
                    <div className="p-4 rounded-xl bg-white/4 border border-white/5 space-y-2.5">
                      <p className="text-[11px] font-black uppercase text-blue-400 tracking-wider">
                        Requesting Authority
                      </p>
                      <div className="space-y-1.5 text-xs text-slate-300">
                        <p><span className="text-slate-500">Department:</span> {selectedTicket.requestingDepartment}</p>
                        <p><span className="text-slate-500">Officer:</span> {selectedTicket.requestedBy?.name} ({selectedTicket.officialDesignation || 'Inspector'})</p>
                        <p><span className="text-slate-500">Contact:</span> {selectedTicket.contactPhone || selectedTicket.requestedBy?.email}</p>
                      </div>
                    </div>

                    {/* Target Context */}
                    <div className="p-4 rounded-xl bg-white/4 border border-white/5 space-y-2.5">
                      <p className="text-[11px] font-black uppercase text-emerald-400 tracking-wider">
                        Target Department (Custodian)
                      </p>
                      <div className="space-y-1.5 text-xs text-slate-300">
                        <p><span className="text-slate-500">Department:</span> {selectedTicket.targetDepartment}</p>
                        <p><span className="text-slate-500">Camera:</span> {selectedTicket.cameraName} ({selectedTicket.cameraId})</p>
                        <p><span className="text-slate-500">Location:</span> {selectedTicket.locationName}, {selectedTicket.district}</p>
                      </div>
                    </div>
                  </div>

                  {/* Time Duration Window */}
                  <div className="p-4 rounded-xl bg-white/4 border border-white/5">
                    <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-2">
                      Footage Time Window &amp; Duration
                    </p>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="text-slate-500 text-[11px]">Start Time</p>
                        <p className="font-semibold text-slate-200 mt-0.5">{new Date(selectedTicket.startTime).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[11px]">End Time</p>
                        <p className="font-semibold text-slate-200 mt-0.5">{new Date(selectedTicket.endTime).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-slate-500 text-[11px]">Duration</p>
                        <p className="font-bold text-amber-400 mt-0.5">{selectedTicket.durationMinutes || 0} Minutes</p>
                      </div>
                    </div>
                  </div>

                  {/* Legal Justification */}
                  <div className="p-4 rounded-xl bg-white/4 border border-white/5">
                    <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider mb-2">
                      Legal Purpose &amp; Investigation Justification
                    </p>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {selectedTicket.purpose || selectedTicket.description}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: Secure Evidence Vault */}
              {detailTab === 'evidence' && (
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                  {selectedTicket.evidence ? (
                    <div className="space-y-4">
                      
                      {/* Integrity Seal Status Card */}
                      <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <ShieldCheck className="w-6 h-6" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-sm text-emerald-400">
                                🟢 Integrity Verified (SHA-256 Validated)
                              </span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                AES-256-GCM
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5">
                              Evidence ID: <span className="font-mono font-bold text-slate-200">{selectedTicket.evidence.evidenceId}</span> · Cloudinary Asset Vault
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={handleVerifyIntegrity}
                          disabled={isVerifying}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold border border-white/10 transition-all cursor-pointer"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin text-emerald-400' : ''}`} />
                          <span>Re-verify Checksum</span>
                        </button>
                      </div>

                      {/* Video Player Box */}
                      <div className="rounded-2xl border border-white/10 overflow-hidden bg-black aspect-video relative flex items-center justify-center">
                        <video
                          controls
                          className="w-full h-full object-contain"
                          src={streamUrl}
                          controlsList="nodownload"
                        >
                          Your browser does not support HTML5 video streaming.
                        </video>
                      </div>

                      {/* Evidence Metadata Table */}
                      <div className="p-4 rounded-2xl bg-white/4 border border-white/5 space-y-3 text-xs">
                        <p className="text-[11px] font-black uppercase text-slate-400 tracking-wider">
                          Cryptographic &amp; Storage Parameters
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                          <div>
                            <span className="text-slate-500">SHA-256 Seal:</span>
                            <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px] text-emerald-400 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
                              <span className="truncate">{selectedTicket.evidence.sha256Hash}</span>
                              <button onClick={() => copyText(selectedTicket.evidence.sha256Hash, 'sha256')}>
                                <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                              </button>
                            </div>
                          </div>
                          <div>
                            <span className="text-slate-500">Cloudinary Public ID:</span>
                            <div className="mt-0.5 font-mono text-[11px] text-slate-300 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5 truncate">
                              {selectedTicket.evidence.cloudinaryAsset?.publicId}
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[11px] text-slate-400">
                          <p>Uploaded By: <span className="font-semibold text-slate-200">{selectedTicket.evidence.uploadedByName}</span></p>
                          <p>File Size: <span className="font-semibold text-slate-200">{(selectedTicket.evidence.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</span></p>
                          <p>Uploaded: <span className="font-semibold text-slate-200">{new Date(selectedTicket.evidence.createdAt).toLocaleDateString()}</span></p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Upload Section if No Evidence Attached Yet */
                    <div className="space-y-4">
                      {ticketPerms.canUpload ? (
                        <form onSubmit={handleEvidenceUpload} className="p-6 rounded-2xl border-2 border-dashed border-blue-500/30 bg-blue-500/5 space-y-4">
                          <div className="text-center">
                            <Upload className="w-10 h-10 text-blue-400 mx-auto mb-2 animate-bounce" />
                            <h3 className="text-sm font-bold text-slate-200">Upload CCTV Video Evidence</h3>
                            <p className="text-xs text-slate-400 mt-1">
                              Files are automatically hashed with SHA-256 and encrypted with AES-256-GCM before Cloudinary storage.
                            </p>
                          </div>

                          <div className="flex flex-col items-center">
                            <input
                              type="file"
                              ref={fileInputRef}
                              accept="video/mp4,video/mkv,video/webm,video/avi"
                              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                              className="text-xs text-slate-300 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-500 file:cursor-pointer"
                            />
                            {selectedFile && (
                              <p className="text-xs text-emerald-400 font-semibold mt-2">
                                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                              Officer / Custodian Remarks (Optional)
                            </label>
                            <input
                              type="text"
                              value={uploadRemarks}
                              onChange={(e) => setUploadRemarks(e.target.value)}
                              placeholder="e.g. Exported from NVR 4, Channel 2, Ahmedabad Traffic Command"
                              className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <button
                            type="submit"
                            disabled={!selectedFile || isUploading}
                            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            <span>{isUploading ? 'Encrypting & Uploading...' : 'Encrypt & Upload to Vault'}</span>
                          </button>
                        </form>
                      ) : (
                        <div className="p-10 rounded-2xl bg-white/3 border border-white/5 text-center">
                          <Clock className="w-10 h-10 text-amber-400 mx-auto mb-2 opacity-60" />
                          <h4 className="text-xs font-bold text-slate-300">Footage Not Yet Uploaded</h4>
                          <p className="text-[11px] text-slate-500 max-w-sm mx-auto mt-1">
                            The requested department ({selectedTicket.targetDepartment}) is currently retrieving and preparing the requested CCTV footage.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Responses & Case Conversation */}
              {detailTab === 'responses' && (
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {responses.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No responses lodged yet. You can post questions or clarifications below.
                      </div>
                    ) : (
                      responses.map((r) => (
                        <div
                          key={r._id}
                          className={`p-3 rounded-xl border ${
                            r.type === 'evidence_upload'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                              : r.type === 'status_change'
                              ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                              : 'bg-white/4 border-white/5 text-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="font-bold text-slate-300">
                              {r.senderName} ({r.senderDepartment})
                            </span>
                            <span className="text-slate-500">
                              {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-xs whitespace-pre-wrap leading-relaxed">{r.message}</p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Input Box */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (responseText.trim()) {
                        addResponseMutation.mutate({ id: selectedTicket.ticketId, message: responseText });
                      }
                    }}
                    className="p-3 border-t border-white/5 bg-black/20 flex gap-2"
                  >
                    <input
                      type="text"
                      placeholder="Add an official response or query..."
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!responseText.trim()}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Reply</span>
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 4: Forensic Audit Trail */}
              {detailTab === 'audit' && (
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                    Immutable Legal Chain of Custody Audit Log
                  </p>
                  {auditLogs.map((log) => (
                    <div key={log._id} className="p-3 rounded-xl bg-white/4 border border-white/5 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-blue-400">{log.action}</span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-300">{log.remarks}</p>
                      <div className="flex items-center justify-between pt-1 border-t border-white/5 text-[10px] text-slate-500 font-mono">
                        <span>Actor: {log.actorName} ({log.actorDepartment})</span>
                        <span className="truncate max-w-xs">Seal: {log.integrityHash?.slice(0, 20)}...</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>

      </div>

      {/* ─── Modal: Create Footage Requisition Ticket ─────────────────── */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-[#101626] border-white/10 text-slate-100'
          }`}>
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-[#151c30]">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <h3 className="font-bold text-sm text-slate-100">Lodge Inter-Department CCTV Footage Requisition</h3>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Requisition Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Traffic Collision Evidence on SG Highway Junction"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">CCTV Camera *</label>
                  <select
                    required
                    value={createForm.cameraId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const cam = camerasList.find((c) => c.cameraId === cid || c._id === cid);
                      setCreateForm((p) => ({
                        ...p,
                        cameraId: cid,
                        targetDepartment: cam?.departmentName || 'Gujarat Police Department',
                      }));
                    }}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  >
                    <option value="">Select Camera...</option>
                    {camerasList.map((c) => (
                      <option key={c._id} value={c.cameraId}>
                        {c.name || c.cameraId} — {c.locationName || c.district}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm((p) => ({ ...p, priority: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Footage Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={createForm.startTime}
                    onChange={(e) => setCreateForm((p) => ({ ...p, startTime: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Footage End Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={createForm.endTime}
                    onChange={(e) => setCreateForm((p) => ({ ...p, endTime: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">FIR / CR Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. CR-I/102/2026"
                    value={createForm.firNumber}
                    onChange={(e) => setCreateForm((p) => ({ ...p, firNumber: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Incident Type</label>
                  <select
                    value={createForm.incidentType}
                    onChange={(e) => setCreateForm((p) => ({ ...p, incidentType: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                  >
                    <option value="Criminal Investigation">Criminal Investigation</option>
                    <option value="Traffic Violation">Traffic Violation</option>
                    <option value="Accident Analysis">Accident Analysis</option>
                    <option value="Public Safety">Public Safety</option>
                    <option value="VIP Security">VIP Security</option>
                    <option value="Missing Person">Missing Person</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Legal Purpose &amp; Justification *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detail the official legal justification for requisitioning this CCTV footage..."
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm((p) => ({ ...p, purpose: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="compliance"
                  checked={createForm.acknowledgedCompliance}
                  onChange={(e) => setCreateForm((p) => ({ ...p, acknowledgedCompliance: e.target.checked }))}
                  className="mt-0.5"
                />
                <label htmlFor="compliance" className="text-[11px] text-amber-300 leading-relaxed cursor-pointer">
                  I certify that this requisition is made pursuant to lawful state authority under the Evidence Act. All footage will be maintained confidentially within legal chain of custody.
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Submit Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Reject Requisition ──────────────────────────────── */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-[#121727] text-slate-100 p-5 space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-rose-400">Reject Footage Requisition</h3>
            <p className="text-xs text-slate-400">
              Please document the official reason for rejecting this footage request. This will be recorded permanently in the legal audit log.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Camera feed out of range, recording window deleted per policy, or insufficient legal clearance..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none focus:border-rose-500"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-slate-300 font-bold"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (rejectionReason.trim()) {
                    updateStatusMutation.mutate({
                      id: selectedTicket.ticketId,
                      status: 'Rejected',
                      rejectionReason,
                    });
                  } else {
                    toast.error('Please enter a rejection reason');
                  }
                }}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs text-white font-bold"
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
