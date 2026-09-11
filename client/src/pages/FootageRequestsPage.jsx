import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { footageTicketAPI, cameraAPI } from '../api';
import useAuthStore from '../store/authStore';
import useSocketStore from '../store/socketStore';
import { useThemeStore } from '../store/themeStore';
import toast from 'react-hot-toast';
import CCTVVideoPlayer from '../components/evidence/CCTVVideoPlayer';
import FootageTimeWindowPicker from '../components/common/FootageTimeWindowPicker';
import SearchableCameraSelect from '../components/common/SearchableCameraSelect';
import {
  FileText, Plus, Shield, Search, Filter, RotateCcw,
  CheckCircle2, Clock, XCircle, Send, Download, ExternalLink,
  ChevronRight, Calendar, User, Building, MapPin, Hash,
  AlertTriangle, Lock, Eye, Copy, Info, Check, ArrowDownLeft,
  ArrowUpRight, Globe, FileCheck, Layers, X, Video, MessageSquare,
  Upload, ShieldCheck, ShieldAlert, Play, RefreshCw, Cpu,
  ArrowRight, Landmark
} from 'lucide-react';

const STATUS_CONFIG = {
  PENDING_ADMIN_REVIEW: {
    label: 'Pending Nodal Review',
    badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30',
    dot: 'bg-amber-500',
  },
  PENDING_CLARIFICATION: {
    label: 'Clarification Requested',
    badgeClass: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30',
    dot: 'bg-orange-500',
  },
  ROUTED_TO_DEPARTMENT: {
    label: 'Routed to Department',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    dot: 'bg-blue-500',
  },
  ACKNOWLEDGED: {
    label: 'Dept Acknowledged',
    badgeClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30',
    dot: 'bg-teal-500',
  },
  ASSIGNED: {
    label: 'Operator Assigned',
    badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30',
    dot: 'bg-purple-500',
  },
  IN_PROGRESS: {
    label: 'Preparation In Progress',
    badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
    dot: 'bg-indigo-500',
  },
  EVIDENCE_UPLOADED: {
    label: 'Evidence Uploaded',
    badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    dot: 'bg-emerald-500',
  },
  AVAILABLE: {
    label: 'Evidence Available',
    badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  VIEWED: {
    label: 'Evidence Viewed',
    badgeClass: 'bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30',
    dot: 'bg-violet-400',
  },
  COMPLETED: {
    label: 'Completed & Certified',
    badgeClass: 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40',
    dot: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Rejected',
    badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30',
    dot: 'bg-rose-500',
  },
  // Legacy mappings
  Pending: { label: 'Pending Nodal Review', badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  Accepted: { label: 'Dept Acknowledged', badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', dot: 'bg-blue-500' },
  Processing: { label: 'Preparation In Progress', badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', dot: 'bg-indigo-500' },
  'Evidence Uploaded': { label: 'Evidence Uploaded', badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-500' },
  Available: { label: 'Evidence Available', badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
  Viewed: { label: 'Evidence Viewed', badgeClass: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30', dot: 'bg-purple-400' },
  Responded: { label: 'Responded', badgeClass: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30', dot: 'bg-teal-400' },
  Closed: { label: 'Completed & Certified', badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
  Rejected: { label: 'Rejected', badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', dot: 'bg-rose-500' },
  submitted: { label: 'Pending Nodal Review', badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', dot: 'bg-amber-500' },
  under_review: { label: 'Dept Acknowledged', badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', dot: 'bg-blue-500' },
  approved: { label: 'Preparation In Progress', badgeClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30', dot: 'bg-indigo-500' },
  dispatched: { label: 'Evidence Available', badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', dot: 'bg-blue-400' },
  closed: { label: 'Completed & Certified', badgeClass: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30', dot: 'bg-slate-400' },
  rejected: { label: 'Rejected', badgeClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', dot: 'bg-rose-500' },
};

const PRIORITY_CONFIG = {
  urgent: { label: 'URGENT', tw: 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30' },
  high:   { label: 'HIGH',   tw: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  medium: { label: 'MEDIUM', tw: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
  low:    { label: 'LOW',    tw: 'bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-500/30' },
};

const STANDARD_DEPARTMENTS = [
  'Gujarat Police Department',
  'Gujarat Traffic Police',
  'Gujarat Home Department',
  'Gandhinagar Police Command',
  'Surat City Police',
  'Vadodara Police Department',
  'Rajkot Police Department',
];

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
  const [direction, setDirection] = useState(isAdmin ? 'all' : 'incoming'); // 'incoming' | 'outgoing' | 'all'
  const [activeQueue, setActiveQueue] = useState(isAdmin ? 'central_review' : 'all'); // 'all' | 'central_review' | 'supervisor' | 'operator' | 'requester'
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Selected ticket for modal
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'evidence' | 'responses' | 'audit'

  // Modals & Form State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [responseText, setResponseText] = useState('');
  const [copiedKey, setCopiedKey] = useState(null);

  // Government Workflow Modals State
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approveRemarks, setApproveRemarks] = useState('');
  const [targetDeptOverride, setTargetDeptOverride] = useState('');

  const [isClarifyModalOpen, setIsClarifyModalOpen] = useState(false);
  const [clarifyQuestion, setClarifyQuestion] = useState('');

  const [isRespondClarifyModalOpen, setIsRespondClarifyModalOpen] = useState(false);
  const [clarifyResponseText, setClarifyResponseText] = useState('');

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [assignmentRemarks, setAssignmentRemarks] = useState('');

  const [isEvidencePackageOpen, setIsEvidencePackageOpen] = useState(false);
  const [evidencePackageData, setEvidencePackageData] = useState(null);
  const [isPackageLoading, setIsPackageLoading] = useState(false);

  // Evidence upload state
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadRemarks, setUploadRemarks] = useState('');
  const [uploadedCameraId, setUploadedCameraId] = useState('');
  const [cameraOverrideReason, setCameraOverrideReason] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  // Integrity report state
  const [integrityReport, setIntegrityReport] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  // Read ticket parameter or footage request candidate parameters from URL
  useEffect(() => {
    const tParam = searchParams.get('ticket') || searchParams.get('ticketId');
    if (tParam) {
      setSelectedTicketId(tParam);
      setIsDetailModalOpen(true);
      return;
    }

    const reqCam = searchParams.get('requestCam') || searchParams.get('cameras');
    const incId = searchParams.get('incidentId');
    const incTitle = searchParams.get('incidentTitle');
    if (reqCam || incId) {
      setIsCreateModalOpen(true);
      const camListParsed = reqCam ? reqCam.split(',').map((c) => c.trim()).filter(Boolean) : [];
      const primaryCam = camListParsed[0] || '';
      setCreateForm((prev) => ({
        ...prev,
        cameraId: primaryCam || prev.cameraId,
        title: incTitle
          ? `Footage Evidence for Incident #${incId}: ${incTitle}`
          : primaryCam
          ? `Footage Request for CCTV Camera ${primaryCam}`
          : prev.title,
        description: incId
          ? `Surveillance evidence requisition automatically populated from GIS Incident #${incId}. Candidate cameras: ${reqCam || 'surrounding cluster'}.`
          : prev.description,
        firNumber: incId ? `INC-${incId}` : prev.firNumber,
        selectedCameras: camListParsed.length > 0 ? camListParsed : prev.selectedCameras,
      }));
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
    queryKey: ['footage-tickets', direction, activeQueue, statusFilter, priorityFilter, search],
    queryFn: () =>
      footageTicketAPI
        .getAll({
          direction,
          queue: activeQueue !== 'all' ? activeQueue : undefined,
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
    enabled: Boolean(selectedTicketId) && isDetailModalOpen,
  });

  const { data: responsesData, isLoading: isResponsesLoading } = useQuery({
    queryKey: ['footage-ticket-responses', selectedTicketId],
    queryFn: () => footageTicketAPI.getResponses(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId) && isDetailModalOpen,
  });

  const { data: auditLogsData, isLoading: isLogsLoading } = useQuery({
    queryKey: ['footage-ticket-audit-logs', selectedTicketId],
    queryFn: () => footageTicketAPI.getAuditLogs(selectedTicketId).then((r) => r.data.data),
    enabled: Boolean(selectedTicketId) && isDetailModalOpen,
  });

  const { data: departmentOperators = [] } = useQuery({
    queryKey: ['department-operators'],
    queryFn: () => footageTicketAPI.getDepartmentOperators().then((r) => r.data.data || []),
    enabled: isAssignModalOpen,
  });

  const { data: camerasList = [] } = useQuery({
    queryKey: ['cameras-short-list'],
    queryFn: () => cameraAPI.getAll({ limit: 0 }).then((r) => r.data.data || []),
    enabled: isCreateModalOpen || Boolean(searchParams.get('requestCam')),
    staleTime: 300000,
  });

  const tickets = ticketsData?.data || [];

  // Double-layer mutual exclusivity partitioning for workflow direction tabs
  const displayedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (direction === 'all' || activeQueue === 'central_review') return true;

      const cleanUserDept = (userDept || '').toLowerCase().trim();
      const cleanReqDept = (t.requestingDepartment || '').toLowerCase().trim();
      const cleanTargetDept = (t.targetDepartment || '').toLowerCase().trim();

      const isUserTraffic = cleanUserDept.includes('traffic') || userRole === 'TRAFFIC_POLICE';
      const isUserHome = cleanUserDept.includes('home') || isAdmin;
      const isUserGeneralPolice = !isUserTraffic && !isUserHome && cleanUserDept.includes('police');

      const isReqTraffic = cleanReqDept.includes('traffic');
      const isTargetTraffic = cleanTargetDept.includes('traffic');

      const isReqGeneralPolice = !isReqTraffic && cleanReqDept.includes('police');
      const isTargetGeneralPolice = !isTargetTraffic && cleanTargetDept.includes('police');

      if (direction === 'incoming') {
        if (isUserTraffic) {
          return isTargetTraffic && !isReqTraffic;
        }
        if (isAdmin) {
          return !cleanReqDept.includes('home');
        }
        if (isUserGeneralPolice) {
          return isTargetGeneralPolice && !isReqGeneralPolice;
        }
        return cleanTargetDept.includes(cleanUserDept) && !cleanReqDept.includes(cleanUserDept);
      }

      if (direction === 'outgoing') {
        if (isUserTraffic) {
          return isReqTraffic && !isTargetTraffic;
        }
        if (isAdmin) {
          return cleanReqDept.includes('home') || t.requestedBy?._id === user?._id;
        }
        if (isUserGeneralPolice) {
          return isReqGeneralPolice && !isTargetGeneralPolice;
        }
        return cleanReqDept.includes(cleanUserDept) && !cleanTargetDept.includes(cleanUserDept);
      }

      return true;
    });
  }, [tickets, direction, userDept, userRole, user?._id, isAdmin]);

  const stats = statsData || {
    total: 0,
    pendingAction: 0,
    pendingAdmin: 0,
    routed: 0,
    acknowledged: 0,
    assigned: 0,
    inProgress: 0,
    evidenceUploaded: 0,
    available: 0,
    completed: 0,
    rejected: 0,
    slaBreachedCount: 0,
  };
  const responses = responsesData || [];
  const auditLogs = auditLogsData || [];

  // Government Workflow Mutations:
  const approveMutation = useMutation({
    mutationFn: ({ id, remarks, targetDepartmentOverride }) =>
      footageTicketAPI.approve(id, { remarks, targetDepartmentOverride }),
    onSuccess: () => {
      toast.success('Requisition approved and routed to Target Department');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsApproveModalOpen(false);
      setApproveRemarks('');
      setTargetDeptOverride('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Approval failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => footageTicketAPI.reject(id, { reason }),
    onSuccess: () => {
      toast.success('Requisition rejected and logged in official audit');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsRejectModalOpen(false);
      setRejectionReason('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Rejection failed'),
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id) => footageTicketAPI.acknowledge(id),
    onSuccess: () => {
      toast.success('Requisition receipt acknowledged by Supervisor');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Acknowledgment failed'),
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, operatorId, remarks }) =>
      footageTicketAPI.assign(id, { operatorId, remarks }),
    onSuccess: () => {
      toast.success('Operator assigned successfully to extract footage');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsAssignModalOpen(false);
      setSelectedOperatorId('');
      setAssignmentRemarks('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Assignment failed'),
  });

  const clarifyMutation = useMutation({
    mutationFn: ({ id, question }) => footageTicketAPI.requestClarification(id, { question }),
    onSuccess: () => {
      toast.success('Clarification inquiry sent to requesting officer');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsClarifyModalOpen(false);
      setClarifyQuestion('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Clarification request failed'),
  });

  const respondClarifyMutation = useMutation({
    mutationFn: ({ id, response }) => footageTicketAPI.respondClarification(id, { response }),
    onSuccess: () => {
      toast.success('Clarification response submitted. Requisition returned to Central Review.');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
      setIsRespondClarifyModalOpen(false);
      setClarifyResponseText('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Response submission failed'),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, remarks }) => footageTicketAPI.complete(id, { remarks }),
    onSuccess: () => {
      toast.success('Requisition completed, certified, and officially archived');
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      queryClient.invalidateQueries(['footage-ticket-detail', selectedTicketId]);
      queryClient.invalidateQueries(['footage-ticket-audit-logs', selectedTicketId]);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Completion failed'),
  });

  const handleOpenEvidencePackage = async () => {
    if (!selectedTicket?.ticketId) return;
    setIsPackageLoading(true);
    setIsEvidencePackageOpen(true);
    try {
      const res = await footageTicketAPI.getEvidencePackage(selectedTicket.ticketId);
      setEvidencePackageData(res.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate court evidence certificate');
      setIsEvidencePackageOpen(false);
    } finally {
      setIsPackageLoading(false);
    }
  };

  // Status Mutation (fallback)
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

    // Camera mismatch check on frontend
    if (uploadedCameraId && uploadedCameraId.trim() && uploadedCameraId.trim() !== selectedTicket?.cameraId) {
      if (!cameraOverrideReason || cameraOverrideReason.trim().length < 5) {
        toast.error('Camera ID differs from requisition. Mandatory override reason required.');
        return;
      }
    }

    const formData = new FormData();
    formData.append('footage', selectedFile);
    if (uploadRemarks) formData.append('remarks', uploadRemarks);
    if (uploadedCameraId) formData.append('cameraId', uploadedCameraId);
    if (cameraOverrideReason) formData.append('cameraOverrideReason', cameraOverrideReason);

    setIsUploading(true);
    const toastId = toast.loading('Hashing SHA-256 & Encrypting AES-256-GCM before Cloudinary upload...');

    try {
      await footageTicketAPI.uploadEvidence(selectedTicket.ticketId, formData);
      toast.success('Footage encrypted & stored in Cloudinary evidence vault!', { id: toastId });
      setSelectedFile(null);
      setUploadRemarks('');
      setUploadedCameraId('');
      setCameraOverrideReason('');
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
    const toastId = toast.loading('Verifying cryptographic SHA-256 seal from decrypted stream...');
    try {
      const res = await footageTicketAPI.verifyEvidence(selectedTicket.ticketId, evId);
      setIntegrityReport(res.data.data);
      if (res.data.data.verified) {
        toast.success('🟢 Integrity Verified: SHA-256 checksum perfectly matches original seal!', { id: toastId });
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

  // Default to past 1 hour for quick workflow
  const defaultInitWindow = () => {
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return { start: toLocal(past), end: toLocal(now) };
  };

  const initialWindow = defaultInitWindow();
  const defaultTargetDept = (userDept || '').includes('Traffic') ? 'Gujarat Police Department' : 'Gujarat Traffic Police';

  const [createForm, setCreateForm] = useState({
    title: '',
    firNumber: '',
    caseNumber: '',
    incidentType: 'Criminal Investigation',
    priority: 'high',
    classification: 'Confidential',
    targetDepartment: defaultTargetDept,
    cameraId: '',
    startTime: initialWindow.start,
    endTime: initialWindow.end,
    purpose: '',
    description: '',
    isEmergency: false,
    emergencyReason: '',
    contactPhone: user?.phone || '+91-79-23250000',
    officialDesignation: user?.designation || 'Investigating Officer',
    acknowledgedCompliance: false,
  });

  // Auto-sync target department if camera matches a known department in camerasList
  useEffect(() => {
    if (!createForm.cameraId || !camerasList.length) return;
    const matched = camerasList.find(
      (c) => c.cameraId === createForm.cameraId || c._id === createForm.cameraId
    );
    if (matched && matched.departmentName) {
      setCreateForm((prev) => {
        if (prev.targetDepartment !== matched.departmentName) {
          return { ...prev, targetDepartment: matched.departmentName };
        }
        return prev;
      });
    }
  }, [createForm.cameraId, camerasList]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.title || !createForm.targetDepartment || !createForm.cameraId || !createForm.startTime || !createForm.endTime || !createForm.purpose) {
      toast.error('Please fill all mandatory fields including target department and camera');
      return;
    }
    if (createForm.isEmergency && (!createForm.emergencyReason || createForm.emergencyReason.trim().length < 5)) {
      toast.error('Emergency requisitions require a detailed life-safety justification (minimum 5 characters)');
      return;
    }
    if (!createForm.acknowledgedCompliance) {
      toast.error('Please accept the Official Secrets Act compliance statement');
      return;
    }

    try {
      const res = await footageTicketAPI.create(createForm);
      toast.success(
        createForm.isEmergency
          ? `🚨 EMERGENCY Requisition ${res.data.data.ticketId} routed directly to ${createForm.targetDepartment}`
          : `Requisition ticket ${res.data.data.ticketId} submitted to Central Control Room`
      );
      queryClient.invalidateQueries(['footage-tickets']);
      queryClient.invalidateQueries(['footage-tickets-stats']);
      setIsCreateModalOpen(false);
      setSelectedTicketId(res.data.data.ticketId);
      setIsDetailModalOpen(true);
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
    if (!selectedTicket) return {};
    const cleanUserDept = (userDept || '').toLowerCase().trim();
    const cleanTargetDept = (selectedTicket.targetDepartment || '').toLowerCase().trim();
    const cleanReqDept = (selectedTicket.requestingDepartment || '').toLowerCase().trim();

    const isUserTraffic = cleanUserDept.includes('traffic') || userRole === 'TRAFFIC_POLICE';
    const isUserHome = cleanUserDept.includes('home') || isAdmin;
    const isUserGeneralPolice = !isUserTraffic && !isUserHome && cleanUserDept.includes('police');

    const isReqTraffic = cleanReqDept.includes('traffic');
    const isTargetTraffic = cleanTargetDept.includes('traffic');

    const isReqGeneralPolice = !isReqTraffic && cleanReqDept.includes('police');
    const isTargetGeneralPolice = !isTargetTraffic && cleanTargetDept.includes('police');

    // Is current user in the Target (Custodian) Department?
    const isTarget =
      !isUserHome &&
      ((isUserTraffic && isTargetTraffic) ||
       (isUserGeneralPolice && isTargetGeneralPolice) ||
       (!isUserTraffic && !isUserGeneralPolice && cleanTargetDept.includes(cleanUserDept)));

    // Is current user in the Requesting Department (or author of ticket)?
    const isRequester =
      selectedTicket.requestedBy?._id === user?._id ||
      selectedTicket.requestedBy === user?._id ||
      (!isUserHome &&
        ((isUserTraffic && isReqTraffic) ||
         (isUserGeneralPolice && isReqGeneralPolice) ||
         (!isUserTraffic && !isUserGeneralPolice && cleanReqDept.includes(cleanUserDept))));

    const st = selectedTicket.status;

    return {
      isRequester,
      isTarget,
      isAdmin,
      // Nodal Review Actions (Central Control Room Only)
      canApprove: isAdmin && ['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION', 'Pending', 'submitted'].includes(st),
      canClarify: isAdmin && ['PENDING_ADMIN_REVIEW', 'Pending', 'submitted'].includes(st),
      canRespondClarify: isRequester && st === 'PENDING_CLARIFICATION',

      // Custodian Department Actions
      canAcknowledge: isTarget && ['ROUTED_TO_DEPARTMENT', 'routed_to_department'].includes(st),
      canAssign: (isTarget || isAdmin) && ['ROUTED_TO_DEPARTMENT', 'DEPARTMENT_ACKNOWLEDGED', 'ACKNOWLEDGED', 'Accepted'].includes(st),
      canUpload: (isTarget || isAdmin) && ['ROUTED_TO_DEPARTMENT', 'DEPARTMENT_ACKNOWLEDGED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'PROCESSING', 'Accepted', 'Processing'].includes(st),

      // Requester Actions
      canComplete: (isRequester || isAdmin) && ['EVIDENCE_UPLOADED', 'AVAILABLE', 'AVAILABLE_TO_REQUESTER', 'VIEWED', 'ACCESSED', 'Evidence Uploaded', 'Available', 'Viewed'].includes(st),

      // Rejection: Strictly restricted to Admin (during Central Review) OR Target Department (during routing/fulfillment).
      // Requesting department CANNOT reject their own ticket!
      canReject: !isRequester && (
        (isAdmin && ['PENDING_ADMIN_REVIEW', 'PENDING_CLARIFICATION'].includes(st)) ||
        (isTarget && ['ROUTED_TO_DEPARTMENT', 'DEPARTMENT_ACKNOWLEDGED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'PROCESSING'].includes(st))
      ),
      canExportCertificate: Boolean(selectedTicket.evidence || selectedTicket.evidenceId),
      canViewEvidence: true,
    };
  }, [selectedTicket, userDept, isAdmin, user?._id, userRole]);

  const streamUrl = useMemo(() => {
    if (!selectedTicket) return '';
    const evId = selectedTicket.evidence?.evidenceId || selectedTicket.evidenceId;
    if (!evId) return '';
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    return `/api/footage-tickets/${selectedTicket.ticketId}/evidence/${evId}/stream?token=${encodeURIComponent(token)}`;
  }, [selectedTicket]);

  const downloadUrl = useMemo(() => {
    if (!selectedTicket) return '';
    const evId = selectedTicket.evidence?.evidenceId || selectedTicket.evidenceId;
    if (!evId) return '';
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token') || '';
    return `/api/footage-tickets/${selectedTicket.ticketId}/evidence/${evId}/download?token=${encodeURIComponent(token)}`;
  }, [selectedTicket]);

  const openTicketDetail = (ticketId) => {
    setSelectedTicketId(ticketId);
    setIsDetailModalOpen(true);
    setSearchParams({ ticket: ticketId });
  };

  const closeTicketDetail = () => {
    setIsDetailModalOpen(false);
    setSelectedTicketId(null);
    setSearchParams({});
  };

  // Reusable input class styling for high contrast in both themes
  const inputThemeClass = isLight
    ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'
    : 'bg-[#12182b] border-white/10 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20';

  return (
    <div className={`flex flex-col h-full overflow-y-auto ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0a0d14] text-slate-100'}`}>

      {/* ─── Top Header & Controls ─────────────────────────────────── */}
      <div className={`px-6 py-4 border-b shrink-0 flex flex-wrap items-center justify-between gap-4 transition-colors ${
        isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#0e1322]/90 border-white/5 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold shadow-xs">
            {isAdmin ? <Shield className="w-5 h-5 text-amber-500" /> : <FileText className="w-5 h-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className={`text-lg font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                {isAdmin
                  ? 'Manage Upcoming Footage Requests'
                  : 'CCTV Footage Requisitions & Secure Evidence Vault'}
              </h1>
              <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                isAdmin
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
              }`}>
                {isAdmin ? 'CENTRAL NODAL REVIEW CELL' : 'AES-256-GCM + CLOUDINARY'}
              </span>
            </div>
            <p className={`text-xs ${isLight ? 'text-slate-600 font-medium' : 'text-slate-400'}`}>
              {isAdmin
                ? 'Central Control Room statutory queue for vetting, authorizing, routing, and certifying inter-department CCTV footage requests'
                : 'Official inter-department requisitioning system between Police, Traffic Police & Home Dept'}
            </p>
          </div>
        </div>

        {/* Action Button: Create Requisition Ticket (Field Officers Only) */}
        {!isAdmin && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/25 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Footage Requisition</span>
          </button>
        )}
      </div>

      {/* ─── Metric Stat Cards ─────────────────────────────────────── */}
      <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0">
        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Total Requisitions</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <p className={`text-2xl font-black mt-1 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>{stats.total || 0}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">Nodal Review Pending</span>
            <Shield className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-black mt-1 text-amber-600 dark:text-amber-400">{stats.pendingAdmin || 0}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">In Preparation</span>
            <Clock className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-2xl font-black mt-1 text-purple-600 dark:text-purple-400">
            {(stats.routed || 0) + (stats.acknowledged || 0) + (stats.assigned || 0) + (stats.inProgress || 0)}
          </p>
        </div>

        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Evidence Available</span>
            <Video className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-black mt-1 text-blue-600 dark:text-blue-400">{stats.available || stats.evidenceUploaded || 0}</p>
        </div>

        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/5'}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Completed &amp; Certified</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className={`text-2xl font-black mt-1 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>{stats.completed || 0}</p>
        </div>
      </div>

      {/* SLA Breach Alert Banner if any overdue tickets exist */}
      {stats.slaBreachedCount > 0 && (
        <div className="mx-6 mb-4 px-4 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between gap-3 text-rose-500 text-xs font-bold shrink-0 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>CRITICAL SLA ALERT: {stats.slaBreachedCount} requisition(s) have breached statutory processing limits! Immediate supervisor intervention required.</span>
          </div>
          <button
            onClick={() => { setStatusFilter('all'); setPriorityFilter('urgent'); }}
            className="px-2.5 py-1 rounded bg-rose-600 text-white text-[11px] font-bold cursor-pointer hover:bg-rose-700"
          >
            Filter Overdue
          </button>
        </div>
      )}

      {/* ─── Workflow Direction & Queue Tabs & Search ───────────────── */}
      <div className="px-6 pb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className={`flex items-center gap-1.5 p-1 rounded-xl border flex-wrap ${
          isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-black/20 border-white/5'
        }`}>
          {isAdmin ? (
            /* Dedicated Admin Queue Management Tabs */
            <>
              <button
                onClick={() => { setActiveQueue('central_review'); setDirection('all'); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeQueue === 'central_review'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>📥 Manage Upcoming Requests ({stats.pendingAdmin || 0})</span>
              </button>

              <button
                onClick={() => { setActiveQueue('all'); setDirection('all'); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  direction === 'all' && activeQueue === 'all'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Master Oversight (All Statewide)</span>
              </button>

              <button
                onClick={() => { setActiveQueue('supervisor'); setDirection('incoming'); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeQueue === 'supervisor'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Supervisor Fulfillment</span>
              </button>

              <button
                onClick={() => { setActiveQueue('all'); setDirection('outgoing'); }}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  direction === 'outgoing' && activeQueue === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>Home Dept Requisitions</span>
              </button>
            </>
          ) : (
            /* Standard Field Officer Queue Tabs (Police / Traffic Police) */
            <>
              <button
                onClick={() => { setActiveQueue('all'); setDirection('incoming'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  direction === 'incoming' && activeQueue === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" />
                <span>Incoming to My Dept</span>
              </button>

              <button
                onClick={() => { setActiveQueue('all'); setDirection('outgoing'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  direction === 'outgoing' && activeQueue === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" />
                <span>My Requisitions</span>
              </button>

              <button
                onClick={() => { setActiveQueue('supervisor'); setDirection('incoming'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeQueue === 'supervisor'
                    ? 'bg-teal-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Supervisor Queue</span>
              </button>

              <button
                onClick={() => { setActiveQueue('operator'); setDirection('incoming'); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeQueue === 'operator'
                    ? 'bg-purple-600 text-white shadow-sm'
                    : isLight ? 'text-slate-700 hover:text-slate-900 hover:bg-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span>Operator Tasks</span>
              </button>
            </>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search Ticket ID, Camera, FIR, Dept..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs rounded-xl border outline-none ${inputThemeClass}`}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`text-xs px-3 py-2 rounded-xl border outline-none font-medium cursor-pointer ${inputThemeClass}`}
          >
            <option value="all">All Statuses</option>
            <option value="PENDING_ADMIN_REVIEW">Pending Nodal Review</option>
            <option value="PENDING_CLARIFICATION">Clarification Requested</option>
            <option value="ROUTED_TO_DEPARTMENT">Routed to Dept</option>
            <option value="ACKNOWLEDGED">Dept Acknowledged</option>
            <option value="ASSIGNED">Operator Assigned</option>
            <option value="IN_PROGRESS">Preparation In Progress</option>
            <option value="EVIDENCE_UPLOADED">Evidence Uploaded</option>
            <option value="AVAILABLE">Evidence Available</option>
            <option value="VIEWED">Evidence Viewed</option>
            <option value="COMPLETED">Completed &amp; Certified</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      {/* ─── Main Requisition List (Full-Width Clean Table/Cards) ───── */}
      <div className="px-6 pb-6 flex-1 min-h-0">
        <div className={`rounded-2xl border overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#0f1422] border-white/5'
        }`}>
          
          <div className={`p-4 border-b flex items-center justify-between text-xs font-bold ${
            isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-black/20 border-white/5 text-slate-400'
          }`}>
            <div className="flex items-center gap-2">
              <span>{isAdmin && activeQueue === 'central_review' ? 'Upcoming Requisitions Queue' : 'Requisitions Log'}</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                {displayedTickets.length} records
              </span>
            </div>
            <span className="text-[11px] font-semibold text-slate-500">
              Active Context: <span className="font-bold text-blue-600 dark:text-blue-400">{isAdmin ? 'Central Control Room (Nodal Authority)' : userDept}</span>
            </span>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-white/5 overflow-x-auto">
            {isTicketsLoading ? (
              <div className="p-12 text-center text-xs text-slate-500 font-semibold">Loading CCTV requisitions...</div>
            ) : displayedTickets.length === 0 ? (
              <div className="p-16 text-center">
                <FileText className="w-12 h-12 text-slate-400 dark:text-slate-600 mx-auto mb-3" />
                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {isAdmin && activeQueue === 'central_review'
                    ? 'No Upcoming Requisitions Pending Review'
                    : 'No Requisitions in this category'}
                </h3>
                <p className={`text-xs mt-1 max-w-sm mx-auto ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {isAdmin && activeQueue === 'central_review'
                    ? 'All incoming inter-department CCTV footage requests have been processed.'
                    : direction === 'incoming'
                    ? 'No pending footage requisitions assigned to your department right now.'
                    : isAdmin
                    ? 'No requisitions currently in this queue.'
                    : 'You have not submitted any footage requisitions yet. Click "New Footage Requisition" above.'}
                </p>
              </div>
            ) : (
              displayedTickets.map((t) => {
                const statusInfo = STATUS_CONFIG[t.status] || STATUS_CONFIG.Pending;
                const priorityInfo = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.medium;

                return (
                  <div
                    key={t._id}
                    className={`p-5 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      isLight ? 'hover:bg-blue-50/40' : 'hover:bg-white/3'
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="font-mono text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-1 rounded-md border border-blue-500/20">
                          {t.ticketId}
                        </span>
                        <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${statusInfo.badgeClass}`}>
                          {statusInfo.label}
                        </span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded border uppercase ${priorityInfo.tw}`}>
                          {priorityInfo.label}
                        </span>
                        {t.isEmergency && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-600 text-white animate-pulse flex items-center gap-1 shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                            <AlertTriangle className="w-3 h-3" />
                            <span>EMERGENCY BYPASS</span>
                          </span>
                        )}
                        {t.dueAt && !['COMPLETED', 'REJECTED', 'Closed', 'Rejected'].includes(t.status) && (
                          <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
                            t.isOverdue || t.slaStatus === 'BREACHED'
                              ? 'bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse'
                              : (t.slaRemainingMinutes !== undefined && t.slaRemainingMinutes < 120)
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          }`}>
                            <Clock className="w-2.5 h-2.5" />
                            <span>
                              {t.isOverdue || t.slaStatus === 'BREACHED'
                                ? 'SLA BREACHED'
                                : t.slaRemainingMinutes !== undefined
                                ? `SLA: ${Math.floor(t.slaRemainingMinutes / 60)}h ${t.slaRemainingMinutes % 60}m`
                                : 'SLA ACTIVE'}
                            </span>
                          </span>
                        )}
                        {t.assignedOperatorName && (
                          <span className="text-[11px] font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 flex items-center gap-1">
                            <User className="w-2.5 h-2.5" />
                            <span>Operator: {t.assignedOperatorName}</span>
                          </span>
                        )}
                        {t.firNumber && (
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                            isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
                          }`}>
                            FIR: {t.firNumber}
                          </span>
                        )}
                        {t.evidence && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            <span>Footage Uploaded</span>
                          </span>
                        )}
                      </div>

                      <h3 className={`text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                        {t.title}
                      </h3>

                      {/* Department Routing Visualizer */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building className="w-3.5 h-3.5 text-blue-500" />
                          <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>From:</span>
                          <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            {t.requestingDepartment}
                          </span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building className="w-3.5 h-3.5 text-emerald-500" />
                          <span className={isLight ? 'text-slate-600' : 'text-slate-400'}>To:</span>
                          <span className={`font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                            {t.targetDepartment}
                          </span>
                        </div>
                      </div>

                      {/* Camera & Time Info */}
                      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1 ${
                        isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{t.cameraName || t.cameraId} ({t.locationName})</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {new Date(t.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({t.durationMinutes} mins)</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>By: {t.requestedBy?.name || 'Authorized Officer'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Open Ticket Button */}
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => openTicketDetail(t.ticketId)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shadow-xs ${
                          isLight
                            ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-600 hover:text-white'
                            : 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-600 hover:text-white'
                        }`}
                      >
                        <Eye className="w-4 h-4" />
                        <span>Open Requisition &amp; Evidence</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL: DEDICATED TICKET DETAIL DIALOG (Spacious & Centered) ── */}
      {isDetailModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-5xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
            isLight ? 'bg-white border-slate-300 text-slate-900 shadow-slate-900/30' : 'bg-[#0e1424] border-white/15 text-slate-100 shadow-black/80'
          }`}>
            
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex flex-wrap items-center justify-between gap-4 shrink-0 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151c30] border-white/10'
            }`}>
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-black text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-md border border-blue-500/20">
                    {selectedTicket?.ticketId || selectedTicketId}
                  </span>
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                    STATUS_CONFIG[selectedTicket?.status]?.badgeClass || 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {STATUS_CONFIG[selectedTicket?.status]?.label || selectedTicket?.status}
                  </span>
                  {selectedTicket?.firNumber && (
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      isLight ? 'bg-white border-slate-300 text-slate-700' : 'bg-white/5 border-white/10 text-slate-300'
                    }`}>
                      FIR: {selectedTicket.firNumber}
                    </span>
                  )}
                </div>
                <h2 className={`text-base font-black mt-1.5 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  {selectedTicket?.title || 'Loading requisition details...'}
                </h2>
              </div>

              {/* Action Buttons & Close */}
              <div className="flex flex-wrap items-center gap-2">
                {ticketPerms.canApprove && (
                  <button
                    onClick={() => {
                      setTargetDeptOverride(selectedTicket.targetDepartment || '');
                      setIsApproveModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Approve &amp; Route</span>
                  </button>
                )}

                {ticketPerms.canClarify && (
                  <button
                    onClick={() => setIsClarifyModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-orange-500/20 text-orange-400 hover:bg-orange-600 hover:text-white border border-orange-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Request Clarification</span>
                  </button>
                )}

                {ticketPerms.canRespondClarify && (
                  <button
                    onClick={() => setIsRespondClarifyModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Submit Clarification</span>
                  </button>
                )}

                {ticketPerms.canAcknowledge && (
                  <button
                    onClick={() => acknowledgeMutation.mutate(selectedTicket.ticketId)}
                    disabled={acknowledgeMutation.isLoading}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Acknowledge Receipt</span>
                  </button>
                )}

                {ticketPerms.canAssign && (
                  <button
                    onClick={() => setIsAssignModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <User className="w-3.5 h-3.5" />
                    <span>Assign Operator</span>
                  </button>
                )}

                {ticketPerms.canUpload && !selectedTicket.evidence && (
                  <button
                    onClick={() => setDetailTab('evidence')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload Footage</span>
                  </button>
                )}

                {ticketPerms.canComplete && (
                  <button
                    onClick={() => completeMutation.mutate({ id: selectedTicket.ticketId })}
                    disabled={completeMutation.isLoading}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Mark Completed &amp; Certified</span>
                  </button>
                )}

                {ticketPerms.canExportCertificate && (
                  <button
                    onClick={handleOpenEvidencePackage}
                    disabled={isPackageLoading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Sec 65B Certificate</span>
                  </button>
                )}

                {ticketPerms.canReject && (
                  <button
                    onClick={() => setIsRejectModalOpen(true)}
                    className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-600 hover:text-white dark:bg-rose-600/20 dark:text-rose-400 dark:border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
                  >
                    Reject
                  </button>
                )}

                <button
                  onClick={closeTicketDetail}
                  className={`p-2 rounded-xl transition-all cursor-pointer ${
                    isLight ? 'text-slate-500 hover:bg-slate-200 hover:text-slate-900' : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                  title="Close Dialog"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Tab Switcher */}
            <div className={`px-6 border-b flex items-center gap-6 text-xs font-bold shrink-0 ${
              isLight ? 'bg-white border-slate-200 text-slate-600' : 'bg-black/30 border-white/5 text-slate-400'
            }`}>
              <button
                onClick={() => setDetailTab('overview')}
                className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  detailTab === 'overview'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Requisition Overview</span>
              </button>

              <button
                onClick={() => setDetailTab('evidence')}
                className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  detailTab === 'evidence'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>Secure Evidence Vault</span>
                {selectedTicket?.evidence && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
                )}
              </button>

              <button
                onClick={() => setDetailTab('responses')}
                className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  detailTab === 'responses'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Case Responses &amp; Discussion</span>
                {responses.length > 0 && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                    isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/10 text-slate-300'
                  }`}>
                    {responses.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setDetailTab('audit')}
                className={`py-3.5 border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                  detailTab === 'audit'
                    ? 'border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                    : 'border-transparent hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Forensic Chain of Custody</span>
              </button>
            </div>

            {/* Modal Body Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {isDetailLoading || !selectedTicket ? (
                <div className="p-16 text-center text-xs text-slate-500 font-semibold">
                  Loading requisition details...
                </div>
              ) : (
                <>
                  {/* TAB 1: OVERVIEW */}
                  {detailTab === 'overview' && (
                    <div className="space-y-5">
                      {/* Emergency Banner if Applicable */}
                      {selectedTicket.isEmergency && (
                        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/40 text-xs text-red-400 space-y-1">
                          <div className="flex items-center gap-2 font-black text-red-500">
                            <AlertTriangle className="w-4 h-4 animate-bounce" />
                            <span>🚨 EMERGENCY REQUISITION BYPASS ACTIVATED</span>
                          </div>
                          <p className="text-slate-300">
                            This ticket bypassed standard Central Control Room review under emergency life-safety protocols.
                          </p>
                          <p className="font-mono text-red-300">
                            <strong>Official Justification:</strong> {selectedTicket.emergencyReason}
                          </p>
                        </div>
                      )}

                      {/* SLA Progress & Countdown Card */}
                      {selectedTicket.dueAt && (
                        <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                          selectedTicket.isOverdue || selectedTicket.slaStatus === 'BREACHED'
                            ? 'bg-rose-500/10 border-rose-500/30'
                            : (selectedTicket.slaRemainingMinutes !== undefined && selectedTicket.slaRemainingMinutes < 120)
                            ? 'bg-amber-500/10 border-amber-500/30'
                            : isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
                        }`}>
                          <div className="flex items-center gap-3">
                            <Clock className={`w-5 h-5 ${
                              selectedTicket.isOverdue ? 'text-rose-500 animate-spin' : 'text-blue-500'
                            }`} />
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs">Statutory SLA Window</span>
                                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                                  selectedTicket.isOverdue
                                    ? 'bg-rose-500 text-white'
                                    : 'bg-emerald-500/20 text-emerald-400'
                                }`}>
                                  {selectedTicket.isOverdue ? 'OVERDUE / BREACHED' : 'ON TRACK'}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                Due At: <strong>{new Date(selectedTicket.dueAt).toLocaleString()}</strong>
                              </p>
                            </div>
                          </div>
                          <div className="font-mono text-right text-xs">
                            <span className="text-slate-500 block text-[10px]">REMAINING</span>
                            <span className="text-sm font-black">
                              {selectedTicket.isOverdue
                                ? 'EXPIRED'
                                : selectedTicket.slaRemainingMinutes !== undefined
                                ? `${Math.floor(selectedTicket.slaRemainingMinutes / 60)}h ${selectedTicket.slaRemainingMinutes % 60}m`
                                : `${selectedTicket.slaMinutes || 1440}m SLA`}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Department Context Cards */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Requesting Context */}
                        <div className={`p-4 rounded-2xl border ${
                          isLight ? 'bg-blue-50/40 border-blue-200' : 'bg-white/3 border-white/5'
                        }`}>
                          <p className="text-xs font-black uppercase text-blue-600 dark:text-blue-400 tracking-wider mb-2.5">
                            Requesting Authority
                          </p>
                          <div className={`space-y-1.5 text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            <p><span className="text-slate-500 font-medium">Department:</span> <strong className="font-bold">{selectedTicket.requestingDepartment}</strong></p>
                            <p><span className="text-slate-500 font-medium">Officer:</span> {selectedTicket.requestedBy?.name} ({selectedTicket.officialDesignation || 'Inspector'})</p>
                            <p><span className="text-slate-500 font-medium">Contact:</span> {selectedTicket.contactPhone || selectedTicket.requestedBy?.email}</p>
                          </div>
                        </div>

                        {/* Target Context */}
                        <div className={`p-4 rounded-2xl border ${
                          isLight ? 'bg-emerald-50/40 border-emerald-200' : 'bg-white/3 border-white/5'
                        }`}>
                          <p className="text-xs font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider mb-2.5">
                            Target Department (Custodian)
                          </p>
                          <div className={`space-y-1.5 text-xs ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                            <p><span className="text-slate-500 font-medium">Department:</span> <strong className="font-bold">{selectedTicket.targetDepartment}</strong></p>
                            <p><span className="text-slate-500 font-medium">Camera:</span> {selectedTicket.cameraName} ({selectedTicket.cameraId})</p>
                            <p><span className="text-slate-500 font-medium">Location:</span> {selectedTicket.locationName}, {selectedTicket.district}</p>
                            {selectedTicket.assignedOperatorName && (
                              <p><span className="text-purple-400 font-bold">Assigned Operator:</span> <strong>{selectedTicket.assignedOperatorName}</strong></p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Nodal Control Room Approval / Review Details */}
                      {selectedTicket.approval?.approvedByName && (
                        <div className={`p-4 rounded-2xl border ${
                          isLight ? 'bg-emerald-50/30 border-emerald-200' : 'bg-emerald-500/5 border-emerald-500/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" />
                            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                              Central Control Room Nodal Authorization
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <span className="text-slate-500 text-[11px]">Authorized By:</span>
                              <p className="font-bold mt-0.5">{selectedTicket.approval.approvedByName}</p>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[11px]">Approval Date:</span>
                              <p className="font-bold mt-0.5">{new Date(selectedTicket.approval.approvedAt).toLocaleString()}</p>
                            </div>
                            <div>
                              <span className="text-slate-500 text-[11px]">Routing Instructions:</span>
                              <p className="font-bold mt-0.5">{selectedTicket.approval.remarks || 'Standard Routing'}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Clarification Box if Active */}
                      {selectedTicket.clarification?.question && (
                        <div className={`p-4 rounded-2xl border ${
                          selectedTicket.clarification.status === 'answered'
                            ? 'bg-blue-500/10 border-blue-500/20'
                            : 'bg-orange-500/10 border-orange-500/30 animate-pulse'
                        }`}>
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-orange-400" />
                            <span className="text-xs font-bold text-orange-400 uppercase tracking-wider">
                              Clarification Inquiry from Nodal Officer
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-200 mb-2">
                            "{selectedTicket.clarification.question}"
                          </p>
                          {selectedTicket.clarification.response ? (
                            <div className="pt-2 border-t border-white/10 text-xs">
                              <span className="text-slate-400 text-[11px]">Response Provided:</span>
                              <p className="text-emerald-300 font-bold mt-0.5">"{selectedTicket.clarification.response}"</p>
                            </div>
                          ) : (
                            <p className="text-[11px] text-orange-400 italic">
                              Awaiting response from requesting officer.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Time Duration Window */}
                      <div className={`p-4 rounded-2xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
                      }`}>
                        <p className={`text-xs font-black uppercase tracking-wider mb-3 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                          Footage Duration Window
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                          <div>
                            <p className="text-slate-500 text-[11px] font-medium">Start Time</p>
                            <p className={`font-bold mt-1 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                              {new Date(selectedTicket.startTime).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-[11px] font-medium">End Time</p>
                            <p className={`font-bold mt-1 ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                              {new Date(selectedTicket.endTime).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-[11px] font-medium">Calculated Duration</p>
                            <p className="font-black text-amber-600 dark:text-amber-400 mt-1">
                              {selectedTicket.durationMinutes || 0} Minutes
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Legal Justification */}
                      <div className={`p-4 rounded-2xl border ${
                        isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
                      }`}>
                        <p className={`text-xs font-black uppercase tracking-wider mb-2 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                          Investigation Purpose &amp; Legal Justification
                        </p>
                        <p className={`text-xs leading-relaxed whitespace-pre-wrap font-medium ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                          {selectedTicket.purpose || selectedTicket.description}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: SECURE EVIDENCE VAULT */}
                  {detailTab === 'evidence' && (
                    <div className="space-y-5">
                      {selectedTicket.evidence ? (
                        <div className="space-y-4">
                          
                          {/* Integrity Seal Card */}
                          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 transition-all ${
                            isLight
                              ? 'bg-gradient-to-r from-emerald-50/90 to-teal-50/60 border-emerald-300/90 shadow-xs'
                              : 'bg-emerald-500/10 border-emerald-500/25'
                          }`}>
                            <div className="flex items-center gap-3.5">
                              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                isLight
                                  ? 'bg-emerald-100 border border-emerald-300 text-emerald-800 shadow-xs'
                                  : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                              }`}>
                                <ShieldCheck className="w-6 h-6" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className={`font-black text-sm ${isLight ? 'text-emerald-950' : 'text-emerald-400'}`}>
                                    🟢 Integrity Verified (SHA-256 Validated)
                                  </span>
                                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                                    isLight
                                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                      : 'bg-emerald-500/20 text-emerald-300 font-bold'
                                  }`}>
                                    AES-256-GCM
                                  </span>
                                </div>
                                <p className={`text-xs mt-1 ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
                                  Evidence ID: <strong className={`font-mono font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{selectedTicket.evidence.evidenceId}</strong> · <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Cloudinary Vault Storage</span>
                                </p>
                              </div>
                            </div>

                            <button
                              onClick={handleVerifyIntegrity}
                              disabled={isVerifying}
                              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                                isLight
                                  ? 'bg-white text-slate-800 hover:text-emerald-800 border-slate-300 hover:border-emerald-400 hover:bg-emerald-50/60 shadow-xs'
                                  : 'bg-white/10 hover:bg-white/15 text-slate-200 border-white/10'
                              }`}
                            >
                              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin text-emerald-500' : ''}`} />
                              <span>Re-verify Checksum</span>
                            </button>
                          </div>

                          {/* Advanced Forensic CCTV Video Player */}
                          <CCTVVideoPlayer
                            ticket={selectedTicket}
                            evidence={selectedTicket.evidence}
                            streamUrl={streamUrl}
                            downloadUrl={downloadUrl}
                            onVerifyIntegrity={handleVerifyIntegrity}
                            isVerifying={isVerifying}
                          />

                          {/* Cryptographic Parameters */}
                          <div className={`p-4 rounded-2xl border space-y-3 text-xs ${
                            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/3 border-white/5'
                          }`}>
                            <p className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-400'}`}>
                              Cryptographic Parameters &amp; Cloudinary Evidence Record
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              <div>
                                <span className={isLight ? 'text-slate-600 font-semibold' : 'text-slate-500 font-medium'}>Original Video SHA-256 Checksum:</span>
                                <div className={`flex items-center justify-between gap-2 mt-1.5 font-mono text-[11px] px-3 py-2 rounded-xl border ${
                                  isLight ? 'bg-slate-50 border-slate-200 text-emerald-800' : 'bg-black/40 border-white/10 text-emerald-400'
                                }`}>
                                  <span className="truncate font-bold">{selectedTicket.evidence.sha256Hash}</span>
                                  <button
                                    onClick={() => copyText(selectedTicket.evidence.sha256Hash, 'sha256')}
                                    title="Copy Checksum"
                                    className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded transition-colors"
                                  >
                                    <Copy className="w-3.5 h-3.5 text-slate-500 hover:text-slate-900 dark:hover:text-white" />
                                  </button>
                                </div>
                              </div>
                              <div>
                                <span className={isLight ? 'text-slate-600 font-semibold' : 'text-slate-500 font-medium'}>Cloudinary Public Asset ID:</span>
                                <div className={`mt-1.5 font-mono text-[11px] px-3 py-2 rounded-xl border truncate ${
                                  isLight ? 'bg-slate-50 border-slate-200 text-slate-800 font-medium' : 'bg-black/40 border-white/10 text-slate-300'
                                }`}>
                                  {selectedTicket.evidence.cloudinaryAsset?.publicId}
                                </div>
                              </div>
                            </div>

                            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2.5 border-t text-[11px] ${
                              isLight ? 'border-slate-200 text-slate-600' : 'border-white/5 text-slate-400'
                            }`}>
                              <p>Uploaded By: <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-bold'}>{selectedTicket.evidence.uploadedByName}</strong></p>
                              <p>File Size: <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-bold'}>{(selectedTicket.evidence.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</strong></p>
                              <p>Uploaded Date: <strong className={isLight ? 'text-slate-900 font-bold' : 'text-slate-200 font-bold'}>{new Date(selectedTicket.evidence.createdAt).toLocaleDateString()}</strong></p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Upload Section if No Evidence Attached Yet */
                        <div>
                          {ticketPerms.canUpload ? (
                            <form onSubmit={handleEvidenceUpload} className={`p-8 rounded-2xl border-2 border-dashed space-y-4 ${
                              isLight
                                ? 'bg-blue-50/50 border-blue-300'
                                : 'bg-blue-500/5 border-blue-500/30'
                            }`}>
                              <div className="text-center">
                                <Upload className="w-10 h-10 text-blue-500 mx-auto mb-2 animate-bounce" />
                                <h3 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                                  Upload CCTV Video Evidence
                                </h3>
                                <p className={`text-xs mt-1 max-w-md mx-auto ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                  Uploaded video is hashed with SHA-256 and encrypted with AES-256-GCM before storage in Cloudinary.
                                </p>
                              </div>

                              <div className="flex flex-col items-center">
                                <input
                                  type="file"
                                  ref={fileInputRef}
                                  accept="video/mp4,video/mkv,video/webm,video/avi"
                                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                                  className="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                                />
                                {selectedFile && (
                                  <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mt-2">
                                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                                  </p>
                                )}
                              </div>

                              {/* Camera Confirmation & Mismatch Verification */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
                                <div>
                                  <label className={`text-xs font-bold block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                    Requisition Camera ID
                                  </label>
                                  <input
                                    type="text"
                                    readOnly
                                    value={selectedTicket.cameraId}
                                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono opacity-80 cursor-not-allowed ${
                                      isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white/5 border-white/10 text-slate-300'
                                    }`}
                                  />
                                </div>
                                <div>
                                  <label className={`text-xs font-bold block mb-1 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                    Uploaded Footage Camera ID
                                  </label>
                                  <input
                                    type="text"
                                    placeholder={`Defaults to ${selectedTicket.cameraId}`}
                                    value={uploadedCameraId}
                                    onChange={(e) => setUploadedCameraId(e.target.value)}
                                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-mono ${inputThemeClass}`}
                                  />
                                </div>
                              </div>

                              {/* Mismatch Alert & Justification */}
                              {uploadedCameraId && uploadedCameraId.trim() && uploadedCameraId.trim() !== selectedTicket.cameraId && (
                                <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-left space-y-2">
                                  <div className="flex items-center gap-2 text-amber-500 text-xs font-bold">
                                    <AlertTriangle className="w-4 h-4 shrink-0" />
                                    <span>Camera ID Mismatch Warning</span>
                                  </div>
                                  <p className="text-[11px] text-amber-400/90 leading-relaxed">
                                    The uploaded footage camera (<span className="font-mono font-bold">{uploadedCameraId}</span>) differs from the requested camera (<span className="font-mono font-bold">{selectedTicket.cameraId}</span>). An authorized statutory override justification is required.
                                  </p>
                                  <textarea
                                    required
                                    rows={2}
                                    placeholder="Mandatory Override Justification (e.g. Primary camera offline; adjacent PTZ junction camera captured the incident angle)..."
                                    value={cameraOverrideReason}
                                    onChange={(e) => setCameraOverrideReason(e.target.value)}
                                    className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium border-amber-500/40 bg-black/20 text-slate-100`}
                                  />
                                </div>
                              )}

                              <div>
                                <label className={`text-xs font-bold block mb-1 text-left ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                                  Operator Notes / NVR Channel Info (Optional)
                                </label>
                                <input
                                  type="text"
                                  value={uploadRemarks}
                                  onChange={(e) => setUploadRemarks(e.target.value)}
                                  placeholder="e.g. Channel 4 NVR Export, 1080p 25fps raw feed"
                                  className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputThemeClass}`}
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={!selectedFile || isUploading}
                                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Lock className="w-4 h-4" />
                                <span>{isUploading ? 'Encrypting & Uploading...' : 'Encrypt & Upload to Evidence Vault'}</span>
                              </button>
                            </form>
                          ) : (
                            <div className={`p-12 rounded-2xl border text-center ${
                              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
                            }`}>
                              <Clock className="w-10 h-10 text-amber-500 mx-auto mb-2 opacity-70" />
                              <h4 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                                Footage Not Yet Uploaded
                              </h4>
                              <p className={`text-xs max-w-sm mx-auto mt-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                                The requested department ({selectedTicket.targetDepartment}) is currently retrieving and preparing the requested footage.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: RESPONSES & CASE DISCUSSION */}
                  {detailTab === 'responses' && (
                    <div className="flex flex-col h-full min-h-[360px]">
                      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                        {responses.length === 0 ? (
                          <div className="p-8 text-center text-xs text-slate-500 font-semibold">
                            No messages or case responses lodged yet. Post below to communicate with the other department.
                          </div>
                        ) : (
                          responses.map((r) => (
                            <div
                              key={r._id}
                              className={`p-4 rounded-2xl border ${
                                r.type === 'evidence_upload'
                                  ? isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                                  : r.type === 'status_change'
                                  ? isLight ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-blue-500/10 border-blue-500/20 text-blue-300'
                                  : isLight ? 'bg-slate-50 border-slate-200 text-slate-900' : 'bg-white/4 border-white/5 text-slate-200'
                              }`}
                            >
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold">
                                  {r.senderName} ({r.senderDepartment})
                                </span>
                                <span className="text-slate-400 text-[11px]">
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
                        className="pt-4 flex gap-2"
                      >
                        <input
                          type="text"
                          placeholder="Type an official response, clarification, or update..."
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          className={`flex-1 px-4 py-2.5 text-xs rounded-xl border outline-none ${inputThemeClass}`}
                        />
                        <button
                          type="submit"
                          disabled={!responseText.trim()}
                          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Reply</span>
                        </button>
                      </form>
                    </div>
                  )}

                  {/* TAB 4: FORENSIC AUDIT TRAIL */}
                  {detailTab === 'audit' && (
                    <div className="space-y-3">
                      <p className={`text-xs font-black uppercase tracking-wider mb-2 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
                        Immutable Chain of Custody Forensic Audit Log
                      </p>
                      {auditLogs.map((log) => (
                        <div
                          key={log._id}
                          className={`p-3.5 rounded-2xl border text-xs space-y-1 ${
                            isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                              {log.action}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className={`font-medium ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                            {log.remarks}
                          </p>
                          <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-white/5 text-[11px] text-slate-500 font-mono">
                            <span>Actor: {log.actorName} ({log.actorDepartment})</span>
                            <span className="truncate max-w-xs">Seal: {log.integrityHash?.slice(0, 20)}...</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        </div>
      )}

      {/* ─── MODAL: CREATE FOOTAGE REQUISITION TICKET (With Requested Dept) ─ */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-2xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#101626] border-white/10 text-slate-100'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#151c30] border-white/10'
            }`}>
              <div className="flex items-center gap-2.5">
                <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <h3 className={`font-black text-sm ${isLight ? 'text-slate-900' : 'text-slate-100'}`}>
                  Lodge Inter-Department CCTV Footage Requisition
                </h3>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className={`p-1 rounded-lg ${isLight ? 'text-slate-400 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              
              {/* Title */}
              <div>
                <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  Requisition Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Hit-and-Run Incident Evidence on SG Highway Junction"
                  value={createForm.title}
                  onChange={(e) => setCreateForm((p) => ({ ...p, title: e.target.value }))}
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
                />
              </div>

              {/* Department Routing Row (Requesting & Requested) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Requesting Department (From)
                  </label>
                  <div className={`px-3.5 py-2.5 text-xs rounded-xl border font-bold flex items-center gap-2 ${
                    isLight ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white/5 border-white/10 text-slate-300'
                  }`}>
                    <Building className="w-3.5 h-3.5 text-blue-500" />
                    <span className="truncate">{userDept}</span>
                  </div>
                </div>

                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Requested Department (Send Ticket To) *
                  </label>
                  <select
                    required
                    value={createForm.targetDepartment}
                    onChange={(e) => setCreateForm((p) => ({ ...p, targetDepartment: e.target.value }))}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-bold cursor-pointer ${inputThemeClass}`}
                  >
                    {STANDARD_DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Camera & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    CCTV Camera *
                  </label>
                  <SearchableCameraSelect
                    cameras={camerasList}
                    value={createForm.cameraId}
                    required
                    isLight={isLight}
                    placeholder="Search by Camera ID, Area, Location, or Circle..."
                    onChange={(camId, camDoc) => {
                      setCreateForm((p) => ({
                        ...p,
                        cameraId: camId,
                        targetDepartment: camDoc?.departmentName || p.targetDepartment,
                      }));
                    }}
                  />
                </div>

                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Priority
                  </label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm((p) => ({ ...p, priority: e.target.value }))}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-medium cursor-pointer ${inputThemeClass}`}
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              {/* Professional CCTV Footage Duration Window */}
              <div>
                <FootageTimeWindowPicker
                  startTime={createForm.startTime}
                  endTime={createForm.endTime}
                  onChange={({ startTime, endTime }) =>
                    setCreateForm((p) => ({ ...p, startTime, endTime }))
                  }
                />
              </div>

              {/* FIR / Incident Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    FIR / CR Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CR-I/102/2026"
                    value={createForm.firNumber}
                    onChange={(e) => setCreateForm((p) => ({ ...p, firNumber: e.target.value }))}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
                  />
                </div>

                <div>
                  <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Incident Type
                  </label>
                  <select
                    value={createForm.incidentType}
                    onChange={(e) => setCreateForm((p) => ({ ...p, incidentType: e.target.value }))}
                    className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-medium cursor-pointer ${inputThemeClass}`}
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

              {/* Purpose */}
              <div>
                <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  Reason &amp; Legal Justification for Footage *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Detail the official purpose and case facts justifying the CCTV requisition..."
                  value={createForm.purpose}
                  onChange={(e) => setCreateForm((p) => ({ ...p, purpose: e.target.value }))}
                  className={`w-full px-3.5 py-2.5 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
                />
              </div>

              {/* Emergency Requisition Toggle */}
              <div className={`p-4 rounded-2xl border transition-all ${
                createForm.isEmergency
                  ? 'bg-rose-500/10 border-rose-500/40 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.15)]'
                  : isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/5'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle className={`w-4 h-4 ${createForm.isEmergency ? 'text-rose-500 animate-pulse' : 'text-slate-400'}`} />
                    <div>
                      <label htmlFor="emergency-toggle" className={`text-xs font-bold cursor-pointer block ${
                        createForm.isEmergency ? 'text-rose-600 dark:text-rose-400' : isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        Declare Life-Safety / Hot Pursuit Emergency
                      </label>
                      <span className="text-[10px] text-slate-500">
                        Bypasses Central Nodal vetting and routes directly to target department with strict 2-hour SLA.
                      </span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    id="emergency-toggle"
                    checked={createForm.isEmergency}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCreateForm((p) => ({
                        ...p,
                        isEmergency: checked,
                        priority: checked ? 'urgent' : p.priority,
                      }));
                    }}
                    className="w-4 h-4 rounded text-rose-600 cursor-pointer"
                  />
                </div>
                {createForm.isEmergency && (
                  <div className="mt-3 pt-3 border-t border-rose-500/20 space-y-2">
                    <p className="text-[11px] text-rose-400 font-bold">
                      Mandatory Emergency Justification:
                    </p>
                    <textarea
                      required={createForm.isEmergency}
                      rows={2}
                      placeholder="Describe active pursuit, hostage situation, life endangerment, or urgent statutory court deadline..."
                      value={createForm.emergencyReason}
                      onChange={(e) => setCreateForm((p) => ({ ...p, emergencyReason: e.target.value }))}
                      className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium border-rose-500/40 bg-black/20 text-slate-100 placeholder-slate-400`}
                    />
                  </div>
                )}
              </div>

              {/* Compliance Box */}
              <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
                isLight ? 'bg-amber-50/70 border-amber-200' : 'bg-amber-500/10 border-amber-500/20'
              }`}>
                <input
                  type="checkbox"
                  id="compliance"
                  checked={createForm.acknowledgedCompliance}
                  onChange={(e) => setCreateForm((p) => ({ ...p, acknowledgedCompliance: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 rounded text-blue-600 cursor-pointer"
                />
                <label htmlFor="compliance" className={`text-xs leading-relaxed cursor-pointer font-medium ${
                  isLight ? 'text-amber-900' : 'text-amber-300'
                }`}>
                  I certify that this requisition is made pursuant to lawful state authority under the Evidence Act. All footage will be maintained confidentially within legal chain of custody.
                </label>
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
                >
                  Submit Requisition
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: REJECT REQUISITION ───────────────────────────────── */}
      {isRejectModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-rose-300 text-slate-900' : 'bg-[#121727] border-rose-500/30 text-slate-100'
          }`}>
            <h3 className="text-sm font-black text-rose-600 dark:text-rose-400">Reject Footage Requisition</h3>
            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              Please document the official reason for rejecting this footage request. This will be recorded permanently in the legal audit log.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Camera feed out of range, recording window deleted per policy, or insufficient legal clearance..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsRejectModalOpen(false)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                disabled={rejectMutation.isPending}
                onClick={() => {
                  if (rejectionReason.trim()) {
                    rejectMutation.mutate({
                      id: selectedTicket.ticketId,
                      reason: rejectionReason,
                    });
                  } else {
                    toast.error('Please enter a rejection reason');
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-xs text-white font-bold cursor-pointer"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: APPROVE & ROUTE (CENTRAL REVIEW) ─────────────────── */}
      {isApproveModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-lg rounded-2xl border p-6 space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-blue-300 text-slate-900' : 'bg-[#121727] border-blue-500/30 text-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-blue-600 dark:text-blue-400">
                  Nodal Approval &amp; Statutory Routing
                </h3>
                <p className="text-[11px] text-slate-500">
                  Authorizing Requisition #{selectedTicket.ticketId}
                </p>
              </div>
            </div>

            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              As Central Control Room Nodal Authority, approve this footage requisition for lawful extraction by the target department.
            </p>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Target Department Routing Confirmation
              </label>
              <select
                value={targetDeptOverride || selectedTicket.targetDepartment}
                onChange={(e) => setTargetDeptOverride(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-bold cursor-pointer ${inputThemeClass}`}
              >
                {STANDARD_DEPARTMENTS.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept} {dept === selectedTicket.targetDepartment ? '(Requested Target)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Routing Instructions &amp; Administrative Remarks
              </label>
              <textarea
                rows={3}
                placeholder="e.g. Approved per Section 91 CrPC requisition; route to Traffic Command NVR cell for urgent retrieval..."
                value={approveRemarks}
                onChange={(e) => setApproveRemarks(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={approveMutation.isPending}
                onClick={() => {
                  approveMutation.mutate({
                    id: selectedTicket.ticketId,
                    remarks: approveRemarks,
                    targetDepartmentOverride: targetDeptOverride || undefined,
                  });
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{approveMutation.isPending ? 'Routing...' : 'Approve & Route'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: REQUEST CLARIFICATION ────────────────────────────── */}
      {isClarifyModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-orange-300 text-slate-900' : 'bg-[#121727] border-orange-500/30 text-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-500">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-orange-600 dark:text-orange-400">
                  Request Inquiry / Clarification
                </h3>
                <p className="text-[11px] text-slate-500">
                  Requisition #{selectedTicket.ticketId}
                </p>
              </div>
            </div>

            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Send an inquiry back to the requesting department ({selectedTicket.requestingDepartment}) for missing case details, narrower time frames, or statutory warrants.
            </p>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Clarification Inquiry *
              </label>
              <textarea
                rows={3}
                required
                placeholder="e.g. Please clarify exact camera angle required and specify the relevant GD/FIR case reference..."
                value={clarifyQuestion}
                onChange={(e) => setClarifyQuestion(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClarifyModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!clarifyQuestion.trim() || clarifyMutation.isPending}
                onClick={() => {
                  clarifyMutation.mutate({
                    id: selectedTicket.ticketId,
                    question: clarifyQuestion,
                  });
                }}
                className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{clarifyMutation.isPending ? 'Sending...' : 'Send Inquiry'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: RESPOND TO CLARIFICATION ─────────────────────────── */}
      {isRespondClarifyModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-blue-300 text-slate-900' : 'bg-[#121727] border-blue-500/30 text-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-500">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-blue-600 dark:text-blue-400">
                  Submit Clarification Response
                </h3>
                <p className="text-[11px] text-slate-500">
                  Requisition #{selectedTicket.ticketId}
                </p>
              </div>
            </div>

            {/* Existing Question */}
            <div className="p-3.5 rounded-xl bg-orange-500/10 border border-orange-500/30 text-xs">
              <span className="text-[11px] font-bold text-orange-400 block mb-1">Nodal Officer Inquiry:</span>
              <p className="font-medium text-slate-200">
                "{selectedTicket.clarification?.question}"
              </p>
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Official Response *
              </label>
              <textarea
                rows={3}
                required
                placeholder="Provide the requested clarification, FIR details, or refined parameters..."
                value={clarifyResponseText}
                onChange={(e) => setClarifyResponseText(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none font-medium ${inputThemeClass}`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsRespondClarifyModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!clarifyResponseText.trim() || respondClarifyMutation.isPending}
                onClick={() => {
                  respondClarifyMutation.mutate({
                    id: selectedTicket.ticketId,
                    response: clarifyResponseText,
                  });
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{respondClarifyMutation.isPending ? 'Submitting...' : 'Submit Response'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: ASSIGN OPERATOR (SUPERVISOR QUEUE) ───────────────── */}
      {isAssignModalOpen && selectedTicket && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className={`w-full max-w-md rounded-2xl border p-6 space-y-4 shadow-2xl ${
            isLight ? 'bg-white border-purple-300 text-slate-900' : 'bg-[#121727] border-purple-500/30 text-slate-100'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-500">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-purple-600 dark:text-purple-400">
                  Assign CCTV Operator
                </h3>
                <p className="text-[11px] text-slate-500">
                  Requisition #{selectedTicket.ticketId}
                </p>
              </div>
            </div>

            <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-slate-300'}`}>
              Assign an operational technician or sub-inspector within your department to extract and verify the CCTV footage.
            </p>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Select Department Operator *
              </label>
              <select
                required
                value={selectedOperatorId}
                onChange={(e) => setSelectedOperatorId(e.target.value)}
                className={`w-full px-3 py-2.5 text-xs rounded-xl border outline-none font-bold cursor-pointer ${inputThemeClass}`}
              >
                <option value="">Choose an Operator...</option>
                {departmentOperators.map((op) => (
                  <option key={op._id} value={op._id}>
                    {op.name} ({op.role} — {op.designation || op.department})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={`text-xs font-bold block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                Supervisor Instructions (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Export 10 minutes prior and post incident timestamp"
                value={assignmentRemarks}
                onChange={(e) => setAssignmentRemarks(e.target.value)}
                className={`w-full px-3 py-2 text-xs rounded-xl border outline-none ${inputThemeClass}`}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className={`px-4 py-2 rounded-xl text-xs font-bold ${
                  isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700' : 'bg-white/5 hover:bg-white/10 text-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedOperatorId || assignMutation.isPending}
                onClick={() => {
                  assignMutation.mutate({
                    id: selectedTicket.ticketId,
                    operatorId: selectedOperatorId,
                    remarks: assignmentRemarks,
                  });
                }}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold shadow-md cursor-pointer flex items-center gap-2"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{assignMutation.isPending ? 'Assigning...' : 'Confirm Assignment'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: SECTION 65B COURT EVIDENCE PACKAGE ──────────────── */}
      {isEvidencePackageOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className={`w-full max-w-4xl rounded-3xl border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] ${
            isLight ? 'bg-white border-slate-300 text-slate-900' : 'bg-[#0e1322] border-white/10 text-slate-100'
          }`}>
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-[#141b30] border-white/10'
            }`}>
              <div className="flex items-center gap-2.5">
                <FileCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <h3 className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                    Section 65B Digital Evidence Certificate
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Bharatiya Sakshya Adhiniyam / Indian Evidence Act Electronic Record Manifest
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Print Certificate</span>
                </button>
                <button
                  onClick={() => setIsEvidencePackageOpen(false)}
                  className={`p-1 rounded-lg ${isLight ? 'text-slate-400 hover:text-slate-900' : 'text-slate-400 hover:text-white'}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Content Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isPackageLoading ? (
                <div className="p-16 text-center text-xs text-slate-500 font-semibold">
                  Compiling cryptographic evidence manifest and audit chain...
                </div>
              ) : evidencePackageData ? (
                <div className="space-y-6 max-w-3xl mx-auto">
                  
                  {/* State Emblems / Header */}
                  <div className="text-center border-b pb-4 border-slate-200 dark:border-white/10 space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">
                      GOVERNMENT OF GUJARAT · HOME DEPARTMENT
                    </p>
                    <h2 className="text-base sm:text-lg font-black tracking-tight">
                      CERTIFICATE OF ELECTRONIC EVIDENCE
                    </h2>
                    <p className="text-xs font-medium text-slate-500">
                      Pursuant to Section 65B of the Indian Evidence Act, 1872 &amp; Section 63 of Bharatiya Sakshya Adhiniyam, 2023
                    </p>
                  </div>

                  {/* Requisition & Case Metadata */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border bg-slate-50 dark:bg-white/3 border-slate-200 dark:border-white/10 text-xs">
                    <div>
                      <span className="text-slate-500 text-[11px] block">Requisition ID:</span>
                      <strong className="font-mono">{evidencePackageData.ticket?.ticketId}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">FIR / CR Number:</span>
                      <strong className="font-mono">{evidencePackageData.ticket?.firNumber || 'N/A'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Requesting Dept:</span>
                      <strong className="truncate block">{evidencePackageData.ticket?.requestingDepartment}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[11px] block">Target Dept:</span>
                      <strong className="truncate block">{evidencePackageData.ticket?.targetDepartment}</strong>
                    </div>
                  </div>

                  {/* Camera & Time Coordinates */}
                  <div className="p-4 rounded-xl border bg-slate-50 dark:bg-white/3 border-slate-200 dark:border-white/10 space-y-2 text-xs">
                    <p className="font-bold text-[11px] uppercase tracking-wider text-slate-500">Camera &amp; Feed Technical Manifest</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-slate-500 text-[11px] block">Camera ID:</span>
                        <strong className="font-mono">{evidencePackageData.ticket?.cameraId}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Incident Time Range:</span>
                        <span>{new Date(evidencePackageData.ticket?.startTime).toLocaleString()} to {new Date(evidencePackageData.ticket?.endTime).toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">Duration:</span>
                        <strong>{evidencePackageData.ticket?.durationMinutes} minutes</strong>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Parameters */}
                  <div className="p-4 rounded-xl border bg-emerald-500/5 border-emerald-500/25 space-y-3 text-xs">
                    <div className="flex items-center gap-2 text-emerald-500 font-bold">
                      <ShieldCheck className="w-4 h-4" />
                      <span>Cryptographic Integrity Seal (Section 65B Mandatory)</span>
                    </div>
                    <div className="space-y-1.5 font-mono text-[11px]">
                      <div>
                        <span className="text-slate-500 block">SHA-256 Checksum:</span>
                        <div className="p-2 rounded bg-black/40 text-emerald-400 font-bold break-all border border-emerald-500/20">
                          {evidencePackageData.evidence?.sha256Hash || 'N/A'}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <span className="text-slate-500 block">Cipher Standard:</span>
                          <strong>AES-256-GCM (Hardware/Software Authenticated)</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Evidence Vault Asset:</span>
                          <strong className="truncate block">{evidencePackageData.evidence?.evidenceId}</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Legal Attestation Statement */}
                  <div className="p-4 rounded-xl border bg-slate-50 dark:bg-white/3 border-slate-200 dark:border-white/10 text-xs leading-relaxed space-y-2">
                    <p className="font-bold text-[11px] uppercase tracking-wider text-slate-500">Official Officer Certification</p>
                    <p className="italic text-slate-600 dark:text-slate-300">
                      "I hereby certify that the electronic optical video recording identified above was extracted from the authorized DrishtiGrid CCTV network operating under regular official custody. The optical and cryptographic verification methods confirm that no modification, tampering, deletion, or interception occurred throughout the evidentiary custody lifecycle."
                    </p>
                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-white/10 text-[11px]">
                      <div>
                        <p className="text-slate-500">Prepared &amp; Uploaded By:</p>
                        <p className="font-bold">{evidencePackageData.evidence?.uploadedByName || 'Authorized CCTV Operator'}</p>
                        <p className="text-slate-500">{new Date(evidencePackageData.evidence?.createdAt || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-slate-500">Nodal Authority Authorization:</p>
                        <p className="font-bold">{evidencePackageData.ticket?.approval?.approvedByName || 'State Nodal Officer'}</p>
                        <p className="text-slate-500">Certified Electronic Custody</p>
                      </div>
                    </div>
                  </div>

                  {/* Chain of Custody Timeline */}
                  {evidencePackageData.ticket?.timeline?.length > 0 && (
                    <div className="space-y-2">
                      <p className="font-bold text-xs uppercase tracking-wider text-slate-500">Chain of Custody Events</p>
                      <div className="space-y-2">
                        {evidencePackageData.ticket.timeline.map((item, idx) => (
                          <div key={idx} className="p-2.5 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/2 text-[11px] flex items-center justify-between">
                            <div>
                              <span className="font-bold text-blue-500">{item.action}</span>: {item.remarks}
                            </div>
                            <span className="text-slate-500 font-mono text-[10px]">
                              {new Date(item.timestamp).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              ) : null}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
