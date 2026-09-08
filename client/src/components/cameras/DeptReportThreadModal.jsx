import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { deptReportAPI } from '../../api';
import useAuthStore from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import {
  X, Flag, Send, Loader2, CheckCircle2, Lock, AlertTriangle,
  Camera, Clock, User, Building, ChevronDown, Wifi, WifiOff,
  MessageSquare, Paperclip, UserX,
} from 'lucide-react';
import toast from 'react-hot-toast';

const STATUS_CONFIG = {
  Open:         { label: 'Open',          cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  'In Progress':{ label: 'In Progress',   cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  'Action Taken':{ label: 'Action Taken', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  Resolved:     { label: 'Resolved',      cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
  Closed:       { label: 'Closed',        cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' },
};

const PRIORITY_CONFIG = {
  Low:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
  Medium:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  High:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Critical: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const DEPT_STATUS_OPTIONS = ['In Progress', 'Action Taken'];
const ADMIN_STATUS_OPTIONS = ['Open', 'In Progress', 'Action Taken', 'Resolved', 'Closed'];

function formatTime(ts) {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function DeptReportThreadModal({ isOpen, onClose, reportId }) {
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const queryClient = useQueryClient();
  const threadEndRef = useRef(null);
  const [replyText, setReplyText] = useState('');

  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  // Fetch full report with thread
  const { data, isLoading, error } = useQuery({
    queryKey: ['dept-report', reportId],
    queryFn: () => deptReportAPI.getById(reportId).then((r) => r.data.data),
    enabled: isOpen && !!reportId,
    refetchInterval: 20000, // poll for new replies every 20s
  });

  // Scroll thread to bottom on load / new message
  useEffect(() => {
    if (data && threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [data?.thread?.length]);

  const replyMutation = useMutation({
    mutationFn: ({ rId, msg }) => deptReportAPI.reply(rId, { message: msg }),
    onSuccess: () => {
      setReplyText('');
      queryClient.invalidateQueries({ queryKey: ['dept-report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['dept-reports'] });
      toast.success('Reply sent');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to send reply');
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ rId, status }) => deptReportAPI.updateStatus(rId, { status }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['dept-report', reportId] });
      queryClient.invalidateQueries({ queryKey: ['dept-reports'] });
      toast.success(res.data.message);
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });

  if (!isOpen) return null;

  const report = data;
  const isClosed = report?.status === 'Closed';
  const statusCfg = STATUS_CONFIG[report?.status] || STATUS_CONFIG['Open'];
  const statusOptions = isAdmin ? ADMIN_STATUS_OPTIONS : DEPT_STATUS_OPTIONS;

  const cardCls = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0d1322]/97 border-white/10 text-slate-100';

  const inputCls = isLight
    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500'
    : 'bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-blue-500/60';

  const handleReply = () => {
    if (!replyText.trim()) return;
    replyMutation.mutate({ rId: reportId, msg: replyText.trim() });
  };

  const handleStatusChange = (newStatus) => {
    if (newStatus === report.status) return;
    statusMutation.mutate({ rId: reportId, status: newStatus });
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[680px] h-[90vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden ${cardCls}`}
        style={{ boxShadow: isLight ? undefined : '0 0 60px rgba(59,130,246,0.10), 0 25px 50px rgba(0,0,0,0.55)' }}
      >
        {/* ── Header ── */}
        <div className={`flex items-center justify-between px-6 py-4 border-b shrink-0 ${isLight ? 'border-slate-200' : 'border-white/8'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Flag className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-sm font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {report?.reportId || 'Loading...'}
                </h2>
                {report && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${statusCfg.cls}`}>
                    {statusCfg.label}
                  </span>
                )}
              </div>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {report ? `Camera ${report.cameraId} · ${report.recipientDepartment}` : 'Department Escalation Report'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${isLight ? 'hover:bg-slate-100 border-slate-200 text-slate-500' : 'hover:bg-white/10 border-white/10 text-slate-400'}`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Loading ── */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="text-xs text-slate-400">Loading report thread...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
              <p className="text-sm font-bold text-slate-300">Failed to load report</p>
              <p className="text-xs text-slate-500">{error.response?.data?.message || 'Unknown error'}</p>
            </div>
          </div>
        )}

        {report && (
          <>
            {/* ── Banners ── */}
            {report.cameraNowOnline && (
              <div className="mx-4 mt-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2.5 text-xs shrink-0">
                <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-emerald-300 font-semibold">
                  📡 Camera is now <strong>Online</strong> — report remains open until Admin closes it (repair confirmation required).
                </span>
              </div>
            )}

            {report.recipientUsers?.some((u) => !u.userId) && (
              <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center gap-2.5 text-xs shrink-0">
                <UserX className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="text-amber-300 font-semibold">
                  Recipient user(s) may no longer be active. Admin may need to reassign or escalate elsewhere.
                </span>
              </div>
            )}

            {isClosed && (
              <div className="mx-4 mt-3 p-3 rounded-xl bg-slate-500/15 border border-slate-500/30 flex items-center gap-2.5 text-xs shrink-0">
                <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-slate-300 font-semibold">
                  This report is <strong>Closed</strong>. Thread is read-only. Admin can reopen by changing status.
                </span>
              </div>
            )}

            {/* ── Report Details Panel ── */}
            <div className={`mx-4 mt-4 p-4 rounded-2xl border space-y-3 text-xs shrink-0 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'}`}>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Camera ID</span>
                  <p className={`font-mono font-bold mt-0.5 ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{report.cameraId}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Status at Report</span>
                  <p className={`font-bold mt-0.5 capitalize ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{report.cameraSnapshot?.statusAtReport}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Location</span>
                  <p className={`font-semibold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{report.cameraSnapshot?.locationName || '—'}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>District</span>
                  <p className={`font-semibold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{report.cameraSnapshot?.district || '—'}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Category</span>
                  <p className={`font-bold mt-0.5 ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{report.category}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Priority</span>
                  <div className="mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full border font-bold text-[10px] ${PRIORITY_CONFIG[report.priority] || ''}`}>
                      {report.priority}
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Description</span>
                <p className={`mt-1 leading-relaxed ${isLight ? 'text-slate-800' : 'text-slate-300'}`}>{report.description}</p>
              </div>
              {report.attachments?.length > 0 && (
                <div className="flex items-center gap-2 pt-1">
                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-400">Attachments:</span>
                  {report.attachments.map((a) => (
                    <span key={a} className={`px-2 py-0.5 rounded font-mono text-[10px] ${isLight ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>{a}</span>
                  ))}
                </div>
              )}
            </div>

            {/* ── Status Control ── */}
            <div className={`mx-4 mt-3 flex items-center gap-3 shrink-0`}>
              <span className={`text-xs font-bold ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>Update Status:</span>
              <div className="relative">
                <select
                  value={report.status}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={statusMutation.isPending || (isClosed && !isAdmin)}
                  className={`text-xs px-3 py-1.5 pr-7 rounded-lg border outline-none appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${inputCls}`}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <ChevronDown className={`w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
              {statusMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />}
              {!isAdmin && (
                <span className={`text-[11px] ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  Dept can set In Progress / Action Taken. Only Admin can Resolve or Close.
                </span>
              )}
            </div>

            {/* ── Thread ── */}
            <div className={`flex-1 overflow-y-auto px-4 py-3 space-y-3 mt-2`}>
              <div className={`text-[11px] font-bold uppercase tracking-wider mb-3 ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
                <MessageSquare className="w-3.5 h-3.5 inline mr-1.5" />
                Thread ({report.thread?.length || 0} messages)
              </div>

              {report.thread?.map((msg, i) => {
                const isMyMsg = msg.sender === user?._id || msg.senderName === user?.name;
                const msgIsAdmin = ['ADMIN', 'SUPERADMIN'].includes(String(msg.senderRole || '').toUpperCase());

                return (
                  <div
                    key={msg.messageId || i}
                    className={`flex gap-2.5 ${isMyMsg ? 'flex-row-reverse' : 'flex-row'}`}
                  >
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black shrink-0 ${
                      msgIsAdmin
                        ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                        : 'bg-purple-600/30 text-purple-300 border border-purple-500/30'
                    }`}>
                      {(msg.senderName || '?')[0].toUpperCase()}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[75%] space-y-1 ${isMyMsg ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`flex items-center gap-2 text-[10px] ${isMyMsg ? 'flex-row-reverse' : ''}`}>
                        <span className={`font-bold ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>{msg.senderName}</span>
                        <span className={`px-1.5 py-0.5 rounded font-bold ${msgIsAdmin ? 'bg-blue-500/10 text-blue-400' : 'bg-purple-500/10 text-purple-400'}`}>
                          {msgIsAdmin ? 'ADMIN' : 'DEPT'}
                        </span>
                        <span className={isLight ? 'text-slate-400' : 'text-slate-500'}>{formatTime(msg.timestamp)}</span>
                      </div>
                      <div className={`px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                        isMyMsg
                          ? isLight
                            ? 'bg-blue-600 text-white rounded-tr-sm'
                            : 'bg-blue-600/80 text-white rounded-tr-sm'
                          : isLight
                            ? 'bg-slate-100 text-slate-800 border border-slate-200 rounded-tl-sm'
                            : 'bg-white/6 text-slate-200 border border-white/8 rounded-tl-sm'
                      }`}>
                        {msg.message}
                      </div>
                      {msg.attachment && (
                        <div className={`flex items-center gap-1.5 text-[10px] ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
                          <Paperclip className="w-3 h-3" />
                          {msg.attachment}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={threadEndRef} />
            </div>

            {/* ── Reply Box ── */}
            <div className={`px-4 py-4 border-t shrink-0 ${isLight ? 'border-slate-200 bg-white' : 'border-white/8 bg-[#0a0f1d]'}`}>
              {isClosed ? (
                <div className={`flex items-center gap-2 justify-center py-2 text-xs ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  <Lock className="w-3.5 h-3.5" />
                  Thread locked — report is closed
                </div>
              ) : (
                <div className="flex gap-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                    placeholder="Type your reply... (Enter to send, Shift+Enter for new line)"
                    rows={2}
                    className={`flex-1 text-xs px-3 py-2.5 rounded-xl border outline-none resize-none ${inputCls}`}
                  />
                  <button
                    onClick={handleReply}
                    disabled={!replyText.trim() || replyMutation.isPending}
                    className={`w-10 h-10 self-end rounded-xl flex items-center justify-center transition-all ${
                      replyText.trim() && !replyMutation.isPending
                        ? 'bg-blue-600 hover:bg-blue-500 text-white cursor-pointer shadow-lg'
                        : 'bg-slate-700/40 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
