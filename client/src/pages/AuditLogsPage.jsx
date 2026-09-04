import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { auditLogAPI, footageTicketAPI } from '../api';
import { useThemeStore } from '../store/themeStore';
import {
  Shield, Search, Filter, RefreshCw, Calendar, Clock,
  User, Laptop, FileText, ArrowRight, ShieldCheck, Lock,
  Video, CheckCircle2, AlertTriangle, Copy, ExternalLink,
  Layers, Building, Hash, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AuditLogsPage() {
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const navigate = useNavigate();

  // Active view tab
  const [activeTab, setActiveTab] = useState('cctv'); // 'cctv' | 'system'

  // CCTV Evidence Audit filters
  const [cctvSearch, setCctvSearch] = useState('');
  const [cctvActionFilter, setCctvActionFilter] = useState('all');
  const [cctvDeptFilter, setCctvDeptFilter] = useState('all');
  const [cctvTicketId, setCctvTicketId] = useState('');
  const [cctvEvidenceId, setCctvEvidenceId] = useState('');

  // System Audit filters
  const [sysSearch, setSysSearch] = useState('');
  const [sysActionFilter, setSysActionFilter] = useState('all');
  const [sysRoleFilter, setSysRoleFilter] = useState('all');

  const [copiedKey, setCopiedKey] = useState(null);

  // Query 1: CCTV Evidence Audit Logs
  const {
    data: cctvLogsRes,
    isLoading: isCctvLoading,
    refetch: refetchCctv,
    isFetching: isCctvFetching,
  } = useQuery({
    queryKey: ['cctv-audit-logs', { search: cctvSearch, action: cctvActionFilter, department: cctvDeptFilter, ticketId: cctvTicketId, evidenceId: cctvEvidenceId }],
    queryFn: () =>
      footageTicketAPI
        .getAllAuditLogs({
          search: cctvSearch.trim() || undefined,
          action: cctvActionFilter !== 'all' ? cctvActionFilter : undefined,
          department: cctvDeptFilter !== 'all' ? cctvDeptFilter : undefined,
          ticketId: cctvTicketId.trim() || undefined,
          evidenceId: cctvEvidenceId.trim() || undefined,
          limit: 100,
        })
        .then((r) => r.data),
    enabled: activeTab === 'cctv',
    refetchInterval: 15000,
  });

  // Query 2: General System Audit Logs
  const {
    data: sysLogsRes,
    isLoading: isSysLoading,
    refetch: refetchSys,
    isFetching: isSysFetching,
  } = useQuery({
    queryKey: ['system-audit-logs', { search: sysSearch, action: sysActionFilter, role: sysRoleFilter }],
    queryFn: () =>
      auditLogAPI
        .getAll({ search: sysSearch, action: sysActionFilter, role: sysRoleFilter, limit: 100 })
        .then((r) => r.data),
    enabled: activeTab === 'system',
  });

  const cctvLogs = cctvLogsRes?.data || [];
  const sysLogs = sysLogsRes?.data || [];

  const copyText = (txt, key) => {
    navigator.clipboard.writeText(txt);
    setCopiedKey(key);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const getCctvActionBadge = (action) => {
    switch (action) {
      case 'TICKET_CREATED':
        return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'TICKET_ACCEPTED':
        return 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30';
      case 'TICKET_PROCESSING':
        return 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30';
      case 'EVIDENCE_UPLOAD_STARTED':
      case 'EVIDENCE_STORED_CLOUDINARY':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'EVIDENCE_ENCRYPTED':
        return 'bg-purple-500/15 text-purple-400 border-purple-500/30';
      case 'SHA256_GENERATED':
        return 'bg-teal-500/15 text-teal-400 border-teal-500/30';
      case 'EVIDENCE_VIEWED':
      case 'EVIDENCE_DOWNLOADED':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'EVIDENCE_VERIFIED':
        return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
      case 'RESPONSE_ADDED':
        return 'bg-fuchsia-500/15 text-fuchsia-400 border-fuchsia-500/30';
      case 'TICKET_CLOSED':
        return 'bg-slate-500/15 text-slate-300 border-slate-500/30';
      case 'TICKET_REJECTED':
        return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className={`p-6 space-y-5 flex-1 overflow-y-auto ${isLight ? 'bg-slate-100 text-slate-800' : 'bg-[#0a0d14] text-slate-100'}`}>

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight">
              Forensic Security &amp; Evidence Audit System
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
              LEGAL CHAIN OF CUSTODY
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Immutable, tamper-evident audit logs with cryptographic SHA-256 seals, officer IDs, and Cloudinary asset tracking.
          </p>
        </div>

        <button
          onClick={() => (activeTab === 'cctv' ? refetchCctv() : refetchSys())}
          disabled={isCctvFetching || isSysFetching}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
            isLight
              ? 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs'
              : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isCctvFetching || isSysFetching ? 'animate-spin text-blue-500' : ''}`} />
          <span>Refresh Records</span>
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 p-1 rounded-xl bg-black/20 border border-white/5 w-fit">
        <button
          onClick={() => setActiveTab('cctv')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'cctv'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>CCTV Evidence &amp; Ticket Trail</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/30 font-mono">
            {cctvLogs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('system')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'system'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>System &amp; User Audit</span>
        </button>
      </div>

      {/* Tab 1: CCTV Evidence & Requisition Trail */}
      {activeTab === 'cctv' && (
        <div className="space-y-4">
          
          {/* Filters Bar */}
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/8'
          }`}>
            <div className="flex flex-1 items-center gap-2 min-w-[240px]">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by officer name, remarks, IP address..."
                  value={cctvSearch}
                  onChange={(e) => setCctvSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Ticket ID (e.g. REQ-2026-0001)"
                value={cctvTicketId}
                onChange={(e) => setCctvTicketId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none w-44 font-mono"
              />

              <input
                type="text"
                placeholder="Evidence ID (e.g. EV-2026-0001)"
                value={cctvEvidenceId}
                onChange={(e) => setCctvEvidenceId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none w-44 font-mono"
              />

              <select
                value={cctvDeptFilter}
                onChange={(e) => setCctvDeptFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-slate-300 focus:outline-none"
              >
                <option value="all">All Departments</option>
                <option value="Gujarat Police Department">Gujarat Police Department</option>
                <option value="Gujarat Traffic Police">Gujarat Traffic Police</option>
                <option value="Gujarat Home Department">Gujarat Home Department</option>
              </select>

              <select
                value={cctvActionFilter}
                onChange={(e) => setCctvActionFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-slate-300 focus:outline-none"
              >
                <option value="all">All Actions</option>
                <option value="TICKET_CREATED">Ticket Created</option>
                <option value="TICKET_ACCEPTED">Ticket Accepted</option>
                <option value="TICKET_PROCESSING">Ticket In Processing</option>
                <option value="EVIDENCE_UPLOAD_STARTED">Upload Started</option>
                <option value="SHA256_GENERATED">SHA-256 Generated</option>
                <option value="EVIDENCE_ENCRYPTED">Evidence Encrypted</option>
                <option value="EVIDENCE_STORED_CLOUDINARY">Stored in Cloudinary</option>
                <option value="EVIDENCE_VIEWED">Footage Viewed</option>
                <option value="EVIDENCE_VERIFIED">Integrity Verified</option>
                <option value="RESPONSE_ADDED">Response Added</option>
                <option value="TICKET_CLOSED">Ticket Closed</option>
                <option value="TICKET_REJECTED">Ticket Rejected</option>
              </select>
            </div>
          </div>

          {/* Logs Table / Cards */}
          <div className={`rounded-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-[#0f1422] border-white/5'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-black/20 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Ticket / Evidence</th>
                    <th className="py-3 px-4">Actor &amp; Department</th>
                    <th className="py-3 px-4">Remarks &amp; Forensics</th>
                    <th className="py-3 px-4">Timestamp &amp; IP</th>
                    <th className="py-3 px-4">Cryptographic Seal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isCctvLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400">Loading audit trail...</td>
                    </tr>
                  ) : cctvLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">No CCTV forensic audit logs matched current filters</td>
                    </tr>
                  ) : (
                    cctvLogs.map((log) => (
                      <tr key={log._id} className="hover:bg-white/3 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] ${getCctvActionBadge(log.action)}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-0.5 font-mono">
                            <span
                              onClick={() => navigate(`/footage-requests?ticket=${log.ticketId}`)}
                              className="text-blue-400 hover:underline cursor-pointer font-bold flex items-center gap-1"
                            >
                              <span>{log.ticketId}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </span>
                            {log.evidenceId && (
                              <span className="text-[10px] text-emerald-400">
                                {log.evidenceId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-200">{log.actorName}</span>
                            <span className="text-[10px] text-slate-400">{log.actorDepartment} ({log.actorRole})</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          <p className="line-clamp-2 text-slate-300 leading-snug">
                            {log.remarks}
                          </p>
                        </td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span>{new Date(log.timestamp).toLocaleDateString()} {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-[10px] font-mono text-slate-500">IP: {log.ipAddress}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-[10px]">
                          <div className="flex items-center gap-1.5 text-slate-400 bg-black/30 px-2 py-1 rounded border border-white/5 w-fit">
                            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span className="truncate max-w-[90px]">{log.integrityHash?.slice(0, 12)}...</span>
                            <button onClick={() => copyText(log.integrityHash, log._id)}>
                              <Copy className="w-2.5 h-2.5 text-slate-400 hover:text-white" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: General System & User Audits */}
      {activeTab === 'system' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-[#121727] border-white/8'
          }`}>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search user, email, description..."
                value={sysSearch}
                onChange={(e) => setSysSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-white/5 border border-white/10 text-slate-200 focus:outline-none"
              />
            </div>
            <select
              value={sysActionFilter}
              onChange={(e) => setSysActionFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl text-xs bg-white/5 border border-white/10 text-slate-300 focus:outline-none"
            >
              <option value="all">All Actions</option>
              <option value="USER_LOGIN">User Logins</option>
              <option value="USER_CREATED">User Creations</option>
              <option value="ROLE_CHANGED">Role Changes</option>
              <option value="CAMERA_MODIFIED">Camera Alterations</option>
            </select>
          </div>

          <div className={`rounded-2xl border overflow-hidden ${isLight ? 'bg-white border-slate-200' : 'bg-[#0f1422] border-white/5'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-black/20 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isSysLoading ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-400">Loading system logs...</td>
                    </tr>
                  ) : sysLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">No system audit records found</td>
                    </tr>
                  ) : (
                    sysLogs.map((l) => (
                      <tr key={l._id} className="hover:bg-white/3 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-blue-400">{l.action}</td>
                        <td className="py-3 px-4 font-semibold text-slate-200">{l.userName || l.userEmail}</td>
                        <td className="py-3 px-4 text-slate-300 max-w-sm">{l.description}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{l.ipAddress || '127.0.0.1'}</td>
                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(l.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
