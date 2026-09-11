import React, { useState } from 'react';
import {
  X,
  Send,
  Building,
  ShieldAlert,
  FileText,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { gapAnalysisAPI } from '../../api';

export default function SendGapReportModal({
  isOpen,
  onClose,
  report = null,
  onSuccess,
  isLight = false,
}) {
  const [adminMessage, setAdminMessage] = useState(
    'Please review the identified surveillance gaps and evaluate camera deployment requirements.'
  );
  const [isSending, setIsSending] = useState(false);

  if (!isOpen || !report) return null;

  const department = report.responsibleDepartment || {
    name: 'Gujarat Police Department',
    code: 'POLICE',
  };

  const handleSend = async (e) => {
    e.preventDefault();

    try {
      setIsSending(true);
      toast.loading(`Dispatching ${report.reportId} to ${department.name}...`, { id: 'send-gap-report' });

      await gapAnalysisAPI.send(report.reportId || report._id, {
        departmentCode: department.code,
        adminMessage,
      });

      toast.success(
        `Surveillance Gap Report ${report.reportId} dispatched to ${department.name}!`,
        { id: 'send-gap-report' }
      );

      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || 'Failed to dispatch report to department.',
        { id: 'send-gap-report' }
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-lg rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl transition-all ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50'
            : 'bg-[#0f1424] border-white/15 text-slate-100 shadow-black/80'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-inherit flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                isLight
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
              }`}
            >
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black">Send Gap Analysis Report</h3>
              <p className="text-[11px] text-slate-400">Departmental Escalation & Deployment Request</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSend} className="p-5 space-y-4">
          {/* Summary Box */}
          <div
            className={`p-4 rounded-2xl border space-y-2.5 ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'
            }`}
          >
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Report</span>
                <div className="font-mono font-bold text-cyan-400">{report.reportId}</div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Location</span>
                <div className="font-bold truncate text-white">{report.location?.name || 'Selected Location'}</div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Analysis Radius</span>
                <div className="font-bold text-slate-300">
                  {report.radiusMeters >= 1000
                    ? `${(report.radiusMeters / 1000).toFixed(1)} km`
                    : `${report.radiusMeters} m`}
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Critical Gaps</span>
                <div className="font-mono font-bold text-rose-400">
                  {report.summary?.criticalGaps ?? 0}
                </div>
              </div>

              <div className="col-span-2 pt-1 border-t border-inherit flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Responsible Department</span>
                  <div className="font-bold text-blue-400">{department.name}</div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Coverage Score</span>
                  <div className="font-mono font-black text-cyan-400">
                    {report.summary?.coverageScore ?? 0}/100
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions / Message */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Message / Instructions for Department
            </label>
            <textarea
              rows={3}
              value={adminMessage}
              onChange={(e) => setAdminMessage(e.target.value)}
              placeholder="Provide tactical instructions for the department nodal officer..."
              className={`w-full p-3 rounded-2xl text-xs border outline-none resize-none leading-relaxed transition-all ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                  : 'bg-white/5 border-white/10 text-white focus:border-cyan-500'
              }`}
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
              }`}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSending}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-all cursor-pointer shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{isSending ? 'Sending...' : 'Send to Department'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
