import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  MapPin,
  Building,
  CheckCircle2,
  Clock,
  Send,
  Sparkles,
  Info,
  Calendar,
  Layers,
  AlertTriangle,
  FileText,
  User,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { gapAnalysisAPI } from '../../api';

const STATUS_CONFIG = {
  GENERATED: { label: 'Generated', cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  SENT: { label: 'Dispatched to Dept', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  ACKNOWLEDGED: { label: 'Acknowledged', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
  IN_PROGRESS: { label: 'In Progress', cls: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  RESOLVED: { label: 'Resolved', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
};

export default function GapReportDetailModal({
  isOpen,
  onClose,
  reportId,
  user,
  onStatusUpdated,
  isLight = false,
}) {
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const userRole = String(user?.role || '').toUpperCase();
  const isAdmin = ['ADMIN', 'SUPERADMIN'].includes(userRole);

  // Fetch report by ID
  React.useEffect(() => {
    if (!isOpen || !reportId) return;

    setIsLoading(true);
    gapAnalysisAPI
      .getById(reportId)
      .then((res) => {
        setReport(res.data?.data || null);
      })
      .catch((err) => {
        console.error('Failed to load gap analysis report:', err);
        toast.error('Could not load report details');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen, reportId]);

  if (!isOpen) return null;

  const handleStatusChange = async (nextStatus) => {
    if (!report) return;

    try {
      setIsUpdatingStatus(true);
      toast.loading(`Updating report status to ${nextStatus}...`, { id: 'status-update' });

      const res = await gapAnalysisAPI.updateStatus(report.reportId || report._id, {
        status: nextStatus,
        message: responseText.trim() || undefined,
      });

      setReport(res.data?.data);
      setResponseText('');
      toast.success(`Report status updated to ${nextStatus}`, { id: 'status-update' });

      if (onStatusUpdated) onStatusUpdated();
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || 'Failed to update report status.',
        { id: 'status-update' }
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const statusCfg = STATUS_CONFIG[report?.status] || STATUS_CONFIG.GENERATED;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className={`w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-2xl transition-all ${
          isLight
            ? 'bg-white border-slate-200 text-slate-900 shadow-slate-300/50'
            : 'bg-[#0f1424] border-white/15 text-slate-100 shadow-black/80'
        }`}
      >
        {/* Header */}
        <div className="p-5 border-b border-inherit flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                isLight
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
              }`}
            >
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-xs text-cyan-400">
                  {report?.reportId || 'Loading...'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusCfg.cls}`}>
                  {statusCfg.label}
                </span>
              </div>
              <h3 className="text-base font-black tracking-tight">
                {report?.location?.name || 'Surveillance Gap Analysis'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading || !report ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-400">Loading authoritative surveillance report...</p>
            </div>
          ) : (
            <>
              {/* Top Overview Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div
                  className={`p-3.5 rounded-2xl border ${
                    isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-slate-400">Analysis Radius</span>
                  <div className="text-lg font-black font-mono mt-1 text-white">
                    {report.radiusMeters >= 1000 ? `${(report.radiusMeters / 1000).toFixed(1)} km` : `${report.radiusMeters} m`}
                  </div>
                  <div className="text-[10px] text-slate-500">{report.summary?.totalAreaSqKm} km² perimeter</div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border ${
                    isLight ? 'bg-blue-50/50 border-blue-200' : 'bg-cyan-500/10 border-cyan-500/20'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-cyan-400">Coverage Score</span>
                  <div className="text-2xl font-black font-mono mt-1 text-cyan-300">
                    {report.summary?.coverageScore}/100
                  </div>
                  <div className="text-[10px] text-cyan-500/80">Spatial optical rating</div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border ${
                    isLight ? 'bg-emerald-50/50 border-emerald-200' : 'bg-emerald-500/10 border-emerald-500/20'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-emerald-400">Active Cameras</span>
                  <div className="text-lg font-black font-mono mt-1 text-emerald-400">
                    {report.summary?.activeCameras} / {report.summary?.totalCameras}
                  </div>
                  <div className="text-[10px] text-emerald-500/80">Operational units</div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border ${
                    isLight ? 'bg-red-50/50 border-red-200' : 'bg-red-500/10 border-red-500/20'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase text-red-400">Critical Gaps</span>
                  <div className="text-lg font-black font-mono mt-1 text-red-400">
                    {report.summary?.criticalGaps}
                  </div>
                  <div className="text-[10px] text-red-500/80">&gt;600m blind spots</div>
                </div>
              </div>

              {/* Admin Tactical Instructions Box */}
              {report.adminMessage && (
                <div
                  className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    isLight ? 'bg-blue-50/70 border-blue-200' : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <Building className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">
                      State Command Instructions (From Admin)
                    </span>
                    <p className="text-xs text-slate-200 mt-1 leading-relaxed">
                      "{report.adminMessage}"
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1">
                      Dispatched by: <strong className="text-slate-300">{report.createdBy?.name}</strong> ·{' '}
                      {report.sentAt ? new Date(report.sentAt).toLocaleString('en-IN') : 'Pending dispatch'}
                    </div>
                  </div>
                </div>
              )}

              {/* Contributing Factors */}
              <div
                className={`p-4 rounded-2xl border space-y-2 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/3 border-white/6'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <Info className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Coverage Analysis & Ground Factors</span>
                </div>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                  {(report.scoreFactors || []).map((factor, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Detected Gaps Details */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Identified Deployment Gaps ({(report.gaps || []).length})
                </h5>
                <div className="overflow-x-auto rounded-2xl border border-inherit">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className={isLight ? 'bg-slate-100 text-slate-700' : 'bg-white/5 text-slate-300'}>
                        <th className="py-2.5 px-3 font-bold">Gap ID</th>
                        <th className="py-2.5 px-3 font-bold">Sector</th>
                        <th className="py-2.5 px-3 font-bold">Severity</th>
                        <th className="py-2.5 px-3 font-bold text-right">Nearby Cams</th>
                        <th className="py-2.5 px-3 font-bold text-right">Nearest Camera</th>
                        <th className="py-2.5 px-4 font-bold">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-inherit">
                      {(report.gaps || []).map((gap) => (
                        <tr key={gap.gapId} className={isLight ? 'hover:bg-slate-50' : 'hover:bg-white/3'}>
                          <td className="py-2.5 px-3 font-mono font-bold text-cyan-400">{gap.gapId}</td>
                          <td className="py-2.5 px-3">{gap.zoneName}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                                gap.severity === 'Critical'
                                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                                  : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {gap.severity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{gap.nearbyCamerasCount}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-400">
                            {gap.nearestCameraDistanceMeters} m
                          </td>
                          <td className="py-2.5 px-4 text-slate-300">{gap.recommendation}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Department Response & Status Action Section */}
              <div
                className={`p-4 rounded-2xl border space-y-3 ${
                  isLight ? 'bg-slate-50 border-slate-200' : 'bg-white/4 border-white/8'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Department Action & Status Lifecycle
                  </span>
                  <span className="text-xs text-blue-400 font-bold">
                    Assigned: {report.responsibleDepartment?.name}
                  </span>
                </div>

                {/* Responses Thread */}
                {(report.departmentResponses || []).length > 0 && (
                  <div className="space-y-2 pt-1 border-t border-inherit">
                    <span className="text-[10px] font-bold uppercase text-slate-400">Response History</span>
                    {(report.departmentResponses || []).map((resp, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl text-xs border ${
                          isLight ? 'bg-white border-slate-200' : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                          <span className="font-bold text-slate-300">{resp.senderName} ({resp.senderDepartment})</span>
                          <span>{new Date(resp.timestamp).toLocaleString('en-IN')}</span>
                        </div>
                        <p className="text-slate-200">{resp.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Update Actions */}
                <div className="pt-2 space-y-2">
                  <input
                    type="text"
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder="Add operational notes or deployment status updates..."
                    className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900 focus:border-blue-500'
                        : 'bg-white/5 border-white/10 text-white focus:border-cyan-500'
                    }`}
                  />

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {report.status === 'SENT' && (
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleStatusChange('ACKNOWLEDGED')}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white transition-colors cursor-pointer"
                      >
                        Acknowledge Report
                      </button>
                    )}

                    {(report.status === 'SENT' || report.status === 'ACKNOWLEDGED') && (
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleStatusChange('IN_PROGRESS')}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors cursor-pointer"
                      >
                        Mark In Progress (Survey/Deployment)
                      </button>
                    )}

                    {report.status !== 'RESOLVED' && (
                      <button
                        type="button"
                        disabled={isUpdatingStatus}
                        onClick={() => handleStatusChange('RESOLVED')}
                        className="px-4 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                      >
                        Resolve & Close Gap
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className={`p-4 border-t border-inherit flex items-center justify-between shrink-0 ${isLight ? 'bg-slate-50' : 'bg-[#090d18]'}`}>
          <div className="text-[11px] text-slate-400">
            Section 65B Certified Spatial Report · State Command & Control Center
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
            }`}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
