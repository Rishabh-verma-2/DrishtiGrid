import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { deptReportAPI } from '../../api';
import useAuthStore from '../../store/authStore';
import { useThemeStore } from '../../store/themeStore';
import {
  X, Flag, AlertTriangle, Camera, Building, User, ChevronDown,
  Send, CheckCircle2, FileWarning, Paperclip, Loader2, ExternalLink,
  AlertCircle, ShieldOff, Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';

const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];
const CATEGORIES = [
  'Camera Offline',
  'Feed Malfunction',
  'Hardware Maintenance',
  'Power/Connectivity',
  'Vandalism/Physical Damage',
  'Other',
];

const PRIORITY_STYLES = {
  Low:      'bg-slate-500/15 text-slate-400 border-slate-500/25',
  Medium:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  High:     'bg-amber-500/15 text-amber-400 border-amber-500/25',
  Critical: 'bg-red-500/15 text-red-400 border-red-500/25',
};

const STATUS_BADGE = {
  offline:     { label: 'Offline',     cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  maintenance: { label: 'Maintenance', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  fault:       { label: 'Fault',       cls: 'bg-rose-500/15 text-rose-400 border-rose-500/25' },
};

export default function ReportToDeptModal({ isOpen, onClose, camera }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { theme } = useThemeStore();
  const isLight = theme === 'light';
  const fileInputRef = useRef(null);

  const [priority, setPriority] = useState('High');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [createdReport, setCreatedReport] = useState(null);

  // Reset on open/camera change
  useEffect(() => {
    if (isOpen) {
      setPriority('High');
      setCategory('');
      setDescription('');
      setAttachedFile(null);
      setSubmitted(false);
      setCreatedReport(null);
    }
  }, [isOpen, camera?.cameraId]);

  const createMutation = useMutation({
    mutationFn: (payload) => deptReportAPI.create(payload),
    onSuccess: (res) => {
      const data = res.data;
      if (data.success) {
        setCreatedReport(data);
        setSubmitted(true);
        queryClient.invalidateQueries({ queryKey: ['dept-reports'] });
        toast.success(`Report ${data.reportId} dispatched!`);
      }
    },
    onError: (err) => {
      const data = err.response?.data;
      if (data?.errorCode === 'DEPARTMENT_USER_NOT_FOUND') return; // handled inline
      if (data?.errorCode === 'DUPLICATE_OPEN_REPORT') {
        toast.error(`Open report already exists: ${data.existingReportId}`);
      } else {
        toast.error(data?.message || 'Failed to create report');
      }
    },
  });

  if (!isOpen || !camera) return null;

  // Role guard — should never render for non-admin, but defensive check
  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);
  if (!isAdmin) return null;

  const camStatus = (camera.status || '').toLowerCase();
  const statusInfo = STATUS_BADGE[camStatus] || { label: camStatus, cls: 'bg-slate-500/15 text-slate-400 border-slate-500/25' };
  const departmentName = camera.departmentName || 'Unknown Department';
  const isUnresolved = createMutation.error?.response?.data?.errorCode === 'DEPARTMENT_USER_NOT_FOUND';
  const unresolvedData = createMutation.error?.response?.data;

  const canSubmit =
    description.length >= 20 &&
    category.length > 0 &&
    !createMutation.isPending;

  const handleSubmit = () => {
    createMutation.mutate({
      cameraId: camera.cameraId,
      priority,
      category,
      description,
      attachments: attachedFile ? [attachedFile.name] : [],
    });
  };

  const cardCls = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0d1322]/95 border-white/10 text-slate-100';

  const inputCls = isLight
    ? 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-blue-500'
    : 'bg-white/5 border-white/10 text-slate-200 placeholder:text-slate-500 focus:border-red-500/60';

  const labelCls = isLight ? 'text-slate-700 font-semibold' : 'text-slate-300 font-semibold';

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-[580px] max-h-[92vh] overflow-y-auto rounded-3xl border shadow-2xl flex flex-col ${cardCls}`}
        style={{ boxShadow: isLight ? undefined : '0 0 60px rgba(239,68,68,0.12), 0 25px 50px rgba(0,0,0,0.5)' }}
      >
        {/* ── Header ── */}
        <div className={`sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b ${isLight ? 'bg-white border-slate-200' : 'bg-[#0d1322] border-white/8'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-red-500/15 border border-red-500/30 flex items-center justify-center">
              <Flag className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h2 className={`text-sm font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Report to Department
              </h2>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Formal escalation for Maintenance / Offline camera
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

        {/* ── Success State ── */}
        {submitted && createdReport && (
          <div className="p-6 flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h3 className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                Report Dispatched Successfully
              </h3>
              <p className={`text-xs mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {createdReport.message}
              </p>
            </div>

            <div className={`w-full p-4 rounded-2xl border space-y-2 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'}`}>
              <div className="flex items-center justify-between">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Report ID</span>
                <span className={`font-mono font-bold ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{createdReport.reportId}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Recipient Department</span>
                <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>{createdReport.recipientDepartment}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Status</span>
                <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/25 font-bold text-[11px]">Open</span>
              </div>
            </div>

            <button
              onClick={() => { onClose(); navigate(`/reports?tab=escalations`); }}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <ExternalLink className="w-4 h-4" />
              View in Escalations Inbox
            </button>
            <button
              onClick={onClose}
              className={`w-full py-2 rounded-xl text-xs font-semibold border cursor-pointer transition-colors ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
            >
              Close
            </button>
          </div>
        )}

        {/* ── Composer Form ── */}
        {!submitted && (
          <div className="p-6 space-y-5">

            {/* ─ Camera Reference (read-only) ─ */}
            <div className={`p-4 rounded-2xl border space-y-2 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'}`}>
              <div className={`flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <Camera className="w-3.5 h-3.5" />
                Camera Reference (Auto-filled · Read-only)
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1">
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Camera ID</span>
                  <p className={`font-mono font-bold text-[12px] mt-0.5 ${isLight ? 'text-blue-700' : 'text-blue-400'}`}>{camera.cameraId}</p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Current Status</span>
                  <div className="mt-0.5">
                    <span className={`px-2 py-0.5 rounded-full border font-bold text-[10px] ${statusInfo.cls}`}>
                      {statusInfo.label.toUpperCase()}
                    </span>
                  </div>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Location Name</span>
                  <p className={`font-semibold mt-0.5 truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                    {camera.locationName || camera.name || '—'}
                  </p>
                </div>
                <div>
                  <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>Landmark</span>
                  <p className={`font-semibold mt-0.5 truncate ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                    {camera.landmark || '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* ─ Recipient Department (read-only) ─ */}
            <div className={`p-4 rounded-2xl border space-y-2 text-xs ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'}`}>
              <div className={`flex items-center gap-2 font-bold uppercase tracking-wider text-[10px] ${isLight ? 'text-purple-700' : 'text-purple-400'}`}>
                <Building className="w-3.5 h-3.5" />
                Recipient Department (Auto-resolved · Read-only)
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className={`text-base font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {departmentName}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${isLight ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-purple-500/15 text-purple-400 border-purple-500/25'}`}>
                  DEPT OWNER
                </span>
              </div>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Resolved from camera record. Cannot be changed — prevents misrouting.
              </p>
            </div>

            {/* ─ Department unresolved error ─ */}
            {isUnresolved && (
              <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-3 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="text-xs font-bold text-amber-300">Department User Not Found</span>
                </div>
                <p className="text-xs text-amber-200/80 leading-relaxed">
                  ⚠️ No registered user found for <strong>"{unresolvedData?.attemptedDepartment}"</strong>. 
                  This report cannot be delivered until a department user is added in User Management.
                </p>
                <button
                  onClick={() => { onClose(); navigate('/users'); }}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 cursor-pointer transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Go to User Management
                </button>
              </div>
            )}

            {/* ─ Priority ─ */}
            <div className="space-y-1.5">
              <label className={`text-xs block ${labelCls}`}>Priority</label>
              <div className="grid grid-cols-4 gap-2">
                {PRIORITIES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                      priority === p
                        ? PRIORITY_STYLES[p] + ' ring-1 ring-current'
                        : isLight
                          ? 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                          : 'bg-white/4 border-white/8 text-slate-400 hover:bg-white/8'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* ─ Issue Category ─ */}
            <div className="space-y-1.5">
              <label className={`text-xs block ${labelCls}`}>Issue Category *</label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full text-xs px-3 py-2.5 rounded-xl border outline-none appearance-none cursor-pointer ${inputCls}`}
                >
                  <option value="">Select issue category...</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <ChevronDown className={`w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${isLight ? 'text-slate-500' : 'text-slate-400'}`} />
              </div>
            </div>

            {/* ─ Description ─ */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className={`text-xs ${labelCls}`}>Description *</label>
                <span className={`text-[11px] font-mono ${description.length >= 20 ? 'text-emerald-400' : isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                  {description.length} / min 20
                </span>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue in detail — include any observations, previous maintenance attempts, or urgency context (min 20 characters)..."
                rows={4}
                className={`w-full text-xs px-3 py-2.5 rounded-xl border outline-none resize-none leading-relaxed ${inputCls}`}
              />
            </div>

            {/* ─ Evidence Upload ─ */}
            <div className="space-y-1.5">
              <label className={`text-xs block ${labelCls}`}>Attach Screenshot / Evidence <span className="font-normal opacity-60">(optional)</span></label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,.pdf"
                className="hidden"
                onChange={(e) => setAttachedFile(e.target.files[0] || null)}
              />
              {attachedFile ? (
                <div className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs ${isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'}`}>
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate font-semibold">{attachedFile.name}</span>
                  <button
                    onClick={() => { setAttachedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="ml-auto shrink-0 cursor-pointer hover:opacity-70"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-3 rounded-xl border-2 border-dashed text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                    isLight
                      ? 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50'
                      : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300'
                  }`}
                >
                  <Paperclip className="w-4 h-4" />
                  Click to attach evidence file
                </button>
              )}
            </div>

            {/* ─ Action Buttons ─ */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${isLight ? 'border-slate-200 text-slate-600 hover:bg-slate-50' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className={`flex-1 py-2.5 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                  canSubmit
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30 cursor-pointer'
                    : 'bg-slate-700/50 text-slate-500 cursor-not-allowed border border-white/5'
                }`}
              >
                {createMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Dispatching...</>
                ) : (
                  <><Flag className="w-4 h-4" /> Send Report</>
                )}
              </button>
            </div>

            {!canSubmit && !createMutation.isPending && (
              <p className={`text-[11px] text-center ${isLight ? 'text-slate-400' : 'text-slate-500'}`}>
                {!category ? 'Select an issue category' : description.length < 20 ? `Description needs ${20 - description.length} more characters` : ''}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
